
// --- SEGMIND API SERVICE ---
// Replaces Fal AI for image simulation using Segmind Workflow

const API_KEY = "SG_de94064f692ec7e7";
const WORKFLOW_URL = "https://api.segmind.com/workflows/6852609b27e56a0a8b1ca485-v2";

// Helper: Resize image to reduce payload size and API latency
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
                // Use slightly lower quality to ensure fast upload
                resolve(canvas.toDataURL('image/jpeg', 0.90));
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    // 1. Optimize Image
    const optimizedImage = await resizeImage(imageBase64, 1024);

    // 2. Queue the Request (Initial POST)
    const response = await fetch(WORKFLOW_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "input_image": optimizedImage 
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Segmind API Error:", errText);
        throw new Error(`Segmind Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    console.log("Segmind Request Queued:", data);

    // 3. Poll for Result
    // Use the poll_url provided by the API
    if (!data.poll_url) {
        throw new Error("Segmind did not return a polling URL.");
    }
    
    return pollForResult(data.poll_url);
};

const pollForResult = async (pollUrl: string): Promise<string> => {
    let attempts = 0;
    const maxAttempts = 60; // 60 * 3s = 3 minutes max timeout

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000)); // Poll every 3 seconds

        try {
            const response = await fetch(pollUrl, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            if (!response.ok) {
                console.warn(`Polling status: ${response.status}`);
                continue; // Retry on network glitches
            }

            const result = await response.json();

            if (result.status === 'COMPLETED') {
                console.log("Segmind Generation Complete:", result);
                
                // Parse the output string if it's JSON
                let outputs = result.output;
                if (typeof outputs === 'string') {
                    try {
                        outputs = JSON.parse(outputs);
                    } catch (e) {
                        console.warn("Could not parse output JSON string, using raw:", e);
                    }
                }
                
                return extractImage(outputs);
            } 
            else if (result.status === 'FAILED') {
                throw new Error(result.error || 'Segmind Generation Failed');
            }
            // If PENDING, QUEUED, or PROCESSING, the loop continues
        } catch (e) {
            console.error("Polling error", e);
            // If critical error, rethrow. Otherwise continue polling.
            if ((e as Error).message.includes('Generation Failed')) throw e;
        }
        
        attempts++;
    }
    
    throw new Error("Timeout waiting for Segmind result");
};

const extractImage = (outputs: any): string => {
    console.log("Segmind Outputs:", outputs);
    
    // Robust extraction logic for various Segmind workflow output formats
    
    // 1. Array format (Common)
    if (Array.isArray(outputs) && outputs.length > 0) {
        return normalizeImageStr(outputs[0]);
    }
    
    // 2. Object format
    if (typeof outputs === 'object' && outputs !== null) {
        // Check common keys
        if (outputs.image) return normalizeImageStr(outputs.image);
        if (outputs.images && Array.isArray(outputs.images)) return normalizeImageStr(outputs.images[0]);
        if (outputs.output_image) return normalizeImageStr(outputs.output_image);
        
        // Check values if keys are unknown (e.g. node IDs)
        const values = Object.values(outputs);
        for (const val of values) {
            if (typeof val === 'string' && (val.startsWith('http') || val.length > 100)) {
                return normalizeImageStr(val);
            }
            if (Array.isArray(val) && val.length > 0) {
                return normalizeImageStr(val[0]);
            }
        }
    }
    
    // 3. Raw String
    if (typeof outputs === 'string') return normalizeImageStr(outputs);

    throw new Error("Could not extract image from Segmind response");
};

const normalizeImageStr = (str: string): string => {
    if (!str) return '';
    
    // If it's a URL, return as is
    if (str.startsWith('http')) return str;
    
    // If it's base64, ensure it has the prefix
    if (!str.startsWith('data:image')) {
        return `data:image/jpeg;base64,${str}`;
    }
    
    return str;
};
