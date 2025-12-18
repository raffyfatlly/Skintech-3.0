
import { SkinMetrics } from '../types';

/**
 * Checks video frame quality before analysis.
 */
export const validateFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lastFacePos?: { cx: number, cy: number }
): { isGood: boolean; message: string; facePos?: { cx: number, cy: number }; instruction?: string; status: 'OK' | 'WARNING' | 'ERROR' } => {
  const { cx, cy, faceWidth } = detectFaceBounds(ctx, width, height);
  
  let status: 'OK' | 'WARNING' | 'ERROR' = 'OK';
  let message = "Perfect";
  let instruction = "Hold steady...";

  if (faceWidth < width * 0.15) {
       return { isGood: false, message: "No Face", instruction: "Position face in circle", status: 'ERROR' };
  }

  if (faceWidth < width * 0.25) {
      status = 'WARNING';
      message = "Move Closer";
      instruction = "Move Closer";
  } else if (faceWidth > width * 0.85) {
      status = 'WARNING';
      message = "Too Close";
      instruction = "Back up slightly";
  }

  const p = ctx.getImageData(Math.floor(cx), Math.floor(cy), 1, 1).data;
  const luma = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

  if (luma < 40) {
      status = 'WARNING';
      message = "Low Light";
      instruction = "Face light source";
  } else if (luma > 230) {
      status = 'WARNING';
      message = "Too Bright";
      instruction = "Reduce glare";
  }

  if (lastFacePos) {
      const dist = Math.sqrt(Math.pow(cx - lastFacePos.cx, 2) + Math.pow(cy - lastFacePos.cy, 2));
      if (dist > width * 0.1) { 
          status = 'WARNING';
          message = "Hold Still";
          instruction = "Hold Still";
      }
  }

  return { isGood: true, message, facePos: { cx, cy }, instruction, status };
};

const normalizeScore = (raw: number): number => {
    return Math.round(Math.max(10, Math.min(99, raw)));
};

// --- ADVANCED CV KERNELS ---

// Convert RGB to CIE-LAB (Perceptually Uniform Color Space)
// We use this because 'a' channel perfectly isolates Red/Green, ignoring lighting (L)
const rgbToLab = (r: number, g: number, b: number) => {
    let r1 = r / 255, g1 = g / 255, b1 = b / 255;
    r1 = (r1 > 0.04045) ? Math.pow((r1 + 0.055) / 1.055, 2.4) : r1 / 12.92;
    g1 = (g1 > 0.04045) ? Math.pow((g1 + 0.055) / 1.055, 2.4) : g1 / 12.92;
    b1 = (b1 > 0.04045) ? Math.pow((b1 + 0.055) / 1.055, 2.4) : b1 / 12.92;

    const x = (r1 * 0.4124 + g1 * 0.3576 + b1 * 0.1805) / 0.95047;
    const y = (r1 * 0.2126 + g1 * 0.7152 + b1 * 0.0722) / 1.00000;
    const z = (r1 * 0.0193 + g1 * 0.1192 + b1 * 0.9505) / 1.08883;

    const fx = (x > 0.008856) ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    const fy = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    const fz = (z > 0.008856) ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

    return {
        L: (116 * fy) - 16, // Lightness
        a: 500 * (fx - fy), // Red-Green Axis (Positive = Red)
        b: 200 * (fy - fz)  // Blue-Yellow Axis
    };
};

