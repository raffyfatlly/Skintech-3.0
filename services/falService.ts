
import { GoogleGenAI } from "@google/genai";

// Specific getter for Nano Banana model key
const getNanoApiKey = (): string => {
    // 1. Try accessing the key injected by Vite 'define'.
    // We use try-catch because if 'define' fails to replace the string, 
    // accessing 'process' in a browser might throw a ReferenceError.
    try {
        // @ts-ignore
        const key = process.env.NANO_API_KEY;
        if (key) return key;
    } catch (e) {
        // Ignore ReferenceError if process is not defined
    }

    // 2. Try standard Vite env var (if user set VITE_NANO_API_KEY in .env)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_NANO_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_NANO_API_KEY;
    }

    // 3. Fallback: Standard API_KEY (reusing existing logic)
    try {
        // @ts-ignore
        if (process.env.API_KEY) return process.env.API_KEY;
    } catch (e) {}

    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_API_KEY;
    }

    return '';
};

// Target Model: Nano Banana (Gemini 2.5 Flash Image)
const MODEL = 'gemini-2.5-flash-image';

export const upscaleImage = async (imageBase64: string): Promise<string> => {
    const apiKey = getNanoApiKey();
    if (!apiKey) {
        throw new Error("Missing API Key. Please set NANO_API_KEY in your environment variables.");
    }

    const ai = new GoogleGenAI({ apiKey });

    // Clean the base64 string (remove data:image/jpeg;base64, prefix if present)
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    // Prompt engineered for "Nano Banana" image editing capabilities
    // UPDATED: Focused on Hyper-Realism and Texture Preservation
    const prompt = "Clinical dermatology simulation. Transform the skin to be clear and healthy but HYPER-REALISTIC. " +
                   "1. Remove acne, redness, and active inflammation. " +
                   "2. CRITICAL: Preserve natural skin texture, pores, and fine details. Do NOT blur, smooth excessively, or airbrush. Do NOT make it look like a plastic doll or beauty filter. " +
                   "3. Keep lighting, shadows, and color tone exactly consistent with the original. " +
                   "4. ALIGNMENT IS PARAMOUNT: The output must align pixel-for-pixel with the input. Do not crop, zoom, rotate, or morph features. " +
                   "5. Keep eyes, hair, lips, and background 100% identical. Only treat the skin surface.";

    try {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                // Generate 1 candidate
                candidateCount: 1,
            }
        });

        // Extract the generated image from the response
        // Note: Response might be text or image. We need to find the image part.
        const parts = response.candidates?.[0]?.content?.parts;
        const imagePart = parts?.find((p: any) => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        }

        // If no image part found, check if it returned text refusal
        const textPart = parts?.find((p: any) => p.text);
        if (textPart) {
            console.warn("Gemini Refusal/Text:", textPart.text);
            throw new Error("The model refused to generate the image (Safety or Instruction issue).");
        }

        throw new Error("No image data received from Gemini.");

    } catch (e: any) {
        console.error("Gemini Simulation Error:", e);
        
        // Handle specific Gemini error codes if necessary
        if (e.message?.includes('429')) {
            throw new Error("Service is busy (Quota Exceeded). Please try again later.");
        }
        
        throw new Error(`Simulation failed: ${e.message || 'Unknown error'}`);
    }
};
