
import { SkinMetrics } from '../types';

// --- CONSTANTS ---
const SKIN_Y_MIN = 40;
const SKIN_CB_MIN = 80;
const SKIN_CB_MAX = 125;
const SKIN_CR_MIN = 135;
const SKIN_CR_MAX = 170;

// --- UTILS ---

const rgbToYCbCr = (r: number, g: number, b: number) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    return { y, cb, cr };
};

const isSkinPixel = (r: number, g: number, b: number): boolean => {
    const { y, cb, cr } = rgbToYCbCr(r, g, b);
    return (cb > SKIN_CB_MIN && cb < SKIN_CB_MAX && cr > SKIN_CR_MIN && cr < SKIN_CR_MAX && y > SKIN_Y_MIN);
};

// Fast Box Blur (Approximation of Gaussian) for real-time performance
// Mutates the output array
const boxBlur = (src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray => {
    const dest = new Uint8ClampedArray(src.length);
    
    // Horizontal Pass
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let r = 0, g = 0, b = 0, count = 0;
            for (let k = -radius; k <= radius; k++) {
                const px = Math.min(w - 1, Math.max(0, x + k));
                const idx = (y * w + px) * 4;
                r += src[idx];
                g += src[idx + 1];
                b += src[idx + 2];
                count++;
            }
            const i = (y * w + x) * 4;
            dest[i] = r / count;
            dest[i + 1] = g / count;
            dest[i + 2] = b / count;
            dest[i + 3] = src[i + 3];
        }
    }
    
    // Vertical Pass (on the result of Horizontal)
    const finalDest = new Uint8ClampedArray(src.length);
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let r = 0, g = 0, b = 0, count = 0;
            for (let k = -radius; k <= radius; k++) {
                const py = Math.min(h - 1, Math.max(0, y + k));
                const idx = (py * w + x) * 4;
                r += dest[idx];
                g += dest[idx + 1];
                b += dest[idx + 2];
                count++;
            }
            const i = (y * w + x) * 4;
            finalDest[i] = r / count;
            finalDest[i + 1] = g / count;
            finalDest[i + 2] = b / count;
            finalDest[i + 3] = dest[i + 3];
        }
    }
    return finalDest;
};

// --- CORE SIMULATION ---

export const simulateSkinResult = (
    sourceCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    type: 'acneActive' | 'darkCircles' | 'texture' | 'redness' | 'pigmentation',
    intensity: number // 0.0 to 1.0
): string => {
    if (intensity <= 0) return sourceCtx.canvas.toDataURL();

    const imgData = sourceCtx.getImageData(0, 0, width, height);
    const src = imgData.data;
    const len = src.length;
    
    // 1. Create a Blurred Base (Low Frequency)
    // We use a radius relative to image size. e.g. 0.5% of width.
    const blurRadius = Math.max(2, Math.floor(width * 0.005));
    const blurred = boxBlur(src, width, height, blurRadius);

    // 2. Identify ROI (Face Center)
    let sumX = 0, sumY = 0, skinPixels = 0;
    const stride = 4; // optimization
    for (let i = 0; i < len; i += 4 * stride) {
        if (isSkinPixel(src[i], src[i+1], src[i+2])) {
            sumX += (i / 4) % width;
            sumY += Math.floor((i / 4) / width);
            skinPixels++;
        }
    }
    const centerX = skinPixels ? sumX / skinPixels : width / 2;
    const centerY = skinPixels ? sumY / skinPixels : height / 2;
    // Estimate face radius (approximate)
    const faceRadius = Math.sqrt(skinPixels * stride) * 0.6;

    // 3. Process Pixels based on Type
    for (let i = 0; i < len; i += 4) {
        // Skip alpha 0
        if (src[i+3] === 0) continue;

        const r = src[i];
        const g = src[i+1];
        const b = src[i+2];

        // Skin Mask: Strict
        if (!isSkinPixel(r, g, b)) continue;

        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);

        // --- ACNE / REDNESS (Spot Healing) ---
        if (type === 'acneActive' || type === 'redness') {
            // Logic: High Frequency Redness
            // High Pass = Original - Blurred
            const diffR = r - blurred[i];
            const diffG = g - blurred[i+1];
            
            // Acne usually has significantly higher Red difference than Green difference
            // It stands out from the local average (blurred).
            const rednessSpike = diffR - diffG; 
            
            if (rednessSpike > 10) { 
                // It's a red spot relative to neighbors.
                // Heal: Replace with blurred value (local avg) + reduced detail
                // Mix factor based on intensity
                const healFactor = Math.min(1, intensity * (rednessSpike / 20));
                
                imgData.data[i] = r * (1 - healFactor) + blurred[i] * healFactor;
                imgData.data[i+1] = g * (1 - healFactor) + blurred[i+1] * healFactor;
                imgData.data[i+2] = b * (1 - healFactor) + blurred[i+2] * healFactor;
                
                // Color Correction: De-saturate red slightly in the healed spot
                if (type === 'acneActive') {
                    imgData.data[i] -= 5 * healFactor; // Reduce R
                    imgData.data[i+1] += 2 * healFactor; // Boost G (counteract red)
                }
            } else if (type === 'redness') {
                // Global redness reduction
                // Move R closer to G
                if (r > g) {
                    imgData.data[i] = r - (r - g) * 0.3 * intensity;
                }
            }
        }

        // --- TEXTURE (Smart Smoothing) ---
        if (type === 'texture' || type === 'pigmentation') {
            // Logic: Guided Filter / Variance Mask
            // We want to blur skin (low variance) but keep edges (high variance).
            
            const variance = Math.abs(r - blurred[i]) + Math.abs(g - blurred[i+1]) + Math.abs(b - blurred[i+2]);
            
            // If variance is high (edge), mask = 0. If variance is low (skin texture), mask = 1.
            // Threshold ~30 for edges.
            let mask = 1 - Math.min(1, variance / 30);
            
            // Pigmentation needs stronger blurring on dark spots
            if (type === 'pigmentation') {
                const luma = (r + g + b) / 3;
                const blurLuma = (blurred[i] + blurred[i+1] + blurred[i+2]) / 3;
                if (luma < blurLuma) {
                    mask = 1.0; // Force smooth on dark spots
                }
            }

            const blend = mask * intensity;
            
            if (blend > 0) {
                imgData.data[i] = r + (blurred[i] - r) * blend;
                imgData.data[i+1] = g + (blurred[i+1] - g) * blend;
                imgData.data[i+2] = b + (blurred[i+2] - b) * blend;
            }
        }

        // --- DARK CIRCLES (Tone Mapping) ---
        if (type === 'darkCircles') {
            // Spatial Mask: Eye Band
            // Approx relative to center
            const relX = x - centerX;
            const relY = y - centerY;
            
            // Eyes are above center, within specific width
            const inEyeBand = relY < 0 && relY > -faceRadius * 0.5;
            const inEyeWidth = Math.abs(relX) < faceRadius * 0.7;
            
            if (inEyeBand && inEyeWidth) {
                // Luma Check: Is it a shadow?
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                if (luma < 140) {
                    // Brighten: Screen Blend Mode
                    // Result = 1 - (1 - Target) * (1 - Blend)
                    const boost = 40 * intensity;
                    
                    imgData.data[i] = Math.min(255, r + boost);
                    imgData.data[i+1] = Math.min(255, g + boost); // Boost green helps cancel purple/blue circles
                    imgData.data[i+2] = Math.min(255, b + boost * 0.8); // Less blue boost
                }
            }
        }
    }

    // 4. Return Data URL
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tCtx = tempCanvas.getContext('2d');
    if (tCtx) {
        tCtx.putImageData(imgData, 0, 0);
        return tempCanvas.toDataURL('image/jpeg', 0.9);
    }
    return sourceCtx.canvas.toDataURL();
};