const labToRgb = (L: number, a: number, b: number) => {
    let y = (L + 16) / 116;
    let x = a / 500 + y;
    let z = y - b / 200;

    const x3 = x * x * x;
    const y3 = y * y * y;
    const z3 = z * z * z;

    x = (x3 > 0.008856) ? x3 : (x - 16/116) / 7.787;
    y = (y3 > 0.008856) ? y3 : (y - 16/116) / 7.787;
    z = (z3 > 0.008856) ? z3 : (z - 16/116) / 7.787;

    x = x * 0.95047;
    y = y * 1.00000;
    z = z * 1.08883;

    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let bl = x * 0.0557 + y * -0.2040 + z * 1.0570;

    r = (r > 0.0031308) ? (1.055 * Math.pow(r, 1/2.4) - 0.055) : 12.92 * r;
    g = (g > 0.0031308) ? (1.055 * Math.pow(g, 1/2.4) - 0.055) : 12.92 * g;
    bl = (bl > 0.0031308) ? (1.055 * Math.pow(bl, 1/2.4) - 0.055) : 12.92 * bl;

    return {
        r: Math.max(0, Math.min(255, Math.round(r * 255))),
        g: Math.max(0, Math.min(255, Math.round(g * 255))),
        b: Math.max(0, Math.min(255, Math.round(bl * 255)))
    };
};

// --- ALGORITHMS ---

// 1. ACNE: Redness + Local Darkening (Inflammation)
function calculateAcneScore(img: ImageData): number {
    let acnePixels = 0;
    const totalPixels = img.width * img.height;
    const data = img.data;

    // Calculate baseline stats
    let sumA = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) { // Sampling
        const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
        sumA += a;
        count++;
    }
    const avgA = count > 0 ? sumA / count : 128;
    
    // UPDATED: Relaxed Threshold (+18) to avoid false positives on healthy blood flow/flush
    const rednessThreshold = avgA + 18; 

    for (let i = 0; i < data.length; i += 4) {
        const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
        if (a > rednessThreshold) {
            acnePixels++;
        }
    }

    // UPDATED: Relaxed Penalty Formula
    const density = acnePixels / totalPixels;
    // New: 5% coverage (0.05) -> 100 - 50 = 50 Score (Average/Fair).
    return Math.max(10, 100 - (density * 1000));
}

// 2. REDNESS: Global Inflammation (Erythema)
function calculateRednessScore(img: ImageData): number {
    const data = img.data;
    let sumA = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
        sumA += a;
        count++;
    }
    
    const avgA = count > 0 ? sumA / count : 15;
    
    // Healthy skin 'a' value is usually around 15-20 in sRGB.
    // Relaxed baseline from 14 to 18 to account for varying skin undertones.
    if (avgA <= 18) return 95;
    const penalty = (avgA - 18) * 3.0;
    return Math.max(20, 100 - penalty);
}

// 3. TEXTURE: Laplacian Variance (Roughness/Pores)
function calculateTextureScore(img: ImageData): number {
    const w = img.width;
    const h = img.height;
    const data = img.data;
    let varianceSum = 0;
    let pixels = 0;

    // Laplacian Kernel (Edge Detection)
    
    for (let y = 1; y < h - 1; y += 2) {
        for (let x = 1; x < w - 1; x += 2) {
            const i = (y * w + x) * 4;
            // Convert to grayscale roughly
            const c = (data[i] + data[i+1] + data[i+2]) / 3;
            
            const up = (data[((y-1)*w+x)*4] + data[((y-1)*w+x)*4+1] + data[((y-1)*w+x)*4+2])/3;
            const down = (data[((y+1)*w+x)*4] + data[((y+1)*w+x)*4+1] + data[((y+1)*w+x)*4+2])/3;
            const left = (data[((y)*w+(x-1))*4] + data[((y)*w+(x-1))*4+1] + data[((y)*w+(x-1))*4+2])/3;
            const right = (data[((y)*w+(x+1))*4] + data[((y)*w+(x+1))*4+1] + data[((y)*w+(x+1))*4+2])/3;

            const laplacian = Math.abs(up + down + left + right - (4 * c));
            
            // Ignore very high laplacian (edges/hair) and very low (flat)
            if (laplacian > 5 && laplacian < 80) { // Increased upper bound slightly
                varianceSum += laplacian;
            }
            pixels++;
        }
    }

    const avgRoughness = pixels > 0 ? varianceSum / pixels : 0;
    
    // UPDATED: Shifted baseline for typical camera noise.
    // Average phone camera skin texture is often ~3-4 due to noise.
    // Real "Glass Skin" ~1.5. 
    // Shift baseline from 1.0 to 2.5 to be less punishing.
    // Avg 4.0 -> 100 - (1.5 * 10) = 85.
    const score = 100 - ((avgRoughness - 2.5) * 10);
    
    return Math.max(10, Math.min(99, score));
}

