/**
 * Render any Spine skeleton at high resolution (2048x2048).
 * Usage: node render_hires.mjs <skel_dir> <output_path>
 * Example: node render_hires.mjs ../../extraction/raw/animations/backgrounds/tezcatara ../../backend/static/images/misc/tezcatara.png
 */
import { createCanvas, loadImage } from "canvas";
import {
  TextureAtlas, AtlasAttachmentLoader, SkeletonBinary, Skeleton,
  AnimationState, AnimationStateData, Texture, Physics,
  RegionAttachment,
} from "@esotericsoftware/spine-canvas";
import fs from "node:fs";
import path from "node:path";
import { renderSkeleton, imageDataToPng } from "./render_utils.mjs";

const OUTPUT_WIDTH = 2048;
const OUTPUT_HEIGHT = 2048;
const SUPERSAMPLE = 3;
const RENDER_WIDTH = OUTPUT_WIDTH * SUPERSAMPLE;
const RENDER_HEIGHT = OUTPUT_HEIGHT * SUPERSAMPLE;
const PADDING = 40 * SUPERSAMPLE;
const SHADOW_NAMES = new Set(["shadow", "shadow2", "ground", "ground_shadow"]);
const IDLE_NAMES = ["idle_loop", "idle", "Idle_loop", "Idle", "rest_idle", "rest_loop", "loop", "animation"];

class NodeTexture extends Texture {
  constructor(image) { super(image); }
  setFilters() {}
  setWraps() {}
  dispose() {}
}

async function main() {
  const skelDir = process.argv[2];
  const outputPath = process.argv[3];

  if (!skelDir || !outputPath) {
    console.error("Usage: node render_hires.mjs <skel_dir> <output_path>");
    process.exit(1);
  }

  const resolvedDir = path.resolve(skelDir);
  const dirName = path.basename(resolvedDir);

  // Find .skel file
  const skelFile = fs.readdirSync(resolvedDir).find(f => f.endsWith(".skel") && !f.endsWith(".skel.import"));
  if (!skelFile) {
    console.error("No .skel file found in", resolvedDir);
    process.exit(1);
  }

  const skelPath = path.join(resolvedDir, skelFile);
  const skelName = path.basename(skelFile, ".skel");
  const atlasPath = path.join(resolvedDir, skelName + ".atlas");

  console.log(`Rendering ${skelName} at ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}...`);

  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const atlas = new TextureAtlas(atlasText);

  for (const page of atlas.pages) {
    const pngPath = path.join(resolvedDir, page.name);
    const img = await loadImage(pngPath);
    page.setTexture(new NodeTexture(img));
    console.log(`  Loaded texture: ${page.name} (${img.width}x${img.height})`);
  }

  const loader = new AtlasAttachmentLoader(atlas);
  const bin = new SkeletonBinary(loader);
  const skelData = bin.readSkeletonData(new Uint8Array(fs.readFileSync(skelPath)));

  const skeleton = new Skeleton(skelData);
  const defaultSkin = skelData.findSkin("default");
  if (defaultSkin) {
    skeleton.setSkin(defaultSkin);
    skeleton.setSlotsToSetupPose();
  }
  skeleton.setToSetupPose();

  console.log(`  Animations: ${skelData.animations.map(a => a.name).join(", ")}`);

  const stateData = new AnimationStateData(skelData);
  const state = new AnimationState(stateData);
  for (const name of IDLE_NAMES) {
    if (skelData.findAnimation(name)) {
      state.setAnimation(0, name, false);
      state.apply(skeleton);
      console.log(`  Using animation: ${name}`);
      break;
    }
  }

  skeleton.updateWorldTransform(Physics.reset);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const slot of skeleton.slots) {
    const att = slot.getAttachment();
    if (!att || !att.computeWorldVertices) continue;
    const sn = slot.data.name.toLowerCase();
    const an = (att.name || "").toLowerCase();
    if (SHADOW_NAMES.has(sn) || SHADOW_NAMES.has(an)) continue;
    const verts = new Float32Array(1000);
    try {
      let nf;
      if (att instanceof RegionAttachment) {
        nf = 8;
        att.computeWorldVertices(slot, verts, 0, 2);
      } else {
        nf = att.worldVerticesLength || 8;
        att.computeWorldVertices(slot, 0, nf, verts, 0, 2);
      }
      for (let i = 0; i < nf; i += 2) {
        if (verts[i] < minX) minX = verts[i];
        if (verts[i] > maxX) maxX = verts[i];
        if (verts[i + 1] < minY) minY = verts[i + 1];
        if (verts[i + 1] > maxY) maxY = verts[i + 1];
      }
    } catch {}
  }

  const sw = maxX - minX, sh = maxY - minY;
  const avail = RENDER_WIDTH - PADDING * 2;
  const scale = Math.min(avail / sw, avail / sh);
  console.log(`  Bounds: ${sw.toFixed(0)}x${sh.toFixed(0)}, scale: ${scale.toFixed(2)}`);

  const imgData = renderSkeleton(skeleton, RENDER_WIDTH, RENDER_HEIGHT, scale, minX, minY, maxX, maxY);
  const resolvedOutput = path.resolve(outputPath);
  const buffer = imageDataToPng(imgData, RENDER_WIDTH, RENDER_HEIGHT, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, buffer);
  console.log(`  Saved: ${resolvedOutput} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

main().catch(console.error);
