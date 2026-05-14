/**
 * Shared rendering utilities for Spine skeleton renderers.
 *
 * The spine-canvas SkeletonRenderer uses canvas clip() paths for triangle
 * rendering. On skeletons with many mesh attachments, these clip paths
 * accumulate and corrupt the canvas state, causing toBuffer() to OOM or
 * produce blank output. This module provides a slot-by-slot fallback that
 * renders each slot to its own canvas and composites via raw pixel data.
 */
import { createCanvas } from "canvas";
import {
  SkeletonRenderer,
  RegionAttachment,
  MeshAttachment,
} from "@esotericsoftware/spine-canvas";

const BLANK_PNG_THRESHOLD = 2000; // bytes — a blank 512x512 transparent PNG is ~1114 bytes

/**
 * Render a skeleton to a canvas. Returns the raw pixel ImageData at renderSize.
 * First tries normal all-at-once rendering. If the result is blank (clip path
 * corruption), falls back to slot-by-slot compositing.
 */
export function renderSkeleton(skeleton, renderWidth, renderHeight, scale, minX, minY, maxX, maxY) {
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Try normal render first
  const canvas = createCanvas(renderWidth, renderHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, renderWidth, renderHeight);
  ctx.save();
  ctx.translate(renderWidth / 2, renderHeight / 2);
  ctx.scale(scale, -scale);
  ctx.translate(-cx, -cy);
  const renderer = new SkeletonRenderer(ctx);
  renderer.triangleRendering = true;
  renderer.draw(skeleton);
  ctx.restore();

  // Check pixel count via getImageData (bypasses clip corruption)
  const imgData = ctx.getImageData(0, 0, renderWidth, renderHeight);
  let nonTransparent = 0;
  for (let i = 3; i < imgData.data.length; i += 4) {
    if (imgData.data[i] > 0) nonTransparent++;
  }

  // Also check if toBuffer would work by trying it
  let bufferOk = false;
  try {
    const testBuf = canvas.toBuffer("image/png");
    bufferOk = testBuf.length > BLANK_PNG_THRESHOLD;
  } catch {
    // OOM — canvas state corrupted
  }

  if (bufferOk && nonTransparent > renderWidth * renderWidth * 0.01 && nonTransparent > renderHeight * renderHeight * 0.01) {
    // Normal render succeeded — copy pixels to fresh canvas to be safe
    return imgData;
  }

  // Fallback: slot-by-slot compositing
  console.log("    (using slot-by-slot fallback renderer)");
  return renderSlotBySlot(skeleton, renderWidth, scale, cx, cy);
}

function renderSlotBySlot(skeleton, renderWidth, renderHeight, scale, cx, cy) {
  // TODO: Not sure how to generalize this, may use the max of the height and width.
  const compPixels = new Uint8ClampedArray(renderWidth * renderWidth * 4);

  for (const slot of skeleton.drawOrder) {
    const att = slot.getAttachment();
    if (!att) continue;
    if (!(att instanceof RegionAttachment) && !(att instanceof MeshAttachment)) continue;

    // Save and hide all other slots
    const saved = [];
    for (const s of skeleton.drawOrder) {
      if (s !== slot) {
        saved.push({ slot: s, att: s.getAttachment() });
        s.setAttachment(null);
      }
    }

    // Render this single slot
    const tempCanvas = createCanvas(renderWidth, renderHeight);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.save();
    tempCtx.translate(renderWidth / 2, renderHeight / 2);
    tempCtx.scale(scale, -scale);
    tempCtx.translate(-cx, -cy);
    const renderer = new SkeletonRenderer(tempCtx);
    renderer.triangleRendering = true;
    renderer.draw(skeleton);
    tempCtx.restore();

    // Restore all slots
    for (const { slot: s, att: a } of saved) s.setAttachment(a);

    // Alpha-composite raw pixels (source-over blending)
    const src = tempCtx.getImageData(0, 0, renderWidth, renderHeight).data;
    for (let i = 0; i < src.length; i += 4) {
      const sa = src[i + 3] / 255;
      if (sa === 0) continue;
      const da = compPixels[i + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA === 0) continue;
      compPixels[i]     = (src[i] * sa + compPixels[i] * da * (1 - sa)) / outA;
      compPixels[i + 1] = (src[i + 1] * sa + compPixels[i + 1] * da * (1 - sa)) / outA;
      compPixels[i + 2] = (src[i + 2] * sa + compPixels[i + 2] * da * (1 - sa)) / outA;
      compPixels[i + 3] = outA * 255;
    }
  }

  // Return as ImageData
  const resultCanvas = createCanvas(renderWidth, renderHeight);
  const resultCtx = resultCanvas.getContext("2d");
  const resultData = resultCtx.createImageData(renderWidth, renderHeight);
  resultData.data.set(compPixels);
  return resultData;
}

