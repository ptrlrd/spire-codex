/**
 * Headless Spine skeleton renderer.
 * Reads .skel + .atlas + .png for each monster and renders the idle pose to a PNG.
 *
 * Usage: node render.mjs [monster_name]
 *   If no name given, renders all monsters.
 */
import { createCanvas, loadImage, Image } from "canvas";
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
  Skeleton,
  AnimationState,
  AnimationStateData,
  SkeletonRenderer,
  Texture,
  TextureFilter,
  TextureWrap,
  Physics,
  RegionAttachment,
} from "@esotericsoftware/spine-canvas";
import fs from "node:fs";
import path from "node:path";
import { renderSkeleton, imageDataToPng } from "./render_utils.mjs";

const MONSTERS_DIR = path.resolve(
  import.meta.dirname,
  "../../extraction/raw/animations/monsters"
);
const OUTPUT_DIR = path.resolve(
  import.meta.dirname,
  "../../backend/static/images/monsters"
);

const OUTPUT_WIDTH = 512; // final output image size
const OUTPUT_HEIGHT = 512; // final output image size
const SUPERSAMPLE = 2;  // render at Nx and downscale to hide triangle seams
const RENDER_WIDTH = OUTPUT_WIDTH * SUPERSAMPLE;
const RENDER_HEIGHT = OUTPUT_HEIGHT * SUPERSAMPLE;
const PADDING = 20 * SUPERSAMPLE;

/** Minimal Texture wrapper for node-canvas Image */
class NodeTexture extends Texture {
  constructor(image) {
    super(image);
  }
  setFilters(_min, _mag) {}
  setWraps(_u, _v) {}
  dispose() {}
}

function findFile(dir, name, ext) {
  const exact = path.join(dir, `${name}${ext}`);
  if (fs.existsSync(exact)) return exact;
  // Fallback: find any file with matching extension (handles filename mismatches/typos)
  const files = fs.readdirSync(dir).filter(f => f.endsWith(ext) && !f.endsWith(".import"));
  if (files.length > 0) {
    console.log(`  Using fallback ${ext}: ${files[0]}`);
    return path.join(dir, files[0]);
  }
  return null;
}

