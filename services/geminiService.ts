
import { GoogleGenAI } from "@google/genai";
import type { Chat } from "@google/genai";
import { SkinMetrics, Product, UserProfile, UserPreferences } from '../types';

let aiInstance: GoogleGenAI | null = null;

const getApiKey = (): string => {
    // 1. Try injected process.env (Vite 'define')
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
    // 2. Try Vite standard import.meta.env
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        if (import.meta.env.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
        // @ts-ignore
        if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
        // @ts-ignore
        if (import.meta.env.API_KEY) return import.meta.env.API_KEY;
    }
    return '';
}

const getAi = (): GoogleGenAI => {
    if (!aiInstance) {
        const key = getApiKey();
        if (!key) {
            console.error("API Key is missing. Please set VITE_API_KEY or API_KEY.");
        }
        aiInstance = new GoogleGenAI({ apiKey: key });
    }
    return aiInstance;
};

// --- CONFIGURATION ---
// Upgraded to Gemini 3 Flash for improved speed and reasoning
const MODEL_FAST = 'gemini-3-flash-preview'; 

// --- HELPERS ---

const parseJSONFromText = (text: string): any => {
    if (!text) return {};
    try {
        // 1. Remove markdown code blocks
        let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // 2. Identify start char
        const firstBrace = cleanText.indexOf('{');
        const firstBracket = cleanText.indexOf('[');
        
        let start = -1;
        let startChar = '';
        
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            start = firstBrace;
            startChar = '{';
        } else if (firstBracket !== -1) {
            start = firstBracket;
            startChar = '[';
        }
        
        if (start === -1) return {};
        
        // 3. Smart extraction
        let openCount = 0;
        let end = -1;
        const openChar = startChar;
        const closeChar = startChar === '{' ? '}' : ']';
        
        for (let i = start; i < cleanText.length; i++) {
            const char = cleanText[i];
            if (char === openChar) {
                openCount++;
            } else if (char === closeChar) {
                openCount--;
                if (openCount === 0) {
                    end = i;
                    break;
                }
            }
        }
        
        if (end !== -1) {
            cleanText = cleanText.substring(start, end + 1);
        } else {
             const lastClose = cleanText.lastIndexOf(closeChar);
             if (lastClose !== -1) {
                 cleanText = cleanText.substring(start, lastClose + 1);
             }
        }

        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Failure", e);
        return {};
    }
};

const extractSources = (response: any): string[] => {
    try {
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        return chunks
            .map((c: any) => c.web?.uri)
            .filter((u: string) => u && typeof u === 'string');
    } catch (e) {
        return [];
    }
};

const runWithTimeout = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, timeoutMs: number = 60000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Analysis timed out.")), timeoutMs));
        return await Promise.race([fn(getAi()), timeoutPromise]);
    } catch (e) {
        console.error("Deep Analysis Error:", e);
        throw e; 
    }
};

const runWithRetry = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, fallback: T, timeoutMs: number = 45000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));
        return await Promise.race([fn(getAi()), timeoutPromise]);
    } catch (e) {
        console.error("Gemini Error (Fallback used):", e);
        return fallback;
    }
};

// --- CORE ANALYSIS FUNCTIONS ---

