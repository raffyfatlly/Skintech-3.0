
// Model: Flux Dev Image-to-Image
const MODEL = "fal-ai/flux/dev/image-to-image";

const getFalKey = (): string => {
    // 1. Try Standard Vite Env (Safe Access)
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            // @ts-ignore
            if (import.meta.env.VITE_FAL_KEY) return import.meta.env.VITE_FAL_KEY;
        }
    } catch (e) {}
    
    // 2. Try Injected Process Env (Safe Access via Vite define)
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && process.env.FAL_KEY) {
            // @ts-ignore
            return process.env.FAL_KEY;
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
                resolve(canvas.toDataURL('image/jpeg', 0.95));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    // Re-check key at runtime
    const currentKey = FAL_KEY || getFalKey();

    if (!currentKey) {
        console.error("FAL_KEY Missing. Please add VITE_FAL_KEY to your environment variables.");
        throw new Error("System Error: FAL_KEY Missing.");
    }

    // 1. Optimize Image
    const optimizedImage = await resizeImage(imageBase64, 1024);

    // 2. Submit Request to Queue (Flux Dev Image-to-Image)
    // Updated parameters based on user feedback for optimal skin texture retention
    const response = await fetch(`https://queue.fal.run/${MODEL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${currentKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_url: optimizedImage,
            prompt: "clinical dermatology photography, perfect healthy skin texture, reduced redness, reduced acne, clear pores, even skin tone, natural lighting, hyperrealistic, 8k resolution, soft focus background",
            strength: 0.35, 
            guidance_scale: 3.5,
            num_inference_steps: 24, 
            enable_safety_checker: false,
            seed: Math.floor(Math.random() * 1000000) 
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Fal AI Error Detail:", err);
        
        if (response.status === 401) {
             throw new Error("Fal AI Unauthorized: Invalid API Key.");
        }
        
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
        
        // CRITICAL FIX: The result URL (if it points to fal.run queue) requires Authentication headers
        const headers: HeadersInit = {};
        if (resultUrl.includes('fal.run')) {
             headers['Authorization'] = `Key ${key}`;
             headers['Content-Type'] = 'application/json';
        }

        const resultResponse = await fetch(resultUrl, {
            method: 'GET',
            headers: headers
        });
        
        if (!resultResponse.ok) {
             throw new Error(`Failed to fetch result JSON: ${resultResponse.status}`);
        }

        const resultJson = await resultResponse.json();
        console.log("Fal Result JSON:", resultJson); // Debug log
        
        // Standard Fal Flux response format check based on user provided JSON
        // Structure: { images: [ { url: "..." } ] }
        if (resultJson.images && Array.isArray(resultJson.images) && resultJson.images.length > 0) {
            return resultJson.images[0].url;
        }
        
        // Fallback checks just in case schema varies
        if (resultJson.image && resultJson.image.url) {
            return resultJson.image.url;
        }
        if (resultJson.url) {
            return resultJson.url;
        }
        
        console.error("Unknown Fal Response Structure:", resultJson);
        throw new Error("Invalid result format from Fal AI");
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Simulation failed: ${statusData.error || 'Unknown error'}`);
    }

    return pollForResult(requestId, key, attempts + 1);
};
