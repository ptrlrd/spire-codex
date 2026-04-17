/**
 * Render a Spine skeleton idle animation as an animated GIF.
 *
 * Uses Playwright + spine-webgl to render each frame via headless Chrome's GPU,
 * then encodes to GIF with transparency via gif-encoder-2.
 *
 * Usage:
 *   node render_gif.mjs <skel_dir> <output_path> [size] [--fps=N] [--white]
 *
 * Options:
 *   size       Output dimensions in pixels (default: 256)
 *   --fps=N    Frames per second (default: 20)
 *   --white    Convert all visible pixels to white (for placeholder-style icons)
 *
 * Examples:
 *   # Render boss map node animation at 256x256, 15fps
 *   node render_gif.mjs ../../extraction/raw/animations/map/queen_boss output.gif 256 --fps=15
 *
 *   # Render as white silhouette
 *   node render_gif.mjs ../../extraction/raw/animations/map/queen_boss output.gif 256 --white
 *
 * Notes:
 *   - Boss map node skeletons use RGB channels as masks: Red=fill, Blue=outline, Green=white
 *   - The game applies a shader (boss_map_point.gdshader) that maps these to theme colors
 *   - Shader uniforms: map_color=(0.671,0.58,0.478) for fill, black_layer_color=(0,0,0) for outline
 *   - For white icons, apply the shader in post-processing with map_color=(1,1,1) via Python
 *   - Large animations (100+ frames) may need NODE_OPTIONS="--max-old-space-size=8192"
 *
 * Dependencies: playwright, @esotericsoftware/spine-webgl, gif-encoder-2, canvas
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { createCanvas } from "canvas";
import GIFEncoder from "gif-encoder-2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IDLE_NAMES = ["idle_loop", "idle", "Idle_loop", "Idle", "rest_idle", "rest_loop", "loop", "animation"];
const SHADOW_NAMES = ["shadow", "shadow2", "shadow_v2", "ground", "ground_shadow"];
// Slots that hold magenta placeholder textures the game replaces with shader
// effects at runtime. Without the shader they render as a neon-pink rectangle,
// so we hide them in static/animated previews. (Soul Fysh's `soundwave` /
// `beckonwave` slots both reference the "Soundwave Here" placeholder atlas.)
const HIDDEN_SLOTS = [
  "smoketex", "smoke_tex", "smoke mesh", "smoke1/smoke mesh",
  "smokeplacholder", "smoke_placeholder",
  "megatail", "megablade",
  "soundwave", "beckonwave",
];

async function main() {
  const skelDir = path.resolve(process.argv[2] || "");
  const outputPath = path.resolve(process.argv[3] || "output.gif");
  const outputSize = parseInt(process.argv[4] || "256");
  const fpsArg = process.argv.find(a => a.startsWith("--fps="));
  const fps = fpsArg ? parseInt(fpsArg.split("=")[1]) : 20;
  const whiteMode = process.argv.includes("--white");
  const skinArg = process.argv.find(a => a.startsWith("--skin="));
  const skinName = skinArg ? skinArg.split("=")[1] : null;
  const animArg = process.argv.find(a => a.startsWith("--anim="));
  const animOverride = animArg ? animArg.split("=")[1] : null;

  if (!skelDir || !fs.existsSync(skelDir)) {
    console.error("Usage: node render_gif.mjs <skel_dir> <output_path> [size] [--fps=N] [--white] [--skin=name] [--anim=name]");
    process.exit(1);
  }

  const skelFile = fs.readdirSync(skelDir).find(f => f.endsWith(".skel") && !f.endsWith(".skel.import"));
  if (!skelFile) { console.error("No .skel file found"); process.exit(1); }
  const skelName = path.basename(skelFile, ".skel");

  const atlasFile = fs.readdirSync(skelDir).find(f => f.endsWith(".atlas") && !f.endsWith(".atlas.import"));
  if (!atlasFile) { console.error("No .atlas file found"); process.exit(1); }

  const skelB64 = fs.readFileSync(path.join(skelDir, skelFile)).toString("base64");
  const atlasB64 = Buffer.from(fs.readFileSync(path.join(skelDir, atlasFile), "utf-8")).toString("base64");

  const textureFiles = fs.readdirSync(skelDir).filter(f => f.endsWith(".png") && !f.endsWith(".png.import"));
  const textureData = {};
  for (const tf of textureFiles) {
    textureData[tf] = fs.readFileSync(path.join(skelDir, tf)).toString("base64");
  }

  console.log(`Rendering ${skelName} as GIF at ${outputSize}x${outputSize}, ${fps}fps...`);
  console.log(`  Textures: ${textureFiles.join(", ")}`);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();

  // For WebP/APNG: stream frames to disk to avoid OOM
  const isStreamFormat = outputPath.endsWith(".webp") || outputPath.endsWith(".apng");
  const framesDir = outputPath + "_frames";
  if (isStreamFormat) {
    fs.mkdirSync(framesDir, { recursive: true });
    await page.exposeFunction("__saveFrame", (idx, pixels) => {
      const pngCanvas = createCanvas(outputSize, outputSize);
      const pCtx = pngCanvas.getContext("2d");
      const imgData = pCtx.createImageData(outputSize, outputSize);
      imgData.data.set(new Uint8ClampedArray(pixels));
      pCtx.putImageData(imgData, 0, 0);
      fs.writeFileSync(path.join(framesDir, `frame_${String(idx).padStart(4, "0")}.png`), pngCanvas.toBuffer("image/png"));
    });
  }

  const spineCorePath = path.join(__dirname, "node_modules/@esotericsoftware/spine-webgl/dist/iife/spine-webgl.js");
  const spineCoreCode = fs.readFileSync(spineCorePath, "utf-8");

  const result = await page.evaluate(async (params) => {
    const { skelB64, atlasB64, textureData, outputSize, fps, streamFrames, idleNames, shadowNames, hiddenSlots, whiteMode, skinName, animOverride, spineCoreCode } = params;

    eval(spineCoreCode.replace(/^"use strict";\s*var spine\s*=/, "window.spine ="));
    const spine = window.spine;

    // Setup WebGL
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
             || canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("No WebGL");

    const shader = spine.Shader.newTwoColoredTextured(gl);
    const batcher = new spine.PolygonBatcher(gl);
    const renderer = new spine.SkeletonRenderer(gl);

    // Load textures from base64
    const loadedTextures = {};
    for (const [name, b64] of Object.entries(textureData)) {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
      loadedTextures[name] = new spine.GLTexture(gl, img);
    }

    // Parse atlas + skeleton
    const rawAtlas = atob(atlasB64);
    const atlas = new spine.TextureAtlas(rawAtlas);
    for (const page of atlas.pages) {
      const tex = loadedTextures[page.name];
      if (tex) page.setTexture(tex);
    }

    const skelBin = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
    const skelData = skelBin.readSkeletonData(Uint8Array.from(atob(skelB64), c => c.charCodeAt(0)));
    const skeleton = new spine.Skeleton(skelData);
    const state = new spine.AnimationState(new spine.AnimationStateData(skelData));

    // Set skin — combine default + named skin for full rendering
    if (skinName) {
      const combined = new spine.Skin("combined");
      const defSkin = skelData.findSkin("default");
      const varSkin = skelData.findSkin(skinName);
      if (defSkin) combined.addSkin(defSkin);
      if (varSkin) combined.addSkin(varSkin);
      skeleton.setSkin(combined);
      skeleton.setSlotsToSetupPose();
    } else {
      const defSkin = skelData.findSkin("default");
      if (defSkin) { skeleton.setSkin(defSkin); skeleton.setSlotsToSetupPose(); }
    }

    // Find animation — use override if specified, otherwise idle
    let animName = null;
    if (animOverride && skelData.findAnimation(animOverride)) {
      state.setAnimation(0, animOverride, true);
      animName = animOverride;
    } else {
      for (const name of idleNames) {
        if (skelData.findAnimation(name)) { state.setAnimation(0, name, true); animName = name; break; }
      }
      if (!animName && skelData.animations.length > 0) {
        state.setAnimation(0, skelData.animations[0].name, true);
        animName = skelData.animations[0].name;
      }
    }

    const anim = skelData.findAnimation(animName);
    const duration = anim ? anim.duration : 1.0;
    const frameCount = Math.max(Math.ceil(duration * fps), 1);
    const dt = duration / frameCount;

    console.log(`  Animation: ${animName}, duration: ${duration.toFixed(2)}s, frames: ${frameCount}`);

    // Compute bounds
    skeleton.updateWorldTransform(spine.Physics.reset);
    state.update(0); state.apply(skeleton);
    skeleton.updateWorldTransform(spine.Physics.update);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const slot of skeleton.slots) {
      const att = slot.getAttachment();
      if (!att || !att.computeWorldVertices) continue;
      const sn = slot.data.name.toLowerCase();
      if (shadowNames.includes(sn)) continue;
      const verts = new Float32Array(1000);
      try {
        if (att instanceof spine.RegionAttachment) {
          att.computeWorldVertices(slot, verts, 0, 2);
          for (let i = 0; i < 8; i += 2) { minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]); minY = Math.min(minY, verts[i+1]); maxY = Math.max(maxY, verts[i+1]); }
        } else {
          const nf = att.worldVerticesLength || 8;
          att.computeWorldVertices(slot, 0, nf, verts, 0, 2);
          for (let i = 0; i < nf; i += 2) { minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]); minY = Math.min(minY, verts[i+1]); maxY = Math.max(maxY, verts[i+1]); }
        }
      } catch {}
    }

    const bw = maxX - minX, bh = maxY - minY;
    const scale = Math.min(outputSize / bw, outputSize / bh) * 0.9;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const mvp = new spine.Matrix4();
    mvp.ortho2d(cx - outputSize / 2 / scale, cy - outputSize / 2 / scale, outputSize / scale, outputSize / scale);

    // Render frames
    const frames = [];
    // Reset animation
    state.setAnimation(0, animName, true);
    state.update(0); state.apply(skeleton);
    skeleton.updateWorldTransform(spine.Physics.reset);

    for (let f = 0; f < frameCount; f++) {
      state.update(dt);
      state.apply(skeleton);
      skeleton.updateWorldTransform(spine.Physics.update);

      gl.viewport(0, 0, outputSize, outputSize);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      shader.bind();
      shader.setUniformi(spine.Shader.SAMPLER, 0);
      shader.setUniform4x4f(spine.Shader.MVP_MATRIX, mvp.values);

      // Hide slots
      for (const slot of skeleton.slots) {
        const sn = slot.data.name.toLowerCase();
        const att = slot.getAttachment();
        const an = att ? (att.name || "").toLowerCase() : "";
        if (hiddenSlots.some(h => sn.includes(h) || an.includes(h))) { slot.setAttachment(null); }
      }

      batcher.begin(shader);
      renderer.premultipliedAlpha = false;
      renderer.draw(batcher, skeleton);
      batcher.end();

      const pixels = new Uint8Array(outputSize * outputSize * 4);
      gl.readPixels(0, 0, outputSize, outputSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // Flip vertically
      const flipped = new Uint8Array(outputSize * outputSize * 4);
      const rowSize = outputSize * 4;
      for (let row = 0; row < outputSize; row++) {
        flipped.set(pixels.subarray((outputSize - 1 - row) * rowSize, (outputSize - row) * rowSize), row * rowSize);
      }

      // White mode
      if (whiteMode) {
        for (let i = 0; i < flipped.length; i += 4) {
          if (flipped[i + 3] > 0) {
            const max = Math.max(flipped[i], flipped[i+1], flipped[i+2]);
            const gray = max < 200 ? Math.floor(max * 0.4) : max;
            flipped[i] = gray; flipped[i+1] = gray; flipped[i+2] = gray;
          }
        }
      }

      if (streamFrames) {
        // Stream mode: write frame to disk via exposed function, don't hold in memory
        await window.__saveFrame(f, Array.from(flipped));
      } else {
        frames.push(Array.from(flipped));
      }
    }

    return { frames: streamFrames ? [] : frames, frameCount, duration };
  }, {
    skelB64, atlasB64, textureData, outputSize, fps,
    streamFrames: outputPath.endsWith(".webp") || outputPath.endsWith(".apng"),
    idleNames: IDLE_NAMES, shadowNames: SHADOW_NAMES, hiddenSlots: HIDDEN_SLOTS,
    whiteMode, skinName, animOverride, spineCoreCode,
  });

  await browser.close();

  const isWebP = outputPath.endsWith(".webp");
  const isApng = !isWebP && (outputPath.endsWith(".apng") || outputPath.endsWith(".png") && process.argv.includes("--apng"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (isWebP || isApng) {
    // Frames already saved to disk via streaming (or need to be saved now for GIF-to-WebP conversion)
    const tmpDir = framesDir;
    if (!isStreamFormat) {
      // Fallback: save frames from memory
      fs.mkdirSync(tmpDir, { recursive: true });
      const pngCanvas2 = createCanvas(outputSize, outputSize);
      const pCtx2 = pngCanvas2.getContext("2d");
      for (let f = 0; f < result.frameCount; f++) {
        const imgData = pCtx2.createImageData(outputSize, outputSize);
        imgData.data.set(new Uint8ClampedArray(result.frames[f]));
        pCtx2.putImageData(imgData, 0, 0);
        fs.writeFileSync(path.join(tmpDir, `frame_${String(f).padStart(4, "0")}.png`), pngCanvas2.toBuffer("image/png"));
      }
    }
    // Assemble via Python
    const { execSync } = await import("child_process");
    const delay = Math.round(1000 / fps);
    const saveArgs = isWebP ? `lossless=True` : `disposal=2`;
    execSync(`arch -arm64 python3 -c "
from PIL import Image
from pathlib import Path
frames = sorted(Path('${tmpDir}').glob('frame_*.png'))
imgs = [Image.open(f).convert('RGBA') for f in frames]
imgs[0].save('${outputPath}', save_all=True, append_images=imgs[1:], duration=${delay}, loop=0, ${saveArgs})
"`, { stdio: "inherit" });
    // Cleanup
    for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
    fs.rmdirSync(tmpDir);
  } else {
    // Encode GIF
    const encoder = new GIFEncoder(outputSize, outputSize, "neuquant", true);
    encoder.setDelay(Math.round(1000 / fps));
    encoder.setRepeat(0);
    encoder.setTransparent(0x000000);
    encoder.start();

    const gifCanvas = createCanvas(outputSize, outputSize);
    const ctx = gifCanvas.getContext("2d");

    for (let f = 0; f < result.frameCount; f++) {
      const imgData = ctx.createImageData(outputSize, outputSize);
      imgData.data.set(new Uint8ClampedArray(result.frames[f]));
      ctx.putImageData(imgData, 0, 0);
      encoder.addFrame(ctx);
    }

    encoder.finish();
    const buffer = encoder.out.getData();
    fs.writeFileSync(outputPath, buffer);
  }

  const fileSize = fs.statSync(outputPath).size;
  console.log(`  Saved: ${outputPath} (${Math.round(fileSize / 1024)} KB, ${result.frameCount} frames, ${result.duration.toFixed(2)}s)`);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