export const analyzeProductFromSearch = async (
    productName: string, 
    userMetrics: SkinMetrics, 
    _unused?: any, 
    knownBrand?: string, 
    routineActives: string[] = [],
    location: string = "Global"
): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        
        const prompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        USER LOCATION: ${location}.
        USER PROFILE (0=Bad, 100=Good): ${JSON.stringify(userMetrics)}.
        ROUTINE ACTIVES ALREADY USED: [${routineActives.join(', ')}].

        TASK: 
        1. Find ingredients and price.
        2. Analyze against user profile.
        3. Output strict JSON.

        STYLE: Simple, concise. Explain technical terms in brackets [like this].

        OUTPUT JSON SCHEMA:
        \`\`\`json
        {
          "name": "string",
          "brand": "string",
          "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "FOUNDATION" | "UNKNOWN",
          "ingredients": ["string"],
          "estimatedPrice": number,
          "suitabilityScore": number,
          "risks": [{ "ingredient": "string", "riskLevel": "LOW"|"MEDIUM"|"HIGH", "reason": "string" }],
          "benefits": [{ "ingredient": "string", "target": "acneActive"|"hydration" etc, "description": "string", "relevance": "HIGH"|"MAINTENANCE" }],
          "usageTips": "string",
          "expertReview": "string"
        }
        \`\`\`
        `;

        let response;
        let sources: string[] = [];

        try {
            // Attempt 1: With Google Search (Real-time data)
            response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] }
            });
            sources = extractSources(response);
        } catch (e) {
            console.warn("Product Search Tool failed, falling back to internal knowledge", e);
            // Attempt 2: Internal Knowledge (Reliable fallback)
            // Note: We use responseMimeType here because we are NOT using tools.
            response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt + "\n\nUse your internal database to estimate ingredients and details.",
                config: { responseMimeType: 'application/json' }
            });
        }

        const data = parseJSONFromText(response.text || "{}");

        // Validation & Defaults
        const finalName = data.name || productName;
        const finalBrand = data.brand || knownBrand || "Unknown";
        
        let detectedType = data.type || "UNKNOWN";
        if (detectedType === "UNKNOWN") {
            const lowerName = finalName.toLowerCase();
            if (lowerName.includes('clean') || lowerName.includes('wash')) detectedType = 'CLEANSER';
            else if (lowerName.includes('toner')) detectedType = 'TONER';
            else if (lowerName.includes('serum')) detectedType = 'SERUM';
            else if (lowerName.includes('moist') || lowerName.includes('cream')) detectedType = 'MOISTURIZER';
            else if (lowerName.includes('sun') || lowerName.includes('spf')) detectedType = 'SPF';
        }

        const hasIngredients = Array.isArray(data.ingredients) && data.ingredients.length > 0;

        return {
            id: Date.now().toString(),
            name: finalName,
            brand: finalBrand,
            type: detectedType,
            ingredients: hasIngredients ? data.ingredients : [],
            estimatedPrice: typeof data.estimatedPrice === 'number' ? data.estimatedPrice : 0,
            suitabilityScore: (typeof data.suitabilityScore === 'number' && hasIngredients) ? data.suitabilityScore : 0,
            risks: Array.isArray(data.risks) ? data.risks : [],
            benefits: Array.isArray(data.benefits) ? data.benefits : [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips || "Usage guidelines are unavailable.",
            expertReview: data.expertReview || "Expert clinical review unavailable."
        };

    }, 60000); 
};

