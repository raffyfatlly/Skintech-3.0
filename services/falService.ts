
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

    try {
        const statusResponse = await fetch(`https://queue.fal.run/${MODEL}/requests/${requestId}/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Key ${key}`,
                'Content-Type': 'application/json',
            },
        });

        if (!statusResponse.ok) {
            // Fallback for some models that use the generic endpoint
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
        const resultUrl = statusData.response_url;
        
        // Sometimes the result is embedded directly in the status (rare but possible)
        if (!resultUrl && (statusData.images || statusData.image)) {
            return extractImageFromJson(statusData);
        }

        if (!resultUrl) {
            console.error("Completed status but no result URL:", statusData);
            throw new Error("Completed but no result URL found in response.");
        }
        
        const resultJson = await fetchResult(resultUrl, key);
        console.log("Fal Result JSON:", resultJson);
        const imageUrl = extractImageFromJson(resultJson);
        return imageUrl;
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Simulation failed: ${statusData.error || 'Unknown error'}`);
    }

    return pollForResult(requestId, key, attempts + 1);
};

// Robust fetcher that handles the Signed URL vs API URL header conflict
const fetchResult = async (url: string, key: string): Promise<any> => {
    // Check for indicators of a signed storage URL (GCS, S3, R2, etc)
    // These URLs usually reject 'Authorization' headers with 403 Forbidden
    const isSignedStorage = 
        url.includes('googleapis.com') || 
        url.includes('amazonaws.com') || 
        url.includes('r2.cloudflarestorage.com') ||
        url.includes('Signature=') ||
        url.includes('X-Amz-Algorithm');

    // Strategy 1: If it looks like storage, try NO headers first
    if (isSignedStorage) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
            // If failed, fall through to retry logic
            console.warn(`Direct fetch failed for signed URL (${res.status}), trying fallback...`);
        } catch (e) {
            console.warn("Direct fetch network error, trying fallback...", e);
        }
    }

    // Strategy 2: If it looks like a Fal API URL (fal.run or fal.media), try WITH headers first
    // Or if Strategy 1 failed
    try {
        const resWithAuth = await fetch(url, {
            headers: { 'Authorization': `Key ${key}` }
        });
        if (resWithAuth.ok) return await resWithAuth.json();
        
        // If Auth failed (403/401), it might actually be a public/signed URL misidentified
        if ([401, 403, 400].includes(resWithAuth.status)) {
             console.log("Auth fetch failed, retrying without headers...");
             const resNoAuth = await fetch(url);
             if (resNoAuth.ok) return await resNoAuth.json();
             
             const errText = await resNoAuth.text();
             throw new Error(`Fetch failed (No Auth): ${resNoAuth.status} ${errText}`);
        }
        
        const errText = await resWithAuth.text();
        throw new Error(`Fetch failed (Auth): ${resWithAuth.status} ${errText}`);

    } catch (e: any) {
        // Final Hail Mary: Try simple fetch if we haven't already (e.g. if we started in Strategy 2 and crashed on network)
        if (!isSignedStorage) {
             try {
                const resLastResort = await fetch(url);
                if (resLastResort.ok) return await resLastResort.json();
             } catch (e2) {}
        }
        throw e;
    }
};

const extractImageFromJson = (json: any): string => {
    if (!json) throw new Error("Empty result JSON");

    // 1. Standard Flux Format (Array of objects)
    if (json.images && Array.isArray(json.images) && json.images.length > 0) {
        return json.images[0].url;
    }
    // 2. Single Image Object
    if (json.image && json.image.url) {
        return json.image.url;
    }
    // 3. Direct URL at root
    if (json.url && typeof json.url === 'string') {
        return json.url;
    }
    // 4. File object format
    if (json.file && json.file.url) {
        return json.file.url;
    }
    // 5. Sometimes Flux returns just { "image_url": "..." }
    if (json.image_url) {
        return json.image_url;
    }
    
    console.error("Unknown Fal Response Structure:", json);
    throw new Error("Invalid result format from Fal AI. Check console for details.");
};
