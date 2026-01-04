
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

// Helper: Convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error("Failed to convert blob to base64"));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
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

    // Use specific model endpoint for status
    const statusResponse = await fetch(`https://queue.fal.run/${MODEL}/requests/${requestId}/status`, {
        method: 'GET',
        headers: {
            'Authorization': `Key ${key}`,
            'Content-Type': 'application/json',
        },
    });

    if (!statusResponse.ok) {
        // Fallback to generic endpoint if specific fails (404)
        if (statusResponse.status === 404) {
             console.warn("Specific status endpoint failed, trying generic...");
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
};

const processStatusResponse = async (statusData: any, requestId: string, key: string, attempts: number): Promise<string> => {
    if (statusData.status === 'COMPLETED') {
        const resultUrl = statusData.response_url;
        if (!resultUrl) throw new Error("Completed but no result URL found");
        
        // Fetch Result JSON
        const headers: HeadersInit = {};
        // Only add Auth header for fal.run domains
        if (resultUrl.includes('fal.run')) {
             headers['Authorization'] = `Key ${key}`;
        }

        const resultResponse = await fetch(resultUrl, {
            method: 'GET',
            headers: headers
        });
        
        let resultJson;
        if (!resultResponse.ok) {
             // Try fetching without headers if it failed (maybe signed URL mismatch)
             if (resultResponse.status === 403 || resultResponse.status === 401) {
                 console.warn("Initial result fetch failed, retrying without auth headers...");
                 const retryResponse = await fetch(resultUrl);
                 if (retryResponse.ok) {
                     resultJson = await retryResponse.json();
                 } else {
                     throw new Error(`Failed to fetch result JSON: ${resultResponse.status}`);
                 }
             } else {
                 throw new Error(`Failed to fetch result JSON: ${resultResponse.status}`);
             }
        } else {
            resultJson = await resultResponse.json();
        }

        console.log("Fal Result JSON:", resultJson);
        const imageUrl = extractImageFromJson(resultJson);

        // DOWNLOAD AND CONVERT TO BASE64
        // This ensures downstream components (like Gemini Plan Generator) receive a valid Data URL
        // instead of a remote URL they can't access.
        try {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) throw new Error(`Failed to download generated image: ${imageResponse.status}`);
            const imageBlob = await imageResponse.blob();
            return await blobToBase64(imageBlob);
        } catch (e) {
            console.error("Image Download Failed:", e);
            throw new Error("Failed to download the generated image.");
        }
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Simulation failed: ${statusData.error || 'Unknown error'}`);
    }

    return pollForResult(requestId, key, attempts + 1);
}

const extractImageFromJson = (json: any): string => {
    if (json.images && Array.isArray(json.images) && json.images.length > 0) {
        return json.images[0].url;
    }
    if (json.image && json.image.url) {
        return json.image.url;
    }
    if (json.url) {
        return json.url;
    }
    console.error("Unknown Fal Response Structure:", json);
    throw new Error("Invalid result format from Fal AI");
}
