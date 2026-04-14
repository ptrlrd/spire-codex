/**
 * Batch WebGL Spine renderer — re-renders ALL .skel files using Playwright + spine-webgl.
 * No canvas clip path artifacts, no triangle seams.
 *
 * Usage: node render_all_webgl.mjs [--dry-run]
 */
import { chromium } from "playwright";
import { createCanvas } from "canvas";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(__dirname, "../..");
const ANIM_ROOT = path.join(BASE, "extraction/raw/animations");
const OUTPUT_ROOT = path.join(BASE, "backend/static/images/renders");

const OUTPUT_SIZE = 512;
const IDLE_NAMES = ["idle_loop", "idle", "Idle_loop", "Idle", "rest_idle", "rest_loop", "loop", "animation"];
const SHADOW_NAMES = ["shadow", "shadow2", "shadow_v2", "ground", "ground_shadow"];
const HIDDEN_SLOTS = ["smoketex", "smoke_tex", "smokeplacholder", "smoke_placeholder", "megatail", "megablade"];
const DRY_RUN = process.argv.includes("--dry-run");

function findAllSkels(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findAllSkels(full));
    else if (entry.name.endsWith(".skel") && !entry.name.endsWith(".skel.import")) results.push(full);
  }
  return results;
}

// Load spine-webgl source once
const spineCorePath = path.join(__dirname, "node_modules/@esotericsoftware/spine-webgl/dist/iife/spine-webgl.js");
const spineCoreCode = fs.readFileSync(spineCorePath, "utf-8");