// 4. WRINKLES: Sobel Edge Detection (Horizontal)
function calculateWrinkleScore(img: ImageData): number {
    const w = img.width;
    const h = img.height;
    const data = img.data;
    let edgePixels = 0;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            
            const getL = (ox: number, oy: number) => {
                const i = ((y + oy) * w + (x + ox)) * 4;
                return 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
            }

            const tl = getL(-1, -1); const t = getL(0, -1); const tr = getL(1, -1);
            const bl = getL(-1, 1);  const b = getL(0, 1);  const br = getL(1, 1);

            const sobelY = (bl + 2*b + br) - (tl + 2*t + tr);
            
            // UPDATED: Increased threshold to 60 to ignore micro-texture/pores
            if (Math.abs(sobelY) > 60) { 
                edgePixels++;
            }
        }
    }

    const density = edgePixels / (w * h);
    // Relaxed penalty
    return Math.max(20, 100 - (density * 300));
}

// 5. HYDRATION: Specular Reflection Analysis
function calculateHydrationScore(img: ImageData): number {
    let glowPixels = 0;
    const total = img.data.length / 4;
    
    for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
        const l = 0.299*r + 0.587*g + 0.114*b;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        
        // Slightly broadened range for highlights
        if (l > 160 && l < 245 && sat < 0.4 && sat > 0.05) {
            glowPixels++;
        }
    }
    
    const glowDensity = glowPixels / total;
    // Adjusted target to 12% highlights (realistic healthy glow)
    const deviation = Math.abs(glowDensity - 0.12); 
    
    return Math.max(20, 100 - (deviation * 200));
}

// 6. DARK CIRCLES: Luma Contrast (Eye vs Cheek)
function calculateDarkCircleScore(eyeImg: ImageData, cheekImg: ImageData): number {
    const getAvgLuma = (d: ImageData) => {
        let s = 0;
        for(let i=0; i<d.data.length; i+=4) s += (0.299*d.data[i] + 0.587*d.data[i+1] + 0.114*d.data[i+2]);
        return s / (d.data.length/4);
    }
    
    const eyeL = getAvgLuma(eyeImg);
    const cheekL = getAvgLuma(cheekImg);
    
    const diff = Math.max(0, cheekL - eyeL);
    // Relaxed penalty (shadows are natural)
    return Math.max(30, 100 - (diff * 2.0));
}

/**
 * PRE-PROCESSING PIPELINE
 * Normalizes image for AI consumption.
 */
export const preprocessForAI = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
): string => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const len = data.length;

    let sumLuma = 0;
    for (let i = 0; i < len; i += 16) { 
        sumLuma += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    const avgLuma = sumLuma / (len / 16);
    
    const exposureBias = 128 - avgLuma; 
    const contrast = 1.15; 
    const intercept = 128 * (1 - contrast);
    
    for (let i = 0; i < len; i += 4) {
        let r = data[i] + exposureBias;
        let g = data[i+1] + exposureBias;
        let b = data[i+2] + exposureBias;

        r = (r * contrast) + intercept;
        g = (g * contrast) + intercept;
        b = (b * contrast) + intercept;

        data[i] = Math.max(0, Math.min(255, r));
        data[i+1] = Math.max(0, Math.min(255, g));
        data[i+2] = Math.max(0, Math.min(255, b));
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
    }

    return tempCanvas.toDataURL('image/jpeg', 0.98); 
};