export const analyzeProductImage = async (
    base64: string, 
    userMetrics: SkinMetrics, 
    routineActives: string[] = [],
    location: string = "Global"
): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        // Step 1: Vision to Text (Identify Product)
        // No tools needed for vision, so we use responseMimeType for strict JSON
        const visionPrompt = `Identify the skincare product in this image. Return JSON: { "brand": "Brand Name", "name": "Product Name" }. If unclear, return { "name": "Unknown" }`;
        
        const visionResp = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: visionPrompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        
        const visionData = parseJSONFromText(visionResp.text || "{}");
        const detectedName = visionData.name && visionData.name !== "Unknown" ? visionData.name : "Unknown Product";
        const detectedBrand = visionData.brand || "Unknown";

        if (detectedName === "Unknown Product") {
             return {
                id: Date.now().toString(),
                name: "Unidentified Product",
                brand: "Unknown",
                type: "UNKNOWN",
                ingredients: [],
                dateScanned: Date.now(),
                risks: [],
                benefits: [],
                suitabilityScore: 0,
                estimatedPrice: 0,
                expertReview: "Could not identify the product. Try searching manually."
             }
        }

        // Step 2: Search & Deep Analysis
        const refinementPrompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${detectedBrand} ${detectedName}"
        USER PROFILE: ${JSON.stringify(userMetrics)}.
        
        TASK: Search for ingredients, analyze safety, output JSON.
        
        OUTPUT JSON SCHEMA:
        {
          "name": "${detectedName}",
          "brand": "${detectedBrand}",
          "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "UNKNOWN",
          "ingredients": ["string"],
          "estimatedPrice": number,
          "suitabilityScore": number,
          "risks": [{ "ingredient": "string", "riskLevel": "LOW"|"MEDIUM"|"HIGH", "reason": "string" }],
          "benefits": [{ "ingredient": "string", "target": "string", "description": "string", "relevance": "HIGH" }],
          "usageTips": "string",
          "expertReview": "string"
        }
        `;

        let searchResponse;
        let sources: string[] = [];

        try {
            // Attempt 1: Tool-assisted
            searchResponse = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: refinementPrompt,
                config: { tools: [{ googleSearch: {} }] }
            });
            sources = extractSources(searchResponse);
        } catch (e) {
            console.warn("Vision Refinement Tool failed, falling back", e);
            // Attempt 2: Knowledge Base
            searchResponse = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: refinementPrompt,
                config: { responseMimeType: 'application/json' }
            });
        }

        const data = parseJSONFromText(searchResponse.text || "{}");
        const hasIngredients = Array.isArray(data.ingredients) && data.ingredients.length > 0;

        return {
            id: Date.now().toString(),
            name: data.name || detectedName,
            brand: data.brand || detectedBrand,
            type: data.type || "UNKNOWN",
            ingredients: hasIngredients ? data.ingredients : [],
            estimatedPrice: typeof data.estimatedPrice === 'number' ? data.estimatedPrice : 0,
            suitabilityScore: (typeof data.suitabilityScore === 'number' && hasIngredients) ? data.suitabilityScore : 0,
            risks: Array.isArray(data.risks) ? data.risks : [],
            benefits: Array.isArray(data.benefits) ? data.benefits : [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips || "Usage guidelines are unavailable.",
            expertReview: data.expertReview || "Analysis based on visual identification only."
        };

    }, 60000);
};

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry(async (ai) => {
        const prompt = `Find 5 skincare products matching: "${query}". Return strict JSON array: [{"brand": "Brand", "name": "Product"}]`;
        try {
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] }
            });
            const res = parseJSONFromText(response.text || "[]");
            if (Array.isArray(res) && res.length > 0) return res;
            throw new Error("Empty search results");
        } catch (e) {
            console.warn("Search tool failed, using fallback", e);
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { responseMimeType: 'application/json' }
            });
            const res = parseJSONFromText(response.text || "[]");
            return Array.isArray(res) ? res : [];
        }
    }, [{ name: query, brand: "Generic" }]);
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    // Wrapped in timeout to prevent hanging UI
    return runWithTimeout<SkinMetrics>(async (ai) => {
        const prompt = `
        You are SkinOS. Analyze this face image for dermatological health.
        
        INPUT CV METRICS (Reference Only): ${JSON.stringify(localMetrics)}. 
        
        OUTPUT JSON (Strict):
        {
          "overallScore": number,
          "acneActive": number,
          "acneScars": number,
          "poreSize": number,
          "blackheads": number,
          "wrinkleFine": number,
          "wrinkleDeep": number,
          "sagging": number,
          "pigmentation": number,
          "redness": number,
          "texture": number,
          "hydration": number,
          "oiliness": number,
          "darkCircles": number,
          "skinAge": number,
          "analysisSummary": {
            "headline": "Short clinical headline",
            "generalCondition": "2 sentences summary. Mention the scale (High is Good).",
            "points": [{ "subtitle": "Concern", "content": "Details" }]
          },
          "immediateAction": "One tip",
          "observations": { "acneActive": "Details" }
        }
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        
        const data = parseJSONFromText(response.text || "{}");
        if (!data.overallScore && !data.analysisSummary) throw new Error("Incomplete analysis");

        const observations = data.observations || {};
        if (data.immediateAction) observations.advice = data.immediateAction;

        return { ...localMetrics, ...data, observations, timestamp: Date.now() };
    }, 45000); // 45s Timeout
};