async function renderSkel(page, skelPath, outPath, outputSize) {
  const dir = path.dirname(skelPath);
  const skelName = path.basename(skelPath, ".skel");
  const atlasPath = path.join(dir, skelName + ".atlas");

  if (!fs.existsSync(atlasPath)) return { status: "skip", reason: "no atlas" };

  // Read atlas to find PNG files
  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const pngFiles = [];
  for (const line of atlasText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.endsWith(".png")) pngFiles.push(trimmed);
  }

  // Check all PNGs exist
  for (const png of pngFiles) {
    if (!fs.existsSync(path.join(dir, png))) return { status: "skip", reason: `missing ${png}` };
  }

  // Read files as base64
  const skelData = fs.readFileSync(skelPath);
  const skelB64 = skelData.toString("base64");
  const atlasB64 = Buffer.from(atlasText).toString("base64");
  const textureData = {};
  for (const png of pngFiles) {
    textureData[png] = fs.readFileSync(path.join(dir, png)).toString("base64");
  }

  // Reset page
  await page.evaluate(() => {
    document.body.innerHTML = "";
  });

  const result = await page.evaluate(async (params) => {
    const { skelB64, atlasB64, textureData, outputSize, idleNames, shadowNames, hiddenSlots, spineCoreCode } = params;

    if (!window.spine) {
      eval(spineCoreCode.replace(/^"use strict";\s*var spine\s*=/, "window.spine ="));
    }
    const spine = window.spine;

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    document.body.appendChild(canvas);

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
             || canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return { error: "WebGL not available" };

    const mvp = new spine.Matrix4();
    const shader = spine.Shader.newTwoColoredTextured(gl);
    const batcher = new spine.PolygonBatcher(gl);
    const renderer = new spine.SkeletonRenderer(gl);

    // Load textures
    const loadedTextures = {};
    for (const [name, b64] of Object.entries(textureData)) {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = "data:image/png;base64," + b64;
      });
      loadedTextures[name] = new spine.GLTexture(gl, img);
    }

    const rawAtlas = atob(atlasB64);
    const atlas = new spine.TextureAtlas(rawAtlas);
    for (const page of atlas.pages) {
      const tex = loadedTextures[page.name];
      if (tex) page.setTexture(tex);
    }

    const loader = new spine.AtlasAttachmentLoader(atlas);
    const bin = new spine.SkeletonBinary(loader);
    const skelBytes = Uint8Array.from(atob(skelB64), c => c.charCodeAt(0));
    let skelData;
    try {
      skelData = bin.readSkeletonData(skelBytes);
    } catch (e) {
      return { error: "parse error: " + e.message };
    }

    const skeleton = new spine.Skeleton(skelData);
    const defaultSkin = skelData.findSkin("default");
    if (defaultSkin) {
      skeleton.setSkin(defaultSkin);
      skeleton.setSlotsToSetupPose();
    }
    skeleton.setToSetupPose();

    const stateData = new spine.AnimationStateData(skelData);
    const state = new spine.AnimationState(stateData);
    for (const name of idleNames) {
      if (skelData.findAnimation(name)) {
        state.setAnimation(0, name, false);
        state.apply(skeleton);
        break;
      }
    }
    if (skelData.animations.length > 0 && !state.tracks[0]) {
      state.setAnimation(0, skelData.animations[0].name, false);
      state.apply(skeleton);
    }

    skeleton.updateWorldTransform(spine.Physics.reset);

    // Compute bounds excluding shadows
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const slot of skeleton.slots) {
      const att = slot.getAttachment();
      if (!att || !att.computeWorldVertices) continue;
      const sn = slot.data.name.toLowerCase();
      const an = (att.name || "").toLowerCase();
      if (shadowNames.includes(sn) || shadowNames.includes(an)) continue;
      const verts = new Float32Array(1000);
      try {
        if (att instanceof spine.RegionAttachment) {
          att.computeWorldVertices(slot, verts, 0, 2);
          for (let i = 0; i < 8; i += 2) {
            if (verts[i] < minX) minX = verts[i]; if (verts[i] > maxX) maxX = verts[i];
            if (verts[i+1] < minY) minY = verts[i+1]; if (verts[i+1] > maxY) maxY = verts[i+1];
          }
        } else {
          const nf = att.worldVerticesLength || 8;
          att.computeWorldVertices(slot, 0, nf, verts, 0, 2);
          for (let i = 0; i < nf; i += 2) {
            if (verts[i] < minX) minX = verts[i]; if (verts[i] > maxX) maxX = verts[i];
            if (verts[i+1] < minY) minY = verts[i+1]; if (verts[i+1] > maxY) maxY = verts[i+1];
          }
        }
      } catch {}
    }

    if (!isFinite(minX)) return { error: "no bounds" };

    const sw = maxX - minX, sh = maxY - minY;
    const padding = outputSize * 0.04;
    const avail = outputSize - padding * 2;
    const scale = Math.min(avail / sw, avail / sh);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    mvp.ortho2d(
      cx - outputSize / (2 * scale), cy - outputSize / (2 * scale),
      outputSize / scale, outputSize / scale
    );

    gl.viewport(0, 0, outputSize, outputSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    shader.bind();
    shader.setUniformi(spine.Shader.SAMPLER, 0);
    shader.setUniform4x4f(spine.Shader.MVP_MATRIX, mvp.values);
    // Hide placeholder/smoke slots
    for (const slot of skeleton.slots) {
      const sn = slot.data.name.toLowerCase();
      const att = slot.getAttachment();
      const an = att ? (att.name || "").toLowerCase() : "";
      if (hiddenSlots.some(h => sn.includes(h) || an.includes(h))) {
        slot.setAttachment(null);
      }
    }

    batcher.begin(shader);
    renderer.premultipliedAlpha = false;
    renderer.draw(batcher, skeleton);
    batcher.end();
    shader.unbind();

    const pixels = new Uint8Array(outputSize * outputSize * 4);
    gl.readPixels(0, 0, outputSize, outputSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Flip vertically
    const flipped = new Uint8Array(pixels.length);
    const rowSize = outputSize * 4;
    for (let y = 0; y < outputSize; y++) {
      flipped.set(pixels.subarray((outputSize - 1 - y) * rowSize, (outputSize - y) * rowSize), y * rowSize);
    }

    // Check if anything was actually rendered
    let nonTransparent = 0;
    for (let i = 3; i < flipped.length; i += 4) {
      if (flipped[i] > 0) nonTransparent++;
    }
    if (nonTransparent < outputSize * outputSize * 0.001) {
      return { error: "no bounds (blank render)" };
    }

    return {
      ok: true,
      pixels: Array.from(flipped),
      size: `${sw.toFixed(0)}x${sh.toFixed(0)}`,
    };
  }, {
    skelB64, atlasB64, textureData, outputSize,
    idleNames: IDLE_NAMES, shadowNames: SHADOW_NAMES, hiddenSlots: HIDDEN_SLOTS, spineCoreCode,
  });

  if (result.error) return { status: "skip", reason: result.error };

  const rawBuffer = Buffer.from(new Uint8ClampedArray(result.pixels));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // Write PNG via node-canvas
  const pngCanvas = createCanvas(outputSize, outputSize);
  const pngCtx = pngCanvas.getContext("2d");
  const imgData = pngCtx.createImageData(outputSize, outputSize);
  imgData.data.set(rawBuffer);
  pngCtx.putImageData(imgData, 0, 0);
  fs.writeFileSync(outPath, pngCanvas.toBuffer("image/png"));

  // Write WebP via sharp
  const webpPath = outPath.replace(/\.png$/, ".webp");
  const webpBuffer = await sharp(rawBuffer, {
    raw: { width: outputSize, height: outputSize, channels: 4 },
  }).webp({ quality: 90 }).toBuffer();
  fs.writeFileSync(webpPath, webpBuffer);

  return { status: "ok", size: result.size };
}

async function main() {
  const allSkels = findAllSkels(ANIM_ROOT).sort();
  console.log(`Found ${allSkels.length} .skel files\n`);

  if (DRY_RUN) {
    for (const skelPath of allSkels) {
      const relPath = path.relative(ANIM_ROOT, skelPath);
      console.log(`  [DRY] ${relPath}`);
    }
    return;
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--headless=new", "--use-gl=angle", "--enable-webgl"],
    channel: "chrome",
  });
  const page = await browser.newPage();
  await page.setContent('<html><body style="background:transparent;margin:0"></body></html>');

  let ok = 0, skipped = 0, errored = 0;

  for (const skelPath of allSkels) {
    const relPath = path.relative(ANIM_ROOT, skelPath);
    const skelName = path.basename(skelPath, ".skel");
    const relDir = path.dirname(relPath);
    const outPath = path.join(OUTPUT_ROOT, relDir, skelName + ".png");
    const label = path.join(relDir, skelName);

    const result = await renderSkel(page, skelPath, outPath, OUTPUT_SIZE);
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

  await browser.close();
  console.log(`\nDone: ${ok} rendered, ${skipped} skipped, ${errored} errors`);
}

main().catch(console.error);
