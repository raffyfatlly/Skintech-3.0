
import { GoogleGenAI } from "@google/genai";

// Specific getter for Nano Banana model key
const getNanoApiKey = (): string => {
    // 1. Priority: NANO_API_KEY (from env)
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.NANO_API_KEY) {
        // @ts-ignore
        return process.env.NANO_API_KEY;
    }
    
    // 2. Fallback: Standard API_KEY (reusing existing logic just in case)
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        // @ts-ignore
        return process.env.API_KEY;
    }
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.VITE_API_KEY) {
        // @ts-ignore
        return process.env.VITE_API_KEY;
    }
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
    const prompt = "Edit this image to simulate healthy skin recovery. " +
                   "Remove acne, reduce redness, smooth texture, and minimize pores. " +
                   "Strictly maintain the person's identity, facial features, lighting, and background. " +
                   "The result should look like a clinical 'after' photo.";

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
