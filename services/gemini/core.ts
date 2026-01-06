import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

export const getApiKey = (): string => {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
    if (typeof process !== 'undefined' && process.env && process.env.VITE_API_KEY) {
        return process.env.VITE_API_KEY;
    }
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
        // @ts-ignore
        return import.meta.env.VITE_API_KEY;
    }
    return '';
}

export const getAi = (): GoogleGenAI => {
    if (!aiInstance) {
        const key = getApiKey();
        if (!key) {
            console.error("API Key is missing. Please set VITE_API_KEY in your Vercel Environment Variables.");
        }
        aiInstance = new GoogleGenAI({ apiKey: key });
    }
    return aiInstance;
};

// --- CONFIGURATION ---
export const MODEL_FAST = 'gemini-3-flash-preview';  // Best for Text/Analysis/Chat
export const MODEL_IMAGE = 'gemini-2.5-flash-image'; // Nano Banana - Best for Image Generation/Editing

// For Image Generation, we use BLOCK_ONLY_HIGH to allow clinical skin images which might trigger medium filters
export const SAFETY_SETTINGS_IMAGE = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export const SAFETY_SETTINGS_NONE = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- HELPERS ---

export const parseJSONFromText = (text: string): any => {
    if (!text) return {};
    try {
        let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const firstBrace = cleanText.indexOf('{');
        const firstBracket = cleanText.indexOf('[');
        let start = -1;
        
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            start = firstBrace;
        } else if (firstBracket !== -1) {
            start = firstBracket;
        }
        
        if (start === -1) return {};
        
        cleanText = cleanText.substring(start);
        const endBrace = cleanText.lastIndexOf('}');
        const endBracket = cleanText.lastIndexOf(']');
        const end = Math.max(endBrace, endBracket);
        if (end !== -1) cleanText = cleanText.substring(0, end + 1);

        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Failure", e);
        return {};
    }
};

export const extractSources = (response: any): string[] => {
    try {
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        return chunks
            .map((c: any) => c.web?.uri)
            .filter((u: string) => u && typeof u === 'string');
    } catch (e) {
        return [];
    }
};

export const runWithTimeout = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, timeoutMs: number = 60000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Analysis timed out.")), timeoutMs));
        return await Promise.race([fn(getAi()), timeoutPromise]);
    } catch (e) {
        console.error("Deep Analysis Error:", e);
        throw e; 
    }
};

export const runWithRetry = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, fallback: T, timeoutMs: number = 45000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));
        return await Promise.race([fn(getAi()), timeoutPromise]);
    } catch (e) {
        console.error("Gemini Error (Fallback used):", e);
        return fallback;
    }
};

// Helper to convert URL to Base64 for Gemini
export const urlToBase64 = async (url: string): Promise<string> => {
    try {
        // Try simple fetch
        const response = await fetch(url);
        if (!response.ok) throw new Error("Fetch failed");
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to convert URL to Base64:", e);
        // If simple fetch fails (CORS), we can't do much on client-side without a proxy.
        // Return empty or throw to be handled by caller
        throw new Error("Could not download image from URL. CORS or network issue.");
    }
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;
