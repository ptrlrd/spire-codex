/**
 * Universal Spine renderer — finds every .skel file under extraction/raw/animations
 * and renders each one, regardless of naming conventions.
 *
 * Usage: node render_all.mjs [--dry-run]
 */
import { createCanvas, loadImage } from "canvas";
import {
  TextureAtlas, AtlasAttachmentLoader, SkeletonBinary, Skeleton,
  AnimationState, AnimationStateData, SkeletonRenderer, Texture, Physics,
} from "@esotericsoftware/spine-canvas";
import fs from "node:fs";
import path from "node:path";

const BASE = path.resolve(import.meta.dirname, "../..");
const ANIM_ROOT = path.join(BASE, "extraction/raw/animations");
const OUTPUT_ROOT = path.join(BASE, "backend/static/images/renders");

const OUTPUT_SIZE = 512;
const SUPERSAMPLE = 2;
const RENDER_SIZE = OUTPUT_SIZE * SUPERSAMPLE;
const PADDING = 20 * SUPERSAMPLE;
const SHADOW_NAMES = new Set(["shadow", "shadow2", "ground", "ground_shadow"]);
const IDLE_NAMES = ["idle_loop", "idle", "Idle_loop", "Idle", "rest_idle", "rest_loop", "loop", "animation"];

const DRY_RUN = process.argv.includes("--dry-run");

class NodeTexture extends Texture {
  constructor(image) { super(image); }
  setFilters() {}
  setWraps() {}
  dispose() {}
}

async function renderSkel(skelPath, outPath) {
  const dir = path.dirname(skelPath);
  const skelName = path.basename(skelPath, ".skel");
  const atlasPath = path.join(dir, skelName + ".atlas");

  if (!fs.existsSync(atlasPath)) {
    return { status: "skip", reason: "no atlas" };
  }

  // Load atlas and all referenced PNGs
  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const atlas = new TextureAtlas(atlasText);

  for (const page of atlas.pages) {
    const pngPath = path.join(dir, page.name);
    if (!fs.existsSync(pngPath)) {
      return { status: "skip", reason: `missing ${page.name}` };
    }
    const img = await loadImage(pngPath);
    page.setTexture(new NodeTexture(img));
  }

  // Load skeleton
  const loader = new AtlasAttachmentLoader(atlas);
  const bin = new SkeletonBinary(loader);
  let skelData;
  try {
    skelData = bin.readSkeletonData(new Uint8Array(fs.readFileSync(skelPath)));
  } catch (e) {
    return { status: "error", reason: `parse error: ${e.message}` };
  }

  const skeleton = new Skeleton(skelData);
  const defaultSkin = skelData.findSkin("default");
  if (defaultSkin) {
    skeleton.setSkin(defaultSkin);
    skeleton.setSlotsToSetupPose();
  }
  skeleton.setToSetupPose();

  // Apply idle animation
  const stateData = new AnimationStateData(skelData);
  const state = new AnimationState(stateData);
  let foundAnim = false;
  for (const name of IDLE_NAMES) {
    if (skelData.findAnimation(name)) {
      state.setAnimation(0, name, false);
      state.apply(skeleton);
      foundAnim = true;
      break;
    }
  }
  if (!foundAnim && skelData.animations.length > 0) {
    state.setAnimation(0, skelData.animations[0].name, false);
    state.apply(skeleton);
  }

  skeleton.updateWorldTransform(Physics.reset);

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const slot of skeleton.slots) {
    const att = slot.getAttachment();
    if (!att || !att.computeWorldVertices) continue;
    const sn = slot.data.name.toLowerCase();
    const an = (att.name || "").toLowerCase();
    if (SHADOW_NAMES.has(sn) || SHADOW_NAMES.has(an)) continue;
    const verts = new Float32Array(1000);
    const nf = att.worldVerticesLength || 8;
    try {
      att.computeWorldVertices(slot, 0, nf, verts, 0, 2);
      for (let i = 0; i < nf; i += 2) {
        if (verts[i] < minX) minX = verts[i];
        if (verts[i] > maxX) maxX = verts[i];
        if (verts[i + 1] < minY) minY = verts[i + 1];
        if (verts[i + 1] > maxY) maxY = verts[i + 1];
      }
    } catch {}
  }

  if (!isFinite(minX)) {
    return { status: "skip", reason: "no bounds" };
  }

  const sw = maxX - minX, sh = maxY - minY;
  const avail = RENDER_SIZE - PADDING * 2;
  const scale = Math.min(avail / sw, avail / sh);

  const canvas = createCanvas(RENDER_SIZE, RENDER_SIZE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
  ctx.save();
  ctx.translate(RENDER_SIZE / 2, RENDER_SIZE / 2);
  ctx.scale(scale, -scale);
  ctx.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
  const renderer = new SkeletonRenderer(ctx);
  renderer.triangleRendering = true;
  renderer.draw(skeleton);
  ctx.restore();

  const out = createCanvas(OUTPUT_SIZE, OUTPUT_SIZE);
  const oc = out.getContext("2d");
  oc.drawImage(canvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out.toBuffer("image/png"));
  return { status: "ok", size: `${sw.toFixed(0)}x${sh.toFixed(0)}` };
}

function findAllSkels(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllSkels(full));
    } else if (entry.name.endsWith(".skel") && !entry.name.endsWith(".skel.import")) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  const allSkels = findAllSkels(ANIM_ROOT).sort();
  console.log(`Found ${allSkels.length} .skel files\n`);

  let ok = 0, skipped = 0, errored = 0;

  for (const skelPath of allSkels) {
    // Build output path: mirrors directory structure under renders/
    const relPath = path.relative(ANIM_ROOT, skelPath);
    const skelName = path.basename(skelPath, ".skel");
    const relDir = path.dirname(relPath);
    const outPath = path.join(OUTPUT_ROOT, relDir, skelName + ".png");
    const label = path.join(relDir, skelName);

    if (DRY_RUN) {
      console.log(`  [DRY] ${label} -> ${path.relative(BASE, outPath)}`);
      continue;
    }

    const result = await renderSkel(skelPath, outPath);
    if (result.status === "ok") {
      console.log(`  OK  ${label} (${result.size})`);
      ok++;
    } else if (result.status === "skip") {
      console.log(`  SKIP ${label}: ${result.reason}`);
      skipped++;
    } else {
      console.log(`  ERR  ${label}: ${result.reason}`);
      errored++;
    }
  }

  if (!DRY_RUN) {
    console.log(`\nDone! OK: ${ok}, Skipped: ${skipped}, Errors: ${errored}`);
  }
}

main().catch(console.error);
