
// Updated Model: Flux Dev Image-to-Image (Best for identity preservation + texture healing)
const MODEL = "fal-ai/flux/dev/image-to-image";

// Declare the global constant injected by Vite
declare const __FAL_KEY__: string | undefined;

const getFalKey = (): string => {
    // 1. Try global constant injected by Vite define (Most reliable)
    try {
        if (typeof __FAL_KEY__ !== 'undefined' && __FAL_KEY__) {
            return __FAL_KEY__;
        }
    } catch (e) {}

    // 2. Try Vite standard import.meta.env (Client-side VITE_ prefix)
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FAL_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_FAL_KEY;
        }
    } catch (e) {}
    
    // 3. Try global process.env (Legacy/Bundler injection)
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && process.env.FAL_KEY) {
            // @ts-ignore
            return process.env.FAL_KEY;
        }
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && process.env.VITE_FAL_KEY) {
            // @ts-ignore
            return process.env.VITE_FAL_KEY;
        }
    } catch (e) {}

    return '';
};

// Initialize key once
const FAL_KEY = getFalKey();

// Helper: Resize image to reduce payload size and API cost (HD Quality Mode)
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
                // Return high quality JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            } else {
                resolve(base64Str); // Fallback
            }
        };
        img.onerror = () => resolve(base64Str); // Fallback
    });
};

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    if (!FAL_KEY) {
        console.error("FAL_KEY is missing. Please ensure 'FAL_KEY' or 'VITE_FAL_KEY' is set in your Vercel Environment Variables and you have redeployed.");
        throw new Error("Missing FAL_KEY. Please add FAL_KEY to your environment variables.");
    }

    // 1. Optimize Image (Resize to 1024px max for HD results)
    const optimizedImage = await resizeImage(imageBase64, 1024);

    // 2. Submit Request to Queue (Flux Dev Image-to-Image)
    // Strength 0.35 ensures we keep identity but fix texture issues.
    const response = await fetch(`https://queue.fal.run/${MODEL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_url: optimizedImage,
            prompt: "clinical dermatology photography, perfect healthy skin texture, reduced redness, reduced acne, clear pores, even skin tone, natural lighting, hyperrealistic, 8k resolution, soft focus background",
            strength: 0.35, 
            guidance_scale: 3.5,
            steps: 24,
            enable_safety_checker: false
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Fal AI Error: ${response.status} ${err}`);
    }

    const { request_id } = await response.json();

    // 3. Poll for Result
    return pollForResult(request_id);
};

const pollForResult = async (requestId: string, attempts = 0): Promise<string> => {
    // Increase timeout to 120s (60 attempts * 2s) to handle cold starts
    if (attempts > 60) throw new Error("Simulation timeout. Server is busy."); 

    // Wait 2s
    await new Promise(r => setTimeout(r, 2000));

    const statusResponse = await fetch(`https://queue.fal.run/fal-ai/requests/${requestId}/status`, {
        method: 'GET',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
    });

    if (!statusResponse.ok) {
        throw new Error("Failed to check status");
    }

    const statusData = await statusResponse.json();

    if (statusData.status === 'COMPLETED') {
        const resultUrl = statusData.response_url;
        if (!resultUrl) throw new Error("Completed but no result URL found");
        
        // CRITICAL: Do NOT send Authorization header to the resultUrl (Signed URL).
        const resultResponse = await fetch(resultUrl);
        
        if (!resultResponse.ok) {
             throw new Error(`Failed to fetch result JSON: ${resultResponse.status}`);
        }

        const resultJson = await resultResponse.json();
        
        // Handle various output schemas
        if (resultJson.images && resultJson.images.length > 0) {
            return resultJson.images[0].url;
        }
        if (resultJson.image && resultJson.image.url) {
            return resultJson.image.url;
        }
        if (resultJson.url) {
            return resultJson.url;
        }
        
        console.error("Unexpected JSON structure:", resultJson);
        throw new Error("Invalid result format from Fal AI");
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Simulation failed: ${statusData.error || 'Unknown error'}`);
    }

    // Still processing/queueing
    return pollForResult(requestId, attempts + 1);
};
