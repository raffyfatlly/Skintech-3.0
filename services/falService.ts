
// Model: GPT Image 1.5 Edit
const MODEL = "fal-ai/gpt-image-1.5/edit";

// Declare the global constant injected by Vite
declare const __FAL_KEY__: string | undefined;

const getFalKey = (): string => {
    // 1. Try global constant defined in vite.config.ts (Most reliable for Vercel + Vite define)
    try {
        if (typeof __FAL_KEY__ !== 'undefined' && __FAL_KEY__) return __FAL_KEY__;
    } catch (e) {}

    // 2. Try Standard Vite Env (import.meta.env)
    try {
        // @ts-ignore
        if (import.meta.env.VITE_FAL_KEY) return import.meta.env.VITE_FAL_KEY;
        // @ts-ignore
        if (import.meta.env.FAL_KEY) return import.meta.env.FAL_KEY;
    } catch (e) {}

    // 3. Try Direct Process Env (Legacy/Fallback)
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env) {
            // @ts-ignore
            if (process.env.FAL_KEY) return process.env.FAL_KEY;
            // @ts-ignore
            if (process.env.VITE_FAL_KEY) return process.env.VITE_FAL_KEY;
        }
    } catch (e) {}

    return '';
};

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
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    // Re-check key at runtime in case of lazy loading issues
    const currentKey = FAL_KEY || getFalKey();

    if (!currentKey) {
        console.error("FAL_KEY is missing. Please check your Vercel Environment Variables.");
        throw new Error("System Error: FAL_KEY Missing. Please configure it in Settings.");
    }

    // 1. Optimize Image
    const optimizedImage = await resizeImage(imageBase64, 1024);

    // 2. Submit Request to Queue
    // NOTE: This model prefers simple instruction prompts and basic image inputs.
    const response = await fetch(`https://queue.fal.run/${MODEL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${currentKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_url: optimizedImage,
            prompt: "Retouch the skin to look healthy and clear. Reduce redness, minimize acne, smooth texture, but keep facial features and lighting natural.",
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Fal AI Error Detail:", err);
        throw new Error(`Fal AI Error: ${response.status} ${err}`);
    }

    const { request_id } = await response.json();

    // 3. Poll for Result
    return pollForResult(request_id, currentKey);
};

const pollForResult = async (requestId: string, key: string, attempts = 0): Promise<string> => {
    if (attempts > 60) throw new Error("Simulation timeout. Server is busy."); 

    await new Promise(r => setTimeout(r, 2000));

    const statusResponse = await fetch(`https://queue.fal.run/fal-ai/requests/${requestId}/status`, {
        method: 'GET',
        headers: {
            'Authorization': `Key ${key}`,
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
        
        const resultResponse = await fetch(resultUrl);
        
        if (!resultResponse.ok) {
             throw new Error(`Failed to fetch result JSON: ${resultResponse.status}`);
        }

        const resultJson = await resultResponse.json();
        
        if (resultJson.images && resultJson.images.length > 0) {
            return resultJson.images[0].url;
        }
        if (resultJson.image && resultJson.image.url) {
            return resultJson.image.url;
        }
        if (resultJson.url) {
            return resultJson.url;
        }
        
        throw new Error("Invalid result format from Fal AI");
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Simulation failed: ${statusData.error || 'Unknown error'}`);
    }

    return pollForResult(requestId, key, attempts + 1);
};