/**
 * Fix triangle seam artifacts by two passes:
 * 1. Boost low-alpha pixels that have high-alpha neighbors (seam lines within meshes)
 * 2. Fill fully transparent pixels surrounded by opaque pixels (gaps between triangles)
 */
function fillSeams(imgData, width) {
  const src = imgData.data;
  const out = new Uint8ClampedArray(src);
  const h = (src.length / 4) / width;

  // Pass 1: Boost semi-transparent seam pixels (alpha < 200 with opaque neighbors)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const a = src[i + 3];
      // Skip fully opaque and fully transparent
      if (a >= 200 || a === 0) continue;

      // Check 8-connected neighbors for opaque pixels
      let opaqueCount = 0;
      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ni = ((y + dy) * width + (x + dx)) * 4;
          if (src[ni + 3] >= 200) {
            opaqueCount++;
            r += src[ni];
            g += src[ni + 1];
            b += src[ni + 2];
          }
        }
      }

      // If this low-alpha pixel is surrounded by opaque pixels, it's a seam
      if (opaqueCount >= 4) {
        out[i] = r / opaqueCount;
        out[i + 1] = g / opaqueCount;
        out[i + 2] = b / opaqueCount;
        out[i + 3] = 255;
      }
    }
  }

  // Pass 2: Fill fully transparent gaps (dilate)
  // Use the output from pass 1 as input
  const src2 = new Uint8ClampedArray(out);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (src2[i + 3] > 0) continue;

      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ni = ((y + dy) * width + (x + dx)) * 4;
          if (src2[ni + 3] >= 200) {
            r += src2[ni];
            g += src2[ni + 1];
            b += src2[ni + 2];
            count++;
          }
        }
      }

      if (count >= 3) {
        out[i] = r / count;
        out[i + 1] = g / count;
        out[i + 2] = b / count;
        out[i + 3] = 255;
      }
    }
  }

  imgData.data.set(out);
}

/**
 * Apply a selective 3x3 box blur to pixels where there's a sharp alpha
 * transition — these are the seam lines. This smudges the seam artifacts
 * without blurring the entire image.
 */
function blurSeams(imgData, width) {
  const src = new Uint8ClampedArray(imgData.data);
  const out = imgData.data;
  const h = (src.length / 4) / width;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const a = src[i + 3];

      // Find pixels with alpha between 1-230 that neighbor fully opaque pixels
      // These are the semi-transparent seam edges
      if (a === 0 || a > 230) continue;

      let hasOpaque = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ni = ((y + dy) * width + (x + dx)) * 4;
          if (src[ni + 3] > 230) { hasOpaque = true; break; }
        }
        if (hasOpaque) break;
      }

      if (!hasOpaque) continue;

      // Apply 3x3 weighted average using only non-transparent neighbors
      let r = 0, g = 0, b = 0, aa = 0, w = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = ((y + dy) * width + (x + dx)) * 4;
          const na = src[ni + 3];
          if (na === 0) continue;
          const weight = na / 255;
          r += src[ni] * weight;
          g += src[ni + 1] * weight;
          b += src[ni + 2] * weight;
          aa += na;
          w += weight;
        }
      }

      if (w > 0) {
        out[i] = r / w;
        out[i + 1] = g / w;
        out[i + 2] = b / w;
        out[i + 3] = Math.min(255, aa / 9 * 1.5); // Boost alpha
      }
    }
  }
}

/**
 * Convert ImageData to a downscaled PNG buffer.
 */
export function imageDataToPng(imgData, renderWidth, renderHeight, outputWidth, outputHeight) {
  // Fix triangle seam artifacts then blur seam areas before downscaling
  fillSeams(imgData, renderWidth);
  blurSeams(imgData, renderWidth);

  const fullCanvas = createCanvas(renderWidth, renderHeight);
  const fullCtx = fullCanvas.getContext("2d");
  fullCtx.putImageData(imgData, 0, 0);

  if (renderWidth === outputWidth) {
    return fullCanvas.toBuffer("image/png");
  }

  const outCanvas = createCanvas(outputWidth, outputHeight);
  const outCtx = outCanvas.getContext("2d");
  outCtx.drawImage(fullCanvas, 0, 0, outputWidth, outputHeight);
  return outCanvas.toBuffer("image/png");
}