// --- VALIDATION & UTILS (Kept for compatibility) ---

export const validateFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lastFacePos?: { cx: number, cy: number }
) => {
    // Simplified validation using center sampling
    const centerData = ctx.getImageData(width/2 - 10, height/2 - 10, 20, 20).data;
    let skinCount = 0;
    for(let i=0; i<centerData.length; i+=4) {
        if(isSkinPixel(centerData[i], centerData[i+1], centerData[i+2])) skinCount++;
    }
    
    // If > 30% of center is skin, we assume face is present
    const isGood = (skinCount / (centerData.length/4)) > 0.3;
    
    return {
        isGood,
        message: isGood ? "Perfect" : "Align Face",
        status: isGood ? "OK" : "WARNING",
        facePos: { cx: width/2, cy: height/2 }
    };
};

export const applyClinicalOverlays = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // No-op for now to keep overlay clean during rescan
};

export const preprocessForAI = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    return ctx.canvas.toDataURL('image/jpeg', 0.8);
};

export const drawBiometricOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, metrics: SkinMetrics) => {}; // No-op

// --- ANALYZE (Approximation for fast local feedback) ---
export const analyzeSkinFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): SkinMetrics => {
    // Generate mock metrics based on color histogram to be deterministic but fast
    const data = ctx.getImageData(0,0,width,height).data;
    let rSum=0, gSum=0, count=0;
    for(let i=0; i<data.length; i+=16) {
        if(isSkinPixel(data[i], data[i+1], data[i+2])) {
            rSum += data[i]; gSum += data[i+1]; count++;
        }
    }
    const redness = count ? (rSum/count) / (gSum/count) : 1.2;
    
    // Deterministic pseudo-random based on sums
    const seed = count;
    const score = 70 + (seed % 20);

    return {
        overallScore: score,
        acneActive: Math.min(99, Math.max(10, 100 - (redness - 1.1) * 100)),
        acneScars: score - 5,
        poreSize: score + 2,
        blackheads: score + 5,
        wrinkleFine: score,
        wrinkleDeep: score + 5,
        sagging: 85,
        pigmentation: score - 2,
        redness: Math.min(99, Math.max(10, 100 - (redness - 1.1) * 80)),
        texture: score,
        hydration: score - 10,
        oiliness: 60,
        darkCircles: score - 5,
        timestamp: Date.now()
    }
};
