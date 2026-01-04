
import { GoogleGenAI } from "@google/genai";

// Reuse the API Key logic consistent with the app's standards
const getApiKey = (): string => {
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
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Missing Google API Key (VITE_API_KEY).");
    }

    const ai = new GoogleGenAI({ apiKey });

    // Clean the base64 string (remove data:image/jpeg;base64, prefix if present)
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

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
