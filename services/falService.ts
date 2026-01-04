
// Model: GPT Image 1.5 Edit (High-fidelity editing)
const MODEL = "fal-ai/gpt-image-1.5/edit";

// Declare the global constant injected by Vite
declare const __FAL_KEY__: string | undefined;

const getFalKey = (): string => {
    try {
        if (typeof __FAL_KEY__ !== 'undefined' && __FAL_KEY__) return __FAL_KEY__;
    } catch (e) {}

    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FAL_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_FAL_KEY;
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
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    if (!FAL_KEY) {
        console.error("FAL_KEY is missing. Please ensure 'FAL_KEY' or 'VITE_FAL_KEY' is set.");
        throw new Error("System Error: FAL_KEY Missing.");
    }

    // 1. Optimize Image
    const optimizedImage = await resizeImage(imageBase64, 1024);

    // 2. Submit Request to Queue
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
    if (attempts > 60) throw new Error("Simulation timeout. Server is busy."); 

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

    return pollForResult(requestId, attempts + 1);
};
