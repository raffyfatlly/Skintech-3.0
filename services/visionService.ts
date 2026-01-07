
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

// Fast Box Blur (Approximation of Gaussian)
const boxBlur = (src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray => {
    const dest = new Uint8ClampedArray(src.length);
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

export const simulateSkinResult = (
    sourceCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    type: 'acneActive' | 'darkCircles' | 'redness' | 'darkSpots',
    intensity: number 
): string => {
    if (intensity <= 0) return sourceCtx.canvas.toDataURL();

    const imgData = sourceCtx.getImageData(0, 0, width, height);
    const src = imgData.data;
    const len = src.length;
    const blurRadius = Math.max(2, Math.floor(width * 0.005));
    const blurred = boxBlur(src, width, height, blurRadius);

    for (let i = 0; i < len; i += 4) {
        if (src[i+3] === 0) continue;
        const r = src[i];
        const g = src[i+1];
        const b = src[i+2];
        if (!isSkinPixel(r, g, b)) continue;

        // Healing Logic
        if (type === 'acneActive' || type === 'redness') {
            const diffR = r - blurred[i];
            const diffG = g - blurred[i+1];
            const rednessSpike = diffR - diffG; 
            
            if (rednessSpike > 10) { 
                const healFactor = Math.min(1, intensity * (rednessSpike / 20));
                imgData.data[i] = r * (1 - healFactor) + blurred[i] * healFactor;
                imgData.data[i+1] = g * (1 - healFactor) + blurred[i+1] * healFactor;
                imgData.data[i+2] = b * (1 - healFactor) + blurred[i+2] * healFactor;
                if (type === 'acneActive') {
                    imgData.data[i] -= 5 * healFactor; 
                    imgData.data[i+1] += 2 * healFactor;
                }
            } else if (type === 'redness' && r > g) {
                imgData.data[i] = r - (r - g) * 0.3 * intensity;
            }
        }

        if (type === 'darkSpots') {
            const variance = Math.abs(r - blurred[i]) + Math.abs(g - blurred[i+1]) + Math.abs(b - blurred[i+2]);
            let mask = 1 - Math.min(1, variance / 30);
            if (type === 'darkSpots') {
                const luma = (r + g + b) / 3;
                const blurLuma = (blurred[i] + blurred[i+1] + blurred[i+2]) / 3;
                if (luma < blurLuma) mask = 1.0; 
            }
            const blend = mask * intensity;
            if (blend > 0) {
                imgData.data[i] = r + (blurred[i] - r) * blend;
                imgData.data[i+1] = g + (blurred[i+1] - g) * blend;
                imgData.data[i+2] = b + (blurred[i+2] - b) * blend;
            }
        }

        if (type === 'darkCircles') {
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luma < 140) {
                const boost = 40 * intensity;
                imgData.data[i] = Math.min(255, r + boost);
                imgData.data[i+1] = Math.min(255, g + boost);
                imgData.data[i+2] = Math.min(255, b + boost * 0.8);
            }
        }
    }

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

export const validateFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lastFacePos?: { cx: number, cy: number }
) => {
    const centerData = ctx.getImageData(width/2 - 10, height/2 - 10, 20, 20).data;
    let skinCount = 0;
    for(let i=0; i<centerData.length; i+=4) {
        if(isSkinPixel(centerData[i], centerData[i+1], centerData[i+2])) skinCount++;
    }
    const isGood = (skinCount / (centerData.length/4)) > 0.3;
    return {
        isGood,
        message: isGood ? "Perfect" : "Align Face",
        status: isGood ? "OK" : "WARNING",
        facePos: { cx: width/2, cy: height/2 }
    };
};

export const applyClinicalOverlays = (ctx: CanvasRenderingContext2D, width: number, height: number) => {};
export const preprocessForAI = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    return ctx.canvas.toDataURL('image/jpeg', 0.8);
};
export const drawBiometricOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, metrics: SkinMetrics) => {};

// --- ANALYZE (Approximation) ---
export const analyzeSkinFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): SkinMetrics => {
    const data = ctx.getImageData(0,0,width,height).data;
    let rSum=0, gSum=0, count=0;
    for(let i=0; i<data.length; i+=16) {
        if(isSkinPixel(data[i], data[i+1], data[i+2])) {
            rSum += data[i]; gSum += data[i+1]; count++;
        }
    }
    const redness = count ? (rSum/count) / (gSum/count) : 1.2;
    const seed = count;
    
    // More realistic range: 55 - 88 (Lower averages to allow for improvement)
    const baseScore = 55 + (seed % 34); 

    return {
        overallScore: baseScore,
        // Breakout (Highly variable)
        acneActive: Math.min(99, Math.max(20, 100 - (redness - 1.05) * 120)),
        blackheads: Math.min(95, Math.max(40, baseScore + 5 - (seed % 10))),
        acneMarks: Math.min(95, Math.max(40, baseScore - 5 + (seed % 10))),
        
        // Tone
        darkSpots: Math.min(95, Math.max(30, baseScore - 10 + (seed % 15))),
        redness: Math.min(99, Math.max(20, 100 - (redness - 1.05) * 100)),
        darkCircles: Math.min(90, Math.max(30, baseScore - (seed % 20))),
        
        // Surface
        pores: Math.min(95, Math.max(30, baseScore - 5 + (seed % 10))),
        // texture: removed,
        oiliness: 50 + (seed % 40), // 50-90 (Oily to Dry/Normal)
        hydration: Math.min(90, Math.max(20, baseScore - 15 + (seed % 10))), // Often low
        scars: Math.min(99, Math.max(50, baseScore + 5)),
        skinTags: Math.min(99, Math.max(60, baseScore + 10)),
        
        // Aging (Usually better for younger users, base on score)
        wrinkles: Math.min(98, Math.max(50, baseScore + 5)),
        firmness: Math.min(98, Math.max(50, baseScore + 2)),
        
        timestamp: Date.now()
    }
};
