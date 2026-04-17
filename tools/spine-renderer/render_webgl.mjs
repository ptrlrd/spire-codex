/**
 * WebGL-based Spine renderer using Puppeteer.
 * Renders skeletons via spine-webgl in a headless browser — no canvas clip
 * path artifacts, no triangle seams.
 *
 * Usage: node render_webgl.mjs <skel_dir> <output_path> [size] [--skin=name]
 * Example: node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
 *
 * --skin=name combines the named skin with `default` — required for skeletons
 * whose default skin only carries shadow/effect attachments and where the
 * actual visible body lives in a variant skin (e.g. scroll_of_biting / skin1).
 */
import { chromium } from "playwright";
import { createCanvas } from "canvas";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IDLE_NAMES = ["idle_loop", "idle", "Idle_loop", "Idle", "rest_idle", "rest_loop", "loop", "animation"];
const SHADOW_NAMES = ["shadow", "shadow2", "shadow_v2", "ground", "ground_shadow"];
// Slots that hold magenta placeholder textures the game replaces with shader
// effects at runtime. Without the shader they render as a neon-pink rectangle.
const HIDDEN_SLOTS = ["smoketex", "smoke_tex", "smokeplacholder", "smoke_placeholder", "megatail", "megablade", "soundwave", "beckonwave"];

