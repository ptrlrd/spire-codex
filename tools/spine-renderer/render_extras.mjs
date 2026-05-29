import { createCanvas, loadImage } from "canvas";
import {
  TextureAtlas, AtlasAttachmentLoader, SkeletonBinary, Skeleton,
  AnimationState, AnimationStateData, SkeletonRenderer, Texture, Physics,
} from "@esotericsoftware/spine-canvas";
import fs from "node:fs";
import path from "node:path";

class NodeTexture extends Texture {
  constructor(image) { super(image); }
  setFilters() {}
  setWraps() {}
  dispose() {}
}

const BASE = path.resolve("/Users/peterlord/Documents/Projects/spire-codex");
const ANIM = path.join(BASE, "extraction/raw/animations");
const IMG = path.join(BASE, "backend/static/images");
const OUTPUT_WIDTH = 512;
const OUTPUT_HEIGHT = 512;
const SUPERSAMPLE = 2;
const RENDER_WIDTH = OUTPUT_WIDTH * SUPERSAMPLE;
const RENDER_HEIGHT = OUTPUT_HEIGHT * SUPERSAMPLE;
const PADDING = 20 * SUPERSAMPLE;

async function render(dir, skelName, outPath) {
  const skelPath = path.join(dir, skelName + ".skel");
  const atlasPath = path.join(dir, skelName + ".atlas");

  if (!fs.existsSync(skelPath) || !fs.existsSync(atlasPath)) {
    console.log("  SKIP " + skelName + ": missing files");
    return false;
  }

  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const atlas = new TextureAtlas(atlasText);

  // Load all PNGs referenced by atlas pages
  for (const page of atlas.pages) {
    const pngPath = path.join(dir, page.name);
    if (!fs.existsSync(pngPath)) {
      console.log("  SKIP " + skelName + ": missing " + page.name);
      return false;
    }
    const img = await loadImage(pngPath);
    page.setTexture(new NodeTexture(img));
  }

  const loader = new AtlasAttachmentLoader(atlas);
  const bin = new SkeletonBinary(loader);
  const skelData = bin.readSkeletonData(new Uint8Array(fs.readFileSync(skelPath)));
  const skeleton = new Skeleton(skelData);
  skeleton.setToSetupPose();

  const stateData = new AnimationStateData(skelData);
  const state = new AnimationState(stateData);
  const anims = skelData.animations.map(a => a.name);

  const idleNames = ["idle_loop", "idle", "Idle_loop", "Idle", "animation", "loop"];
  let found = false;
  for (const n of idleNames) {
    if (skelData.findAnimation(n)) { state.setAnimation(0, n, false); state.apply(skeleton); found = true; break; }
  }
  if (!found && anims.length > 0) {
    state.setAnimation(0, anims[0], false);
    state.apply(skeleton);
  }
  skeleton.updateWorldTransform(Physics.reset);

  const SHADOW = new Set(["shadow", "shadow2", "ground", "ground_shadow"]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const slot of skeleton.slots) {
    const att = slot.getAttachment();
    if (!att || !att.computeWorldVertices) continue;
    const sn = slot.data.name.toLowerCase(), an = (att.name || "").toLowerCase();
    if (SHADOW.has(sn) || SHADOW.has(an)) continue;
    const verts = new Float32Array(1000);
    const nf = att.worldVerticesLength || 8;
    try {
      att.computeWorldVertices(slot, 0, nf, verts, 0, 2);
      for (let i = 0; i < nf; i += 2) {
        if (verts[i] < minX) minX = verts[i];
        if (verts[i] > maxX) maxX = verts[i];
        if (verts[i+1] < minY) minY = verts[i+1];
        if (verts[i+1] > maxY) maxY = verts[i+1];
      }
    } catch {}
  }

  if (!isFinite(minX)) { console.log("  SKIP " + skelName + ": no bounds"); return false; }

  const sw = maxX - minX, sh = maxY - minY;
  const avail = RENDER_WIDTH - PADDING * 2;
  const scale = Math.min(avail / sw, avail / sh);

  const canvas = createCanvas(RENDER_WIDTH, RENDER_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
  ctx.save();
  ctx.translate(RENDER_WIDTH/2, RENDER_HEIGHT/2);
  ctx.scale(scale, -scale);
  ctx.translate(-(minX+maxX)/2, -(minY+maxY)/2);
  const renderer = new SkeletonRenderer(ctx);
  renderer.triangleRendering = true;
  renderer.draw(skeleton);
  ctx.restore();

  const out = createCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const oc = out.getContext("2d");
  oc.drawImage(canvas, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out.toBuffer("image/png"));
  console.log("  OK " + skelName + " (" + sw.toFixed(0) + "x" + sh.toFixed(0) + ") -> " + path.basename(outPath));
  return true;
}

async function main() {
  // 1. Combat character poses
  console.log("\n=== COMBAT CHARACTERS ===");
  for (const char of ["ironclad", "silent", "defect", "necrobinder", "regent"]) {
    const dir = path.join(ANIM, "characters", char);
    await render(dir, char, path.join(IMG, "characters", "combat_" + char + ".png"));
  }
  // Regent weapon
  await render(path.join(ANIM, "characters/regent"), "regent_weapon", path.join(IMG, "characters", "combat_regent_weapon.png"));

  // 2. Character select poses
  console.log("\n=== CHARACTER SELECT ===");
  for (const char of ["ironclad", "silent", "defect", "necrobinder", "regent"]) {
    const dir = path.join(ANIM, "character_select", char);
    await render(dir, "characterselect_" + char, path.join(IMG, "characters", "select_" + char + ".png"));
  }

  // 3. Neow
  console.log("\n=== NEOW ===");
  await render(path.join(ANIM, "backgrounds/neow_room"), "neow", path.join(IMG, "misc", "neow.png"));

  // 4. Tezcatara
  console.log("\n=== TEZCATARA ===");
  await render(path.join(ANIM, "backgrounds/tezcatara"), "tezcatara", path.join(IMG, "misc", "tezcatara.png"));

  // 5. Treasure chests
  console.log("\n=== TREASURE CHESTS ===");
  for (const act of [1, 2, 3]) {
    const dir = path.join(ANIM, "backgrounds/treasure_room");
    await render(dir, "chest_room_act_" + act, path.join(IMG, "misc", "chest_act_" + act + ".png"));
  }

  // 6. Boss map icons
  console.log("\n=== BOSS MAP ICONS ===");
  await render(path.join(ANIM, "map/ceremonial_beast_boss"), "ceremonial_beast_boss_node", path.join(IMG, "misc", "boss_icon_ceremonial_beast.png"));
  await render(path.join(ANIM, "map/queen_boss"), "queen_boss_node", path.join(IMG, "misc", "boss_icon_queen.png"));
  await render(path.join(ANIM, "map/the_insatiable_boss"), "the_insatiable_boss_node", path.join(IMG, "misc", "boss_icon_the_insatiable.png"));

  // 7. Ceremonial beast background
  console.log("\n=== CEREMONIAL BEAST BG ===");
  const cbDir = path.join(ANIM, "backgrounds/ceremonial_beast");
  await render(cbDir, "ceremonial_beast_bg_animation_top", path.join(IMG, "misc", "ceremonial_beast_bg_top.png"));
  await render(cbDir, "ceremonial_beast_bg_animation_bottom", path.join(IMG, "misc", "ceremonial_beast_bg_bottom.png"));

  // 8. MegaCrit logo
  console.log("\n=== LOGO ===");
  await render(path.join(ANIM, "ui/logo"), "logo_megacrit_animate", path.join(IMG, "misc", "megacrit_logo.png"));
}

main().catch(console.error);