async function renderMonster(monsterDir, monsterName) {
  const skelPath = findFile(monsterDir, monsterName, ".skel");
  const atlasPath = findFile(monsterDir, monsterName, ".atlas");
  const pngPath = findFile(monsterDir, monsterName, ".png");

  if (!skelPath || !atlasPath || !pngPath) {
    console.warn(`  Skipping ${monsterName}: missing files`);
    return false;
  }

  // Load atlas
  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const atlas = new TextureAtlas(atlasText);

  // Load spritesheet image
  const img = await loadImage(pngPath);

  // Set texture on all atlas pages
  for (const page of atlas.pages) {
    page.setTexture(new NodeTexture(img));
  }

  // Load skeleton binary
  const attachmentLoader = new AtlasAttachmentLoader(atlas);
  const skelBinary = new SkeletonBinary(attachmentLoader);
  const skelBytes = fs.readFileSync(skelPath);
  const skelData = skelBinary.readSkeletonData(new Uint8Array(skelBytes));

  // Create skeleton, apply default skin, and set to setup pose
  const skeleton = new Skeleton(skelData);
  const defaultSkin = skelData.findSkin("default");
  if (defaultSkin) {
    skeleton.setSkin(defaultSkin);
    skeleton.setSlotsToSetupPose();
  }
  skeleton.setToSetupPose();

  // Try to apply idle animation
  const stateData = new AnimationStateData(skelData);
  const state = new AnimationState(stateData);

  const idleNames = ["idle_loop", "idle", "Idle_loop", "Idle"];
  let foundAnim = false;
  for (const name of idleNames) {
    const anim = skelData.findAnimation(name);
    if (anim) {
      state.setAnimation(0, name, false);
      state.apply(skeleton);
      foundAnim = true;
      break;
    }
  }
  if (!foundAnim) {
    // Just use first animation if available
    if (skelData.animations.length > 0) {
      state.setAnimation(0, skelData.animations[0].name, false);
      state.apply(skeleton);
    }
  }

  skeleton.updateWorldTransform(Physics.reset);

  // Compute bounds (exclude shadow/ground/VFX slots for tighter framing)
  const EXCLUDE_EXACT = new Set(["shadow", "shadow2", "ground", "ground_shadow", "main shadow", "sword shadow"]);
  const EXCLUDE_PATTERNS = [/path/i, /whoosh/i, /windpath/i, /vulnerable/i, /projectile/i, /megablade/i, /megatail/i, /whip_path/i];
  function shouldExcludeSlot(slotName, attName) {
    if (EXCLUDE_EXACT.has(slotName) || EXCLUDE_EXACT.has(attName)) return true;
    for (const pat of EXCLUDE_PATTERNS) {
      if (pat.test(slotName) || pat.test(attName)) return true;
    }
    return false;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const slots = skeleton.slots;
  for (const slot of slots) {
    const attachment = slot.getAttachment();
    if (!attachment) continue;
    const slotName = slot.data.name.toLowerCase();
    const attName = (attachment.name || "").toLowerCase();
    if (shouldExcludeSlot(slotName, attName)) continue;
    if (attachment.computeWorldVertices) {
      const verts = new Float32Array(1000);
      try {
        let numFloats;
        if (attachment instanceof RegionAttachment) {
          // RegionAttachment: computeWorldVertices(slot, worldVertices, offset, stride)
          numFloats = 8;
          attachment.computeWorldVertices(slot, verts, 0, 2);
        } else {
          // MeshAttachment: computeWorldVertices(slot, start, count, worldVertices, offset, stride)
          numFloats = attachment.worldVerticesLength || 8;
          attachment.computeWorldVertices(slot, 0, numFloats, verts, 0, 2);
        }
        for (let i = 0; i < numFloats; i += 2) {
          const x = verts[i], y = verts[i + 1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      } catch {
        // skip problematic attachments
      }
    }
  }

  if (!isFinite(minX)) {
    console.warn(`  Skipping ${monsterName}: no renderable attachments`);
    return false;
  }

  // Hide VFX slots so they aren't rendered (but keep shadows — they only affect bounds, not visuals)
  const HIDE_PATTERNS = [/path/i, /whoosh/i, /windpath/i, /vulnerable/i, /projectile/i, /megablade/i, /megatail/i];
  for (const slot of slots) {
    const attachment = slot.getAttachment();
    if (!attachment) continue;
    const slotName = slot.data.name.toLowerCase();
    const attName = (attachment.name || "").toLowerCase();
    for (const pat of HIDE_PATTERNS) {
      if (pat.test(slotName) || pat.test(attName)) {
        slot.setAttachment(null);
        break;
      }
    }
  }

  const skelWidth = maxX - minX;
  const skelHeight = maxY - minY;

  // Calculate canvas size to fit with padding, maintaining aspect ratio
  const availableSize = RENDER_WIDTH - PADDING * 2;
  const scale = Math.min(availableSize / skelWidth, availableSize / skelHeight);

  // Render skeleton (with automatic slot-by-slot fallback for complex meshes)
  const imgData = renderSkeleton(skeleton, RENDER_WIDTH, RENDER_HEIGHT, scale, minX, minY, maxX, maxY);
  const buffer = imageDataToPng(imgData, RENDER_WIDTH, RENDER_HEIGHT, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  // Save to PNG
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, `${monsterName}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`  Rendered ${monsterName} (${skelWidth.toFixed(0)}x${skelHeight.toFixed(0)}) -> ${outPath}`);
  return true;
}

async function main() {
  const targetName = process.argv[2];

  if (targetName) {
    const dir = path.join(MONSTERS_DIR, targetName);
    if (!fs.existsSync(dir)) {
      console.error(`Monster directory not found: ${dir}`);
      process.exit(1);
    }
    await renderMonster(dir, targetName);
  } else {
    console.log("Rendering all monster idle poses...\n");
    const dirs = fs.readdirSync(MONSTERS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    let rendered = 0, skipped = 0;
    for (const name of dirs) {
      const ok = await renderMonster(path.join(MONSTERS_DIR, name), name);
      if (ok) rendered++;
      else skipped++;
    }
    console.log(`\nDone! Rendered: ${rendered}, Skipped: ${skipped}`);
  }
}

main().catch(console.error);
