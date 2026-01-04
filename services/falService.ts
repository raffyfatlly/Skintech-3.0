
// Model: Flux Dev Image-to-Image
const MODEL = "fal-ai/flux/dev/image-to-image";

const getFalKey = (): string => {
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            // @ts-ignore
            if (import.meta.env.VITE_FAL_KEY) return import.meta.env.VITE_FAL_KEY;
        }
    } catch (e) {}
    
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
    const currentKey = FAL_KEY || getFalKey();

    if (!currentKey) {
        console.error("FAL_KEY Missing. Please add VITE_FAL_KEY to your environment variables.");
        throw new Error("System Error: FAL_KEY Missing.");
    }

    const optimizedImage = await resizeImage(imageBase64, 1024);

    // Submit Request to Queue
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
        if (response.status === 401) throw new Error("Fal AI Unauthorized: Invalid API Key.");
        throw new Error(`Fal AI Error: ${response.status} ${err}`);
    }

    const { request_id } = await response.json();
    return pollForResult(request_id, currentKey);
};

const pollForResult = async (requestId: string, key: string, attempts = 0): Promise<string> => {
    if (attempts > 60) throw new Error("Simulation timeout. Server is busy."); 

    await new Promise(r => setTimeout(r, 2000));

    const statusResponse = await fetch(`https://queue.fal.run/${MODEL}/requests/${requestId}/status`, {
        method: 'GET',
        headers: {
            'Authorization': `Key ${key}`,
            'Content-Type': 'application/json',
        },
    });

    if (!statusResponse.ok) {
        // Fallback to generic endpoint
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
};

const processStatusResponse = async (statusData: any, requestId: string, key: string, attempts: number): Promise<string> => {
    if (statusData.status === 'COMPLETED') {
        const resultUrl = statusData.response_url;
        if (!resultUrl) throw new Error("Completed but no result URL found");
        
        // Fetch Result JSON
        const headers: HeadersInit = {};
        if (resultUrl.includes('fal.run')) {
             headers['Authorization'] = `Key ${key}`;
        }

        const resultResponse = await fetch(resultUrl, {
            method: 'GET',
            headers: headers
        });
        
        let resultJson;
        if (!resultResponse.ok) {
             // Retry without headers if failed (signed url case)
             if (resultResponse.status === 403 || resultResponse.status === 401) {
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
        
        // Return URL directly. Do NOT convert to base64 here to prevent CORS blocking the display.
        return imageUrl;
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