export const applyMedicalProcessing = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.05);
        for (let c = 0; c < 3; c++) {
            let val = data[i+c];
            val = ((val - 128) * 1.1) + 128;
            data[i+c] = Math.max(0, Math.min(255, val));
        }
    }
    ctx.putImageData(imageData, 0, 0);
};

export const applyClinicalOverlays = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
) => {
    const { cx, cy, faceWidth, faceHeight } = detectFaceBounds(ctx, width, height);
    if (faceWidth === 0) return;

    applyMedicalProcessing(ctx, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    ctx.lineWidth = 1; 
    const scanStep = 8; 
    
    for (let y = Math.floor(cy - faceHeight * 0.45); y < cy + faceHeight * 0.5; y += scanStep) {
        for (let x = Math.floor(cx - faceWidth * 0.45); x < cx + faceWidth * 0.45; x += scanStep) {
            const i = (y * width + x) * 4;
            if (data[i+3] === 0) continue;
            
            const { a } = rgbToLab(data[i], data[i+1], data[i+2]);
            if (a > 20) {
                 ctx.fillStyle = 'rgba(255, 50, 50, 0.4)';
                 ctx.fillRect(x, y, 2, 2);
            }
        }
    }
};

const isSkinPixel = (r: number, g: number, b: number): boolean => {
    return (r > 40 && g > 20 && b > 10 && r > g && r > b);
};

const detectFaceBounds = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let sumX = 0, sumY = 0, count = 0;
    const step = 20; 
    
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            if (isSkinPixel(data[i], data[i+1], data[i+2])) {
                sumX += x; sumY += y; count++;
            }
        }
    }

    if (count < 50) return { cx: width/2, cy: height/2, faceWidth: 0, faceHeight: 0 }; 

    const cx = sumX / count;
    const cy = sumY / count;
    const faceWidth = Math.sqrt(count * step * step) * 1.5; 
    const faceHeight = faceWidth * 1.35; 

    return { cx, cy, faceWidth, faceHeight };
};

const getNormalizedROI = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    if (x < 0) x = 0; if (y < 0) y = 0;
    w = Math.min(w, ctx.canvas.width - x);
    h = Math.min(h, ctx.canvas.height - y);
    
    const imgData = ctx.getImageData(x, y, w, h);
    return imgData; 
};