export const compareFaceIdentity = async (newImage: string, referenceImage: string): Promise<{ isMatch: boolean; confidence: number; reason: string }> => {
    return runWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: referenceImage.split(',')[1] } },
                    { inlineData: { mimeType: 'image/jpeg', data: newImage.split(',')[1] } },
                    { text: `Compare faces. JSON: { "isMatch": boolean, "confidence": number, "reason": "string" }` }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        return parseJSONFromText(response.text || "{}");
    }, { isMatch: true, confidence: 100, reason: "Fallback" });
};

// --- SYNCHRONOUS HELPERS (NO AI CALLS) ---

export const auditProduct = (product: Product, user: UserProfile) => {
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            adjustedScore: 0,
            warnings: [{ severity: 'CAUTION', reason: "Ingredients list could not be retrieved." }],
            analysisReason: "We could not access the ingredient data for this product."
        };
    }

    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    let adjustedScore = product.suitabilityScore;
    const ingStr = product.ingredients.join(' ').toLowerCase();
    const bio = user.biometrics;

    const prefs = user.preferences || {} as Partial<UserPreferences>;

    if (bio.hydration < 50 || prefs.onMedication) {
        const dryingAgents = ['alcohol denat', 'sd alcohol', 'isopropyl alcohol', 'sodium lauryl sulfate', 'sls'];
        const found = dryingAgents.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore -= 30;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, which dehydrates skin (Risky with medication/dryness).` });
        }
    }

    if (bio.redness < 50 || prefs.sensitivity === 'VERY_SENSITIVE' || prefs.hasEczema || prefs.onMedication) {
        const irritants = ['fragrance', 'parfum', 'alcohol denat', 'essential oil', 'menthol', 'peppermint'];
        const found = irritants.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 40);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, a known trigger for sensitive/medicated skin.` });
        }
    }

    if (bio.acneActive < 55) {
        const cloggers = ['coconut oil', 'cocoa butter', 'isopropyl myristate', 'algae extract', 'palm oil', 'wheat germ'];
        const found = cloggers.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 35);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, a pore clogger.` });
        }
    }

    if (prefs.isPregnant) {
        const unsafe = ['retinol', 'retinyl', 'tretinoin', 'hydroquinone', 'arbutin', 'salicylic acid', 'adapalene', 'tazarotene', 'isotretinoin']; 
        const found = unsafe.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = 0;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, not recommended during pregnancy.` });
        }
    }

    return {
        adjustedScore: Math.max(0, Math.min(99, adjustedScore)),
        warnings,
        analysisReason: warnings.length > 0 ? warnings[0].reason : "Good match based on your profile."
    };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const missing = [];
    const types = new Set(products.map(p => p.type));
    if (!types.has('CLEANSER')) missing.push('Cleanser');
    if (!types.has('SPF')) missing.push('SPF');
    if (!types.has('MOISTURIZER')) missing.push('Moisturizer');
    
    let grade = 'B';
    const avg = products.reduce((a,b) => a + b.suitabilityScore, 0) / (products.length || 1);
    if (avg > 80 && missing.length === 0) grade = 'S';
    else if (avg > 70) grade = 'A';
    else if (avg < 50) grade = 'C';

    return {
        analysis: {
            grade, conflicts: [], riskyProducts: [], missing, redundancies: [], upgrades: [],
            balance: { exfoliation: 50, hydration: 50, protection: 50, treatment: 50 }
        }
    };
};

export const analyzeProductContext = (product: Product, shelf: Product[]) => {
    const typeCount = shelf.filter(p => p.type === product.type && p.id !== product.id).length;
    const conflicts: string[] = [];
    const ing = product.ingredients.join(' ').toLowerCase();
    shelf.forEach(p => {
        if (p.id === product.id) return;
        const pIng = p.ingredients.join(' ').toLowerCase();
        if (ing.includes('retinol') && (pIng.includes('acid') || pIng.includes('salicylic'))) {
            conflicts.push(`Retinol + Acid conflict with ${p.name}`);
        }
    });
    return { conflicts, typeCount };
};

export const getClinicalTreatmentSuggestions = (user: UserProfile) => {
    const s = [];
    if (user.biometrics.acneActive < 70) s.push({ type: 'FACIAL', name: 'Deep Cleanse', benefit: 'Clears congestion', downtime: 'None' });
    if (user.biometrics.pigmentation < 70) s.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades spots', downtime: '2 Days' });
    return s;
};

