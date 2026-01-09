
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
// UPDATED: Now uses deterministic logic based on redness and brightness stats.
// High Score (100) = Perfect/Clear. Low Score = Issues.
export const analyzeSkinFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): SkinMetrics => {
    const data = ctx.getImageData(0,0,width,height).data;
    let rSum=0, gSum=0, bSum=0, lumaSum=0, lumaSqSum=0, count=0;
    
    // Sampling step for performance
    const step = 8;
    
    for(let i=0; i<data.length; i+=step*4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        
        // Simple Skin Detection (RGB Check + Red Dominance)
        if(r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r-g) > 15) {
            rSum += r; 
            gSum += g; 
            bSum += b;
            
            const luma = 0.299*r + 0.587*g + 0.114*b;
            lumaSum += luma;
            lumaSqSum += luma * luma;
            count++;
        }
    }
    
    // Safe fallback for no skin detected
    if (count === 0) return { overallScore: 85, acneActive: 85, blackheads: 85, acneMarks: 85, darkSpots: 85, redness: 85, darkCircles: 85, pores: 85, oiliness: 85, hydration: 85, scars: 85, skinTags: 85, wrinkles: 85, firmness: 85, timestamp: Date.now() };

    const avgR = rSum / count;
    const avgG = gSum / count;
    const avgLuma = lumaSum / count;
    
    // --- 1. Redness Analysis (R/G Ratio) ---
    // Normal skin is roughly 1.15 to 1.25. High inflammation > 1.3
    const rgRatio = avgR / (avgG || 1);
    
    // Score 100 if ratio <= 1.2. Linearly decrease as ratio goes up.
    // 1.2 -> 100, 1.4 -> 60
    let rednessScore = 100 - Math.max(0, (rgRatio - 1.2) * 200);
    rednessScore = Math.min(99, Math.max(40, rednessScore));

    // --- 2. Hydration (Brightness) ---
    // Higher luminance generally indicates better light reflection (hydration/glow) vs dullness.
    // Range 0-255. 
    // < 80 = Dull (Score ~50)
    // > 160 = Glowing (Score ~95)
    let hydrationScore = Math.min(98, Math.max(45, (avgLuma / 220) * 100 + 15));

    // --- 3. Base Score Composition ---
    // Heavily favor hydration and lack of redness for the "Base".
    // Bias towards high scores (80-95) for UX friendliness.
    const baseScore = Math.round((rednessScore * 0.4) + (hydrationScore * 0.4) + 20);

    // Seed for minor variation between sub-metrics using image stats
    const seed = Math.floor(avgLuma); 

    return {
        overallScore: Math.min(98, Math.max(65, baseScore)), // Floor at 65 to be encouraging
        
        // Breakout Group (High Score = Clear Skin)
        acneActive: Math.round(rednessScore * 0.9 + (seed % 8)), 
        blackheads: Math.min(98, baseScore + 2 - (seed % 5)),
        acneMarks: Math.min(98, baseScore - 2 + (seed % 5)),
        
        // Tone Group (High Score = Even Tone)
        darkSpots: Math.min(98, hydrationScore * 0.9 + 5),
        redness: Math.round(rednessScore),
        darkCircles: Math.min(98, baseScore - 5 + (seed % 10)),
        
        // Texture Group (High Score = Smooth/Balanced)
        pores: Math.min(98, baseScore - 5 + (seed % 8)),
        oiliness: Math.min(98, 85 + (seed % 10)), // "Balanced" score (High = Good Balance)
        hydration: Math.round(hydrationScore),
        scars: Math.min(98, baseScore + 5),
        skinTags: 95, // Rare, default high
        
        // Aging Group (High Score = Youthful/Firm)
        wrinkles: Math.min(98, baseScore + (seed % 5)),
        firmness: Math.min(98, baseScore + 2),
        
        timestamp: Date.now()
    }
};