export const drawBiometricOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    metrics: SkinMetrics
) => {
    const { cx, cy, faceWidth, faceHeight } = detectFaceBounds(ctx, width, height);
    if (faceWidth === 0) return;

    const drawROI = (x: number, y: number, r: number, score: number, label: string) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        const color = score > 80 ? '#10B981' : score < 60 ? '#F43F5E' : '#F59E0B'; // Emerald, Rose, Amber
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${label}: ${Math.round(score)}`, x - r, y - r - 5);
    };

    const roiSize = faceWidth * 0.12;

    // Forehead (Wrinkles)
    drawROI(cx, cy - faceHeight * 0.35, roiSize, metrics.wrinkleFine, "Wrinkles");
    
    // Cheeks (Acne/Redness)
    drawROI(cx - faceWidth * 0.2, cy + faceHeight * 0.05, roiSize, metrics.acneActive, "Acne");
    drawROI(cx + faceWidth * 0.2, cy + faceHeight * 0.05, roiSize, metrics.redness, "Tone");
    
    // Nose (Pores)
    drawROI(cx, cy + faceHeight * 0.1, roiSize * 0.8, metrics.poreSize, "Pores");
    
    // Eyes (Dark Circles)
    drawROI(cx - faceWidth * 0.15, cy - faceHeight * 0.1, roiSize * 0.8, metrics.darkCircles, "Eyes");
};

export const analyzeSkinFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): SkinMetrics => {
  const { cx, cy, faceWidth, faceHeight } = detectFaceBounds(ctx, width, height);
  const roiSize = Math.floor(faceWidth * 0.25); 

  // Define Regions of Interest (ROIs)
  const foreheadY = cy - faceHeight * 0.35;
  const cheekY = cy + faceHeight * 0.05;
  const eyeY = cy - faceHeight * 0.12;
  const noseY = cy + faceHeight * 0.1;
  
  const foreheadData = getNormalizedROI(ctx, cx - roiSize, foreheadY, roiSize*2, roiSize*0.6);
  const leftCheekData = getNormalizedROI(ctx, cx - faceWidth * 0.28, cheekY, roiSize, roiSize);
  const rightCheekData = getNormalizedROI(ctx, cx + faceWidth * 0.08, cheekY, roiSize, roiSize);
  const eyeData = getNormalizedROI(ctx, cx - roiSize, eyeY, roiSize * 2, roiSize * 0.4);
  const noseData = getNormalizedROI(ctx, cx - roiSize/2, noseY, roiSize, roiSize * 0.5);

  // --- EXECUTE ALGORITHMS ---
  
  // 1. Acne (Cheeks are best indicator)
  const acneScore = calculateAcneScore(leftCheekData);
  
  // 2. Redness (Cheeks + Nose)
  const cheekRedness = calculateRednessScore(leftCheekData);
  const noseRedness = calculateRednessScore(noseData);
  const rednessScore = (cheekRedness + noseRedness) / 2;
  
  // 3. Texture (Cheek Variance)
  const textureScore = calculateTextureScore(rightCheekData);
  
  // 4. Wrinkles (Forehead)
  const wrinkleScore = calculateWrinkleScore(foreheadData);
  const deepWrinkleScore = Math.max(10, wrinkleScore - 10); // Approximation
  
  // 5. Hydration (Cheek Specular)
  const hydrationScore = calculateHydrationScore(rightCheekData);
  
  // 6. Dark Circles (Eye vs Cheek Contrast)
  const darkCircleScore = calculateDarkCircleScore(eyeData, leftCheekData);
  
  // 7. Pores (Nose)
  const poreScore = calculateTextureScore(noseData); // Pores are texture
  
  // 8. Oiliness (T-Zone: Forehead + Nose)
  const foreheadOil = calculateHydrationScore(foreheadData); // Shiny = Oily
  const noseOil = calculateHydrationScore(noseData);
  // High shine (high score) means oily? 
  // No, hydration score is based on "healthy glow". 
  // Excessive shine saturation might be distinct. 
  // For now, mapping high hydration to "balanced", but excessive might need penalty.
  // Using simplified logic: 
  const oilinessScore = (foreheadOil + noseOil) / 2;

  // 9. Pigmentation (Global vs Local Luma Variance)
  // Not implemented fully, using texture proxy
  const pigmentationScore = textureScore + 5; 

  // 10. Sagging (Jawline edge detection - simplified placeholder)
  const saggingScore = 85; 

  // Overall Score Weighted Average
  const overallScore = (
      acneScore * 0.25 + 
      rednessScore * 0.15 + 
      textureScore * 0.20 + 
      wrinkleScore * 0.15 + 
      hydrationScore * 0.15 +
      darkCircleScore * 0.10
  );

  return {
      overallScore: normalizeScore(overallScore),
      acneActive: normalizeScore(acneScore),
      acneScars: normalizeScore(acneScore + 10),
      poreSize: normalizeScore(poreScore),
      blackheads: normalizeScore(poreScore + 5),
      wrinkleFine: normalizeScore(wrinkleScore),
      wrinkleDeep: normalizeScore(deepWrinkleScore),
      sagging: normalizeScore(saggingScore),
      pigmentation: normalizeScore(pigmentationScore),
      redness: normalizeScore(rednessScore),
      texture: normalizeScore(textureScore),
      hydration: normalizeScore(hydrationScore),
      oiliness: normalizeScore(oilinessScore),
      darkCircles: normalizeScore(darkCircleScore),
      timestamp: Date.now()
  };
};