export const createDermatologistSession = (
    user: UserProfile, 
    shelf: Product[],
    location: string = "Global"
): Chat => {
    const biometrics = user.biometrics;
    const userContext = JSON.stringify(biometrics);
    const shelfContext = shelf.map(p => `${p.brand || ''} ${p.name}`).join(', ');

    return getAi().chats.create({
        model: MODEL_FAST,
        config: { 
            systemInstruction: `You are SkinOS, an expert dermatological AI assistant.
            USER PROFILE (High=Good, Low=Bad): ${userContext}
            USER LOCATION: ${location}.
            USER SHELF: ${shelfContext}
            Provide specific, science-backed advice.
            ` 
        }
    });
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            verdict: { 
                decision: 'UNKNOWN', 
                title: 'Info Unavailable', 
                description: "We couldn't retrieve the ingredients for this product.", 
                color: 'zinc' 
            },
            audit: { adjustedScore: 0, warnings: [], analysisReason: "Ingredients missing." },
            shelfConflicts: [],
            comparison: { result: 'NEUTRAL' }
        };
    }

    const audit = auditProduct(product, user);
    let decision = 'CONSIDER';
    const hasCriticalWarnings = audit.warnings.some(w => w.severity === 'CRITICAL');

    if (audit.adjustedScore >= 75 && !hasCriticalWarnings) {
        decision = 'BUY';
    } else if (audit.adjustedScore < 45 || hasCriticalWarnings) {
        decision = 'AVOID';
    }
    
    return {
        verdict: { decision, title: decision, description: audit.analysisReason, color: decision === 'BUY' ? 'emerald' : 'amber' },
        audit,
        shelfConflicts: [],
        comparison: { result: 'NEUTRAL' }
    };
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: `Generate AM/PM routine for ${user.skinType}. JSON format.`,
            config: { responseMimeType: 'application/json' }
        });
        return parseJSONFromText(response.text || "{}");
    }, {});
};

export const generateTargetedRecommendations = async (
    user: UserProfile, 
    category: string, 
    maxPrice: number, 
    allergies: string, 
    goals: string[],
    location: string = "Global"
): Promise<any> => {
    return runWithTimeout<any>(async (ai) => {
        const m = user.biometrics;
        const prefs = user.preferences || {} as Partial<UserPreferences>;
        
        // Build safety string
        const safetyConstraints = [];
        if (prefs.isPregnant) safetyConstraints.push("PREGNANCY SAFE (No Retinoids/Salicylic/Hydroquinone)");
        if (prefs.hasEczema) safetyConstraints.push("ECZEMA FRIENDLY (No Fragrance/Alcohol)");
        if (prefs.onMedication) safetyConstraints.push("MEDICATION SAFE (Gentle/No harsh actives)");
        if (prefs.sensitivity === 'VERY_SENSITIVE') safetyConstraints.push("SENSITIVE SKIN (Hypoallergenic)");

        const prompt = `
        TASK: Recommend 3 ${category} products available in ${location} or Globally.
        USER GOALS: ${goals.join(', ')}.
        BUDGET: ${maxPrice} (Approximate in local currency).
        SKIN TYPE: ${user.skinType}
        SAFETY: Acne Score: ${m.acneActive}, Sensitivity: ${m.redness}.
        CRITICAL SAFETY CONSTRAINTS: ${safetyConstraints.join(', ') || 'None'}.
        Output strict JSON: [{ "name": "string", "brand": "string", "price": "string", "reason": "string", "rating": number }]
        `;
        
        try {
            // Attempt 1: Search Grounding
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] }
            });
            return parseJSONFromText(response.text || "[]");
        } catch (e) {
            console.warn("Routine Recommendation Tool failed, using fallback", e);
            // Attempt 2: Internal Knowledge Base
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt + "\nUse your internal knowledge of global products.",
                config: { responseMimeType: 'application/json' }
            });
            return parseJSONFromText(response.text || "[]");
        }
    }, 240000);
};
