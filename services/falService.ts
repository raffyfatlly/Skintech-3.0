
// --- FAL.AI SERVICE ---
// Model: FLUX.1 [dev] Image-to-Image
// Doc: https://fal.ai/models/fal-ai/flux/dev/image-to-image

const MODEL = "fal-ai/flux/dev/image-to-image";

const getFalKey = (): string => {
    // 1. Try the variable injected by Vite (defined in vite.config.ts)
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.FAL_KEY) {
        // @ts-ignore
        return process.env.FAL_KEY;
    }

    // 2. Fallback to standard Vite Import (if named VITE_FAL_KEY locally)
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FAL_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_FAL_KEY;
        }
    } catch (e) {}

    return '';
};

// Initialize once
const FAL_KEY = getFalKey();

// Helper: Resize image to reduce payload size and API cost
const resizeImage = (base64Str: string, maxDimension: number = 1024): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Flux supports standard JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.90));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    const currentKey = FAL_KEY || getFalKey();

    if (!currentKey) {
        console.error("FAL_KEY Missing. Please check Vercel Environment Variables.");
        throw new Error("System Error: FAL_KEY Missing.");
    }

    const optimizedImage = await resizeImage(imageBase64, 1024);

    // CRITICAL PROMPT ENGINEERING:
    // Focus purely on texture while strictly forbidding structural changes.
    const PROMPT = "clinical dermatology photography, clear skin, smooth texture, healthy skin barrier, reduced redness, reduced acne, high resolution. PRESERVE EXACT FACIAL FEATURES. DO NOT CHANGE EYES, NOSE, MOUTH, HAIR, OR BACKGROUND. ONLY IMPROVE SKIN TEXTURE.";

    // Submit Request to Queue (Async for robustness)
    const response = await fetch(`https://queue.fal.run/${MODEL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${currentKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_url: optimizedImage,
            prompt: PROMPT,
            // "The strength of the initial image." 
            // 1.0 = Return original exactly. 0.0 = Generate completely new image.
            // 0.85 is the sweet spot: It keeps the face 85% intact (identity) but allows 15% variance for skin healing.
            strength: 0.85, 
            guidance_scale: 3.5,
            num_inference_steps: 28, 
            enable_safety_checker: false, 
            output_format: "jpeg"
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Fal AI Error Detail:", err);
        if (response.status === 401) throw new Error("Fal AI Unauthorized: Invalid API Key.");
        throw new Error(`Fal AI Error: ${response.status} ${err}`);
    }

    const { request_id } = await response.json();
    return pollForResult(request_id, currentKey);
};

const pollForResult = async (requestId: string, key: string, attempts = 0): Promise<string> => {
    if (attempts > 60) throw new Error("Simulation timeout. Server is busy."); 

    await new Promise(r => setTimeout(r, 2000));

    try {
        const statusResponse = await fetch(`https://queue.fal.run/${MODEL}/requests/${requestId}/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Key ${key}`,
                'Content-Type': 'application/json',
            },
        });

        if (!statusResponse.ok) {
            // Fallback for generic endpoint if model specific fails
            if (statusResponse.status === 404) {
                 const genericResponse = await fetch(`https://queue.fal.run/fal-ai/requests/${requestId}/status`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Key ${key}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!genericResponse.ok) throw new Error(`Failed to check status: ${genericResponse.status}`);
                return processStatusResponse(await genericResponse.json(), requestId, key, attempts);
            }
            throw new Error(`Failed to check status: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();
        return processStatusResponse(statusData, requestId, key, attempts);
    } catch (e) {
        console.warn("Polling error (retrying):", e);
        return pollForResult(requestId, key, attempts + 1);
    }
};

const processStatusResponse = async (statusData: any, requestId: string, key: string, attempts: number): Promise<string> => {
    if (statusData.status === 'COMPLETED') {
        
        // 1. Check if result is embedded directly in status (Fast path for Flux)
        // Schema: { "images": [ { "url": "...", "content_type": "image/jpeg" } ] }
        if (statusData.images && Array.isArray(statusData.images) && statusData.images.length > 0) {
            return statusData.images[0].url;
        }

        // 2. Check response_url
        const resultUrl = statusData.response_url;
        if (resultUrl) {
            const resultJson = await fetchResult(resultUrl, key);
            return extractImageFromJson(resultJson);
        }

        // 3. Last resort check
        if (statusData.image && statusData.image.url) return statusData.image.url;

        console.error("Completed status but no result found:", statusData);
        throw new Error("Completed but no result found in response.");
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Simulation failed: ${statusData.error || 'Unknown error'}`);
    }

    // Still processing
    return pollForResult(requestId, key, attempts + 1);
};

// Robust fetcher that handles Signed URLs vs API URLs
const fetchResult = async (url: string, key: string): Promise<any> => {
    // Strategy 1: Try without headers first (Standard for signed storage URLs)
    try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
    } catch (e) {
        console.warn("Direct fetch failed, trying with auth...");
    }

    // Strategy 2: Try with headers (If it's an API endpoint)
    try {
        const resWithAuth = await fetch(url, {
            headers: { 'Authorization': `Key ${key}` }
        });
        if (resWithAuth.ok) return await resWithAuth.json();
        
        const errText = await resWithAuth.text();
        throw new Error(`Fetch failed: ${resWithAuth.status} ${errText}`);
    } catch (e: any) {
        throw new Error(`Failed to fetch result from ${url}: ${e.message}`);
    }
};

const extractImageFromJson = (json: any): string => {
    if (!json) throw new Error("Empty result JSON");

    // Flux Standard Output Schema
    if (json.images && Array.isArray(json.images) && json.images.length > 0) {
        return json.images[0].url;
    }
    
    // Other Fal Models Fallback
    if (json.image && json.image.url) return json.image.url;
    if (json.url) return json.url;
    
    console.error("Unknown Fal Response Structure:", json);
    throw new Error("Invalid result format from Fal AI.");
};
