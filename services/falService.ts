
const FAL_KEY = process.env.FAL_KEY;
const MODEL = "fal-ai/retoucher";

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    if (!FAL_KEY) {
        throw new Error("Missing FAL_KEY. Please add it to your environment variables.");
    }

    // 1. Submit Request to Queue
    const response = await fetch(`https://queue.fal.run/${MODEL}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_url: imageBase64,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Fal AI Error: ${response.status} ${err}`);
    }

    const { request_id } = await response.json();

    // 2. Poll for Result
    return pollForResult(request_id);
};

const pollForResult = async (requestId: string, attempts = 0): Promise<string> => {
    if (attempts > 30) throw new Error("Retouch timeout"); // 30 attempts * 2s = 60s max

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
        
        // Fetch the actual result JSON which contains the image
        const resultResponse = await fetch(resultUrl, {
             headers: { 'Authorization': `Key ${FAL_KEY}` }
        });
        const resultJson = await resultResponse.json();
        
        if (resultJson.images && resultJson.images.length > 0) {
            return resultJson.images[0].url;
        }
        if (resultJson.image && resultJson.image.url) {
            return resultJson.image.url;
        }
        
        throw new Error("Invalid result format from Fal AI");
    }

    if (statusData.status === 'FAILED') {
        throw new Error(`Retouch failed: ${statusData.error || 'Unknown error'}`);
    }

    // Still processing/queueing
    return pollForResult(requestId, attempts + 1);
};