async function main() {
  const skelDir = path.resolve(process.argv[2] || "");
  const outputPath = path.resolve(process.argv[3] || "output.png");
  const outputSize = parseInt(process.argv[4] || "2048");
  // Optional: --only-slots=stroke to only render slots matching a pattern
  const onlySlotsArg = process.argv.find(a => a.startsWith("--only-slots="));
  const onlySlots = onlySlotsArg ? onlySlotsArg.split("=")[1] : null;
  // Optional: --white to convert output to white silhouette
  const whiteMode = process.argv.includes("--white");
  // Optional: --skin=name to combine the named skin with `default`
  const skinArg = process.argv.find(a => a.startsWith("--skin="));
  const skinName = skinArg ? skinArg.split("=")[1] : null;
  // Optional: --anim-time=SECONDS to advance the animation before snapshotting —
  // required for skeletons whose idle frames at t=0 haven't assembled yet
  // (e.g. cubex_construct, whose top/bottom halves fly in over the first ~0.5s).
  const animTimeArg = process.argv.find(a => a.startsWith("--anim-time="));
  const animTime = animTimeArg ? parseFloat(animTimeArg.split("=")[1]) : 0;
  // Optional: --anim=name to override the auto-detected idle animation
  const animArg = process.argv.find(a => a.startsWith("--anim="));
  const animOverride = animArg ? animArg.split("=")[1] : null;

  if (!skelDir || !fs.existsSync(skelDir)) {
    console.error("Usage: node render_webgl.mjs <skel_dir> <output_path> [size] [--only-slots=pattern] [--white] [--skin=name] [--anim=name] [--anim-time=seconds]");
    process.exit(1);
  }

  // Find skel + atlas files
  const skelFile = fs.readdirSync(skelDir).find(f => f.endsWith(".skel") && !f.endsWith(".skel.import"));
  if (!skelFile) { console.error("No .skel file found"); process.exit(1); }
  const skelName = path.basename(skelFile, ".skel");
  const atlasPath = path.join(skelDir, skelName + ".atlas");
  if (!fs.existsSync(atlasPath)) { console.error("No .atlas file found"); process.exit(1); }

  // Read atlas to find PNG texture files
  const atlasText = fs.readFileSync(atlasPath, "utf-8");
  const pngFiles = [];
  for (const line of atlasText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.endsWith(".png")) pngFiles.push(trimmed);
  }

  // Read all files as base64 data URIs
  const skelData = fs.readFileSync(path.join(skelDir, skelFile));
  const skelB64 = skelData.toString("base64");
  const atlasB64 = Buffer.from(atlasText).toString("base64");
  const textureData = {};
  for (const png of pngFiles) {
    const pngPath = path.join(skelDir, png);
    if (fs.existsSync(pngPath)) {
      textureData[png] = fs.readFileSync(pngPath).toString("base64");
    }
  }

  console.log(`Rendering ${skelName} at ${outputSize}x${outputSize} via WebGL...`);
  console.log(`  Textures: ${pngFiles.join(", ")}`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--headless=new", "--use-gl=angle", "--enable-webgl"],
    channel: "chrome",
  });
  const page = await browser.newPage();
  await page.setContent('<html><body style="background:transparent;margin:0"></body></html>');

  // Inject spine-webgl from node_modules
  const spineCorePath = path.join(__dirname, "node_modules/@esotericsoftware/spine-webgl/dist/iife/spine-webgl.js");
  const spineCoreCode = fs.readFileSync(spineCorePath, "utf-8");

  const result = await page.evaluate(async (params) => {
    const { skelB64, atlasB64, textureData, outputSize, idleNames, shadowNames, hiddenSlots, onlySlots, whiteMode, skinName, animOverride, animTime, spineCoreCode } = params;

    // Load spine-webgl — IIFE uses `var spine = (...)()`, make it global
    eval(spineCoreCode.replace(/^"use strict";\s*var spine\s*=/, "window.spine ="));
    const spine = window.spine;

    // Create WebGL canvas
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    document.body.appendChild(canvas);

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
           || canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return { error: "WebGL not available" };

    // Create spine WebGL context
    const mvp = new spine.Matrix4();
    mvp.ortho2d(0, 0, outputSize, outputSize);

    const shader = spine.Shader.newTwoColoredTextured(gl);
    const batcher = new spine.PolygonBatcher(gl);
    const renderer = new spine.SkeletonRenderer(gl);
    const shapes = new spine.ShapeRenderer(gl);

    // Load textures from base64
    const loadedTextures = {};
    for (const [name, b64] of Object.entries(textureData)) {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = "data:image/png;base64," + b64;
      });
      const tex = new spine.GLTexture(gl, img);
      loadedTextures[name] = tex;
    }

    // Parse atlas
    const rawAtlas = atob(atlasB64);
    const atlas = new spine.TextureAtlas(rawAtlas);
    for (const page of atlas.pages) {
      const tex = loadedTextures[page.name];
      if (tex) page.setTexture(tex);
    }

    // Parse skeleton
    const loader = new spine.AtlasAttachmentLoader(atlas);
    const bin = new spine.SkeletonBinary(loader);
    const skelBytes = Uint8Array.from(atob(skelB64), c => c.charCodeAt(0));
    let skelData;
    try {
      skelData = bin.readSkeletonData(skelBytes);
    } catch (e) {
      return { error: "Failed to parse skeleton: " + e.message };
    }

    const skeleton = new spine.Skeleton(skelData);
    const defaultSkin = skelData.findSkin("default");
    // --skin accepts comma-separated names (e.g. --skin=moss1,circleeye) so
    // skeletons that split body / eye / moss variants across multiple skins
    // (cubex_construct) can be combined into a single render.
    const variantNames = skinName ? skinName.split(",").map(s => s.trim()).filter(Boolean) : [];
    const variantSkins = variantNames.map(n => skelData.findSkin(n)).filter(Boolean);
    if (variantSkins.length) {
      const combined = new spine.Skin("combined");
      if (defaultSkin) combined.addSkin(defaultSkin);
      for (const s of variantSkins) combined.addSkin(s);
      skeleton.setSkin(combined);
      skeleton.setSlotsToSetupPose();
    } else if (defaultSkin) {
      skeleton.setSkin(defaultSkin);
      skeleton.setSlotsToSetupPose();
    }
    skeleton.setToSetupPose();

    // Apply idle animation (or override via --anim)
    const stateData = new spine.AnimationStateData(skelData);
    const state = new spine.AnimationState(stateData);
    let animName = null;
    if (animOverride && skelData.findAnimation(animOverride)) {
      state.setAnimation(0, animOverride, true);
      animName = animOverride;
    } else {
      for (const name of idleNames) {
        if (skelData.findAnimation(name)) {
          state.setAnimation(0, name, true);
          animName = name;
          break;
        }
      }
      if (!animName && skelData.animations.length > 0) {
        state.setAnimation(0, skelData.animations[0].name, true);
        animName = skelData.animations[0].name;
      }
    }

    // Advance the animation by animTime seconds before snapshotting — some
    // skeletons assemble over the first few frames (e.g. cubex_construct).
    if (animTime > 0) {
      state.update(animTime);
    }
    state.apply(skeleton);
    skeleton.updateWorldTransform(animTime > 0 ? spine.Physics.update : spine.Physics.reset);

    // Compute bounds (excluding shadows)
    const offset = new spine.Vector2();
    const size = new spine.Vector2();
    skeleton.getBounds(offset, size);

    // More precise bounds excluding shadow slots
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const slot of skeleton.slots) {
      const att = slot.getAttachment();
      if (!att || !att.computeWorldVertices) continue;
      const sn = slot.data.name.toLowerCase();
      const an = (att.name || "").toLowerCase();
      if (shadowNames.includes(sn) || shadowNames.includes(an)) continue;
      // Don't filter bounds by onlySlots — use full skeleton bounds for camera

      const verts = new Float32Array(1000);
      try {
        if (att instanceof spine.RegionAttachment) {
          att.computeWorldVertices(slot, verts, 0, 2);
          for (let i = 0; i < 8; i += 2) {
            if (verts[i] < minX) minX = verts[i];
            if (verts[i] > maxX) maxX = verts[i];
            if (verts[i+1] < minY) minY = verts[i+1];
            if (verts[i+1] > maxY) maxY = verts[i+1];
          }
        } else {
          const nf = att.worldVerticesLength || 8;
          att.computeWorldVertices(slot, 0, nf, verts, 0, 2);
          for (let i = 0; i < nf; i += 2) {
            if (verts[i] < minX) minX = verts[i];
            if (verts[i] > maxX) maxX = verts[i];
            if (verts[i+1] < minY) minY = verts[i+1];
            if (verts[i+1] > maxY) maxY = verts[i+1];
          }
        }
      } catch {}
    }

    if (!isFinite(minX)) {
      return { error: "No bounds found" };
    }

    const sw = maxX - minX;
    const sh = maxY - minY;
    const padding = outputSize * 0.05;
    const avail = outputSize - padding * 2;
    const scale = Math.min(avail / sw, avail / sh);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Set up orthographic projection centered on skeleton
    mvp.ortho2d(
      cx - outputSize / (2 * scale),
      cy - outputSize / (2 * scale),
      outputSize / scale,
      outputSize / scale
    );

    // Clear and render
    gl.viewport(0, 0, outputSize, outputSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    shader.bind();
    shader.setUniformi(spine.Shader.SAMPLER, 0);
    shader.setUniform4x4f(spine.Shader.MVP_MATRIX, mvp.values);

    // Hide placeholder/smoke slots before rendering
    for (const slot of skeleton.slots) {
      const sn = slot.data.name.toLowerCase();
      const att = slot.getAttachment();
      const an = att ? (att.name || "").toLowerCase() : "";
      if (hiddenSlots.some(h => sn.includes(h) || an.includes(h))) {
        slot.setAttachment(null);
      }
      // If --only-slots is set, hide anything that doesn't match the pattern
      if (onlySlots && !sn.includes(onlySlots.toLowerCase())) {
        slot.setAttachment(null);
      }
    }

    batcher.begin(shader);
    renderer.premultipliedAlpha = false;
    renderer.draw(batcher, skeleton);
    batcher.end();

    shader.unbind();

    // Read pixels
    const pixels = new Uint8Array(outputSize * outputSize * 4);
    gl.readPixels(0, 0, outputSize, outputSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL pixels are bottom-up, flip vertically
    const flipped = new Uint8Array(pixels.length);
    const rowSize = outputSize * 4;
    for (let y = 0; y < outputSize; y++) {
      const srcRow = (outputSize - 1 - y) * rowSize;
      const dstRow = y * rowSize;
      flipped.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
    }

    return {
      ok: true,
      pixels: Array.from(flipped),
      animName,
      bounds: `${sw.toFixed(0)}x${sh.toFixed(0)}`,
      scale: scale.toFixed(2),
    };
  }, {
    skelB64,
    atlasB64,
    textureData,
    outputSize,
    idleNames: IDLE_NAMES,
    shadowNames: SHADOW_NAMES,
    hiddenSlots: HIDDEN_SLOTS,
    onlySlots: onlySlots || null,
    skinName: skinName || null,
    animOverride: animOverride || null,
    animTime: animTime || 0,
    whiteMode: whiteMode || false,
    spineCoreCode: spineCoreCode,
  });

  await browser.close();

  if (result.error) {
    console.error("  Error:", result.error);
    process.exit(1);
  }

  console.log(`  Animation: ${result.animName}`);
  console.log(`  Bounds: ${result.bounds}, scale: ${result.scale}`);

  const pixelData = new Uint8ClampedArray(result.pixels);
  // If --white mode, convert all visible pixels to white (RGB=255), keep alpha
  if (whiteMode) {
    for (let i = 0; i < pixelData.length; i += 4) {
      if (pixelData[i + 3] > 0) {
        pixelData[i] = 255;     // R
        pixelData[i + 1] = 255; // G
        pixelData[i + 2] = 255; // B
      }
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const rawBuffer = Buffer.from(pixelData);
  const isWebp = outputPath.endsWith(".webp");

  if (isWebp) {
    const buffer = await sharp(rawBuffer, {
      raw: { width: outputSize, height: outputSize, channels: 4 },
    }).webp({ quality: 90 }).toBuffer();
    fs.writeFileSync(outputPath, buffer);
    console.log(`  Saved: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
  } else {
    const pngCanvas = createCanvas(outputSize, outputSize);
    const pngCtx = pngCanvas.getContext("2d");
    const imgData = pngCtx.createImageData(outputSize, outputSize);
    imgData.data.set(pixelData);
    pngCtx.putImageData(imgData, 0, 0);
    const buffer = pngCanvas.toBuffer("image/png");
    fs.writeFileSync(outputPath, buffer);
    console.log(`  Saved: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
}

main().catch(console.error);
