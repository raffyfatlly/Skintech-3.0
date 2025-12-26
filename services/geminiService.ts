
import * as GenAI from "@google/genai";
import type { Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile, IngredientRisk, Benefit } from '../types';

let aiInstance: GenAI.GoogleGenAI | null = null;

const getAi = (): GenAI.GoogleGenAI => {
    if (!aiInstance) {
        // Access constructor via namespace to prevent "Illegal constructor" error
        const Client = GenAI.GoogleGenAI;
        aiInstance = new Client({ apiKey: process.env.API_KEY });
    }
    return aiInstance;
};

// --- FEATURE-SPECIFIC MODEL CONFIGURATION ---
const MODEL_FACE_SCAN = 'gemini-3-flash-preview';
const MODEL_PRODUCT_SEARCH = 'gemini-3-flash-preview';
const MODEL_VISION = 'gemini-2.5-flash';
const MODEL_ROUTINE = 'gemini-3-pro-preview';

// Helpers
const parseJSONFromText = (text: string): any => {
    if (!text) return {};
    try {
        // 1. Try finding a JSON code block first
        const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            return JSON.parse(codeBlockMatch[1]);
        }

        // 2. Fallback to finding the first { and last }
        const startObj = text.indexOf('{');
        const startArr = text.indexOf('[');
        let start = -1;
        let end = -1;
        let isArray = false;

        if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
            start = startObj;
            end = text.lastIndexOf('}');
        } else if (startArr !== -1) {
            start = startArr;
            end = text.lastIndexOf(']');
            isArray = true;
        }

        if (start === -1 || end === -1) return isArray ? [] : {};

        const jsonStr = text.substring(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error", e);
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

const runWithRetry = async <T>(fn: (ai: GenAI.GoogleGenAI) => Promise<T>, fallback: T, timeoutMs: number = 45000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));
        return await Promise.race([fn(getAi()), timeoutPromise]);
    } catch (e) {
        console.error("Gemini Error:", e);
        return fallback;
    }
};

const getFallbackProduct = (userMetrics: SkinMetrics, name: string): Product => ({
    id: Date.now().toString(),
    name: name,
    brand: "Unknown",
    type: "UNKNOWN",
    ingredients: [],
    dateScanned: Date.now(),
    risks: [],
    benefits: [],
    suitabilityScore: 50
});

// --- EXPORTED FUNCTIONS ---

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry<{ name: string, brand: string }[]>(async (ai) => {
        const prompt = `
        User Query: "${query}"
        ACT AS A PRECISE SKINCARE PRODUCT SEARCH ENGINE.
        List 5 real skincare products available in Malaysia (Watsons/Guardian/Sephora) that match the query.
        OUTPUT FORMAT: Strict JSON Array of objects [{"brand": "Brand Name", "name": "Exact Product Name"}].
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [res].filter(x => x.name);
    }, [{ name: query, brand: "Generic" }]);
};

export const compareFaceIdentity = async (newImage: string, referenceImage: string): Promise<{ isMatch: boolean; confidence: number; reason: string }> => {
    return runWithRetry(async (ai) => {
        const prompt = `
        ACT AS A BIOMETRIC SECURITY SYSTEM. Compare the two provided face images.
        OUTPUT JSON: { "isMatch": boolean, "confidence": number, "reason": "string" }
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_VISION, 
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: referenceImage.split(',')[1] } },
                    { inlineData: { mimeType: 'image/jpeg', data: newImage.split(',')[1] } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });

        const result = parseJSONFromText(response.text || "{}");
        return {
            isMatch: result.isMatch === true,
            confidence: result.confidence || 0,
            reason: result.reason || "Analysis complete"
        };
    }, { isMatch: true, confidence: 100, reason: "Fallback: Service unavailable" });
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    const previousScan = history && history.length > 0 ? history[history.length - 1] : null;

    const prompt = `
    You are SkinOS, a hyper-intelligent digital dermatologist.
    
    INPUT DATA:
    - CV Metrics (Algorithmic Estimates): ${JSON.stringify(localMetrics)}
    - Previous Score: ${previousScan ? previousScan.overallScore : 'None'}
    - Shelf Products: ${shelf.length > 0 ? JSON.stringify(shelf) : "None"}
    
    TASK: 
    1. Calibrate the CV metrics based on visual skin analysis. TRUST YOUR EYES over the numbers.
    2. Provide a structured clinical verdict.
    
    SCORING RUBRIC (Strictly Inverted Scale):
    - 100 = Perfect, Flawless Skin (No Acne, No Wrinkles).
    - 0 = Severe Condition (Severe Acne, Deep Wrinkles).
    - Example: If you see ACNE, the 'acneActive' score must be LOW (e.g., 30).
    - Example: If you see DEEP WRINKLES, the 'wrinkleDeep' score must be LOW (e.g., 40).
    - If the algorithm says 90 but you see redness/pimples, OVERWRITE the score to 40.
    
    STYLE GUIDELINES:
    - Use clear, simple prose suitable for a general audience.
    - **CRITICAL:** If you use a medical term, immediately explain it in simple terms within brackets. 
      Example: "Signs of erythema (redness) on the cheeks." or "High sebum (oil) production."
    
    OUTPUT JSON FORMAT (Strict):
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
        "headline": "Short, punchy 3-5 word diagnostic headline (e.g., 'Compromised Barrier & Congestion')",
        "generalCondition": "2-3 sentences summarizing the holistic state of the skin. Connect the dots between different metrics (e.g., how oiliness might be causing the acne). Use simple language.",
        "points": [
           { "subtitle": "Holistic Concern", "content": "Explain the lowest scoring metric and how it affects the overall look. Remember to explain technical terms in brackets." },
           { "subtitle": "Core Strength", "content": "Highlight the best feature and how it protects the skin integrity." },
           { "subtitle": "Routine Gap", "content": "Identify a missing step or product type based on the shelf list and skin condition. Explain *why* it's needed in plain English." }
        ]
      },
      "immediateAction": "One specific, highly actionable quick tip for today (e.g., 'Double cleanse tonight' or 'Skip retinol').",
      "observations": { 
          "acneActive": "Specific observation...",
          "redness": "Specific observation..."
      }
    }
    `;
    
    const response = await getAi().models.generateContent({
        model: MODEL_FACE_SCAN,
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
};

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string, routineActives: string[] = []): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        const prompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        CONTEXT: User in MALAYSIA. 
        USER PROFILE (0=Bad, 100=Good): ${JSON.stringify(userMetrics)}.
        ROUTINE ACTIVES ALREADY USED: [${routineActives.join(', ')}].

        TASK: 
        1. Use Google Search to find the ingredients list and price in MYR.
        2. Analyze the ingredients against the user profile.
        3. Output the result in the strict JSON format below.
        
        STYLE GUIDELINES:
        - Use simple, concise prose suitable for a general audience.
        - **CRITICAL:** If you use a technical term, immediately explain it in simple terms within brackets. 
          Example: "Contains salicylic acid [a pore-clearing exfoliant]." or "Rich in ceramides [lipids that repair the skin barrier]."
        
        CRITICAL OUTPUT RULES:
        - Return ONLY JSON. 
        - Ensure "suitabilityScore" (0-100) reflects match with User Profile.
        - "expertReview": Write an objective consensus review. Summarize what experts generally say about this formulation. DO NOT use first-person ("I", "As a chemist"). Keep it professional and third-party. Use simple language with bracketed explanations.
        - "benefits" & "risks" descriptions: Must use simple language with bracketed explanations if needed.
        
        OUTPUT JSON SCHEMA:
        \`\`\`json
        {
          "name": string,
          "brand": string,
          "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "FOUNDATION" | "UNKNOWN",
          "ingredients": string[],
          "estimatedPrice": number,
          "suitabilityScore": number,
          "risks": [{ "ingredient": string, "riskLevel": "LOW"|"MEDIUM"|"HIGH", "reason": string }],
          "benefits": [{ "ingredient": string, "target": "acneActive"|"hydration" etc, "description": string, "relevance": "HIGH"|"MAINTENANCE" }],
          "usageTips": string,
          "expertReview": string
        }
        \`\`\`
        `;

        const response = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const data = parseJSONFromText(response.text || "{}");
        const sources = extractSources(response);

        if (!data || !data.name) throw new Error("Refinement failed: Incomplete data.");

        return {
            id: Date.now().toString(),
            name: data.name,
            brand: data.brand || knownBrand || "Unknown",
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips,
            expertReview: data.expertReview
        };
    }, { ...getFallbackProduct(userMetrics, productName), suitabilityScore: consistencyScore || 75, brand: knownBrand || "Unknown Brand" }, 90000); 
};

export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics, routineActives: string[] = []): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        // Step 1: Vision to get Text
        const visionPrompt = `Identify the skincare product in this image. Return JSON: { "brand": "Brand Name", "name": "Product Name" }. If unclear, return { "name": "Unknown" }`;
        const visionResponse = await ai.models.generateContent({
            model: MODEL_VISION,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: visionPrompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        const visionData = parseJSONFromText(visionResponse.text || "{}");
        if (!visionData.name || visionData.name === "Unknown") throw new Error("Could not identify product.");

        // Step 2: Search & Deep Analysis
        const refinementPrompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${visionData.brand} ${visionData.name}"
        CONTEXT: Malaysia.
        USER PROFILE (0=Bad, 100=Good): ${JSON.stringify(userMetrics)}.
        ROUTINE ACTIVES: [${routineActives.join(', ')}].

        TASK: 
        1. Search for the product's full ingredient list and reviews.
        2. Analyze for risks/benefits based on user profile.
        3. RETURN A VALID JSON OBJECT matching the schema below.
        
        STYLE GUIDELINES:
        - Use simple, concise prose.
        - **CRITICAL:** Explain any technical term immediately in brackets. Example: "Contains hyaluronic acid [a moisture magnet for hydration]."
        
        CRITICAL OUTPUT RULES:
        - "expertReview": Write an objective consensus review. Summarize what experts generally say about this formulation. DO NOT use first-person ("I", "As a chemist"). Keep it professional and third-party. Use simple language with bracketed explanations.
        - "benefits" & "risks" descriptions: Must use simple language with bracketed explanations if needed.

        OUTPUT JSON SCHEMA:
        \`\`\`json
        {
          "name": "${visionData.name}",
          "brand": "${visionData.brand}",
          "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "FOUNDATION" | "UNKNOWN",
          "ingredients": string[],
          "estimatedPrice": number,
          "suitabilityScore": number,
          "risks": [{ "ingredient": string, "riskLevel": "LOW"|"MEDIUM"|"HIGH", "reason": string }],
          "benefits": [{ "ingredient": string, "target": "acneActive"|"hydration" etc, "description": string, "relevance": "HIGH"|"MAINTENANCE" }],
          "usageTips": string,
          "expertReview": string
        }
        \`\`\`
        `;

        const finalResponse = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH,
            contents: refinementPrompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const data = parseJSONFromText(finalResponse.text || "{}");
        const sources = extractSources(finalResponse);
        
        // Relaxed validation: If name is missing but we have ingredients/score, assume it's the product we asked for.
        if (!data.name && !data.ingredients) throw new Error("Refinement failed: No data extracted.");

        return {
            id: Date.now().toString(),
            name: data.name || visionData.name, // Fallback to vision name
            brand: data.brand || visionData.brand, 
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips,
            expertReview: data.expertReview
        };
    }, getFallbackProduct(userMetrics, "Scanned Product"), 90000); 
};

export const auditProduct = (product: Product, user: UserProfile) => {
    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    
    let adjustedScore = product.suitabilityScore;
    if (user.biometrics.redness < 50 && warnings.length > 0) adjustedScore -= 10;
    
    return {
        adjustedScore: Math.max(0, Math.min(100, adjustedScore)),
        warnings,
        analysisReason: warnings.length > 0 ? warnings[0].reason : "Good formulation match."
    };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const conflicts: string[] = [];
    const riskyProducts: any[] = [];
    const missing: string[] = [];
    const redundancies: string[] = [];
    const upgrades: string[] = [];
    
    const types = new Set(products.map(p => p.type));
    if (!types.has('CLEANSER')) missing.push('Cleanser');
    if (!types.has('SPF')) missing.push('SPF');
    if (!types.has('MOISTURIZER')) missing.push('Moisturizer');

    const avgScore = products.length > 0 ? products.reduce((acc, p) => acc + p.suitabilityScore, 0) / products.length : 0;
    let grade = 'C';
    if (avgScore > 85 && missing.length === 0) grade = 'S';
    else if (avgScore > 75) grade = 'A';
    else if (avgScore > 60) grade = 'B';

    products.forEach(p => {
        if (p.suitabilityScore < 50) {
            riskyProducts.push({ name: p.name, reason: "Low suitability score", severity: "CAUTION" });
        }
    });

    return {
        analysis: {
            grade, conflicts, riskyProducts, missing, redundancies, upgrades,
            balance: { 
                exfoliation: 50, 
                hydration: products.some(p => p.type === 'MOISTURIZER') ? 80 : 30, 
                protection: products.some(p => p.type === 'SPF') ? 90 : 20, 
                treatment: products.some(p => p.type === 'SERUM' || p.type === 'TREATMENT') ? 70 : 40 
            }
        }
    };
};

export const analyzeProductContext = (product: Product, shelf: Product[]) => {
    const typeCount = shelf.filter(p => p.type === product.type && p.id !== product.id).length;
    const conflicts: string[] = [];
    const ingredients = product.ingredients.join(' ').toLowerCase();
    
    shelf.forEach(p => {
        if (p.id === product.id) return;
        const pIng = p.ingredients.join(' ').toLowerCase();
        if (ingredients.includes('retinol') && (pIng.includes('glycolic') || pIng.includes('salicylic'))) {
            conflicts.push(`Retinol in ${product.name} vs Acids in ${p.name}`);
        }
    });

    return { conflicts, typeCount };
};

export const getClinicalTreatmentSuggestions = (user: UserProfile) => {
    const suggestions = [];
    const b = user.biometrics;
    if (b.acneActive < 70) suggestions.push({ type: 'FACIAL', name: 'Deep Pore Cleanse', benefit: 'Clears active congestion', downtime: 'None' });
    if (b.acneScars < 70) suggestions.push({ type: 'LASER', name: 'Microneedling', benefit: 'Smooths texture & scars', downtime: '1-3 Days' });
    if (b.pigmentation < 70) suggestions.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades dark spots', downtime: '2-4 Days' });
    if (b.wrinkleFine < 70) suggestions.push({ type: 'LASER', name: 'Fractional Laser', benefit: 'Stimulates collagen', downtime: '3-5 Days' });
    return suggestions.slice(0, 3);
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    // Format shelf context for the AI
    const shelfContext = shelf.length > 0 
        ? shelf.map(p => `- ${p.brand || 'Unknown'} ${p.name} (${p.type})`).join('\n')
        : "No products in routine yet.";

    return getAi().chats.create({
        model: MODEL_FACE_SCAN, 
        config: {
             systemInstruction: `You are SkinOS, an expert skincare assistant.
             
             USER PROFILE:
             - Skin Type: ${user.skinType}
             - Age: ${user.age}
             - Biometrics (0-100 score, higher is better): ${JSON.stringify(user.biometrics)}
             
             CURRENT ROUTINE (DIGITAL SHELF):
             ${shelfContext}
             
             GUIDELINES:
             - Keep answers concise, friendly, and practical.
             - Use the shelf context to give personalized advice.
             - If the user asks about products not on the shelf, you can answer generally or compare them to what they own.
             - Focus on ingredients and scientific efficacy.
             `
        }
    });
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    let decision = 'CONSIDER';
    let color = 'zinc';
    if (audit.adjustedScore > 85 && audit.warnings.length === 0) { decision = 'BUY'; color = 'emerald'; }
    else if (audit.adjustedScore > 75) { decision = 'GREAT FIND'; color = 'teal'; }
    else if (audit.adjustedScore < 40 || audit.warnings.some(w => w.severity === 'CRITICAL')) { decision = 'AVOID'; color = 'rose'; }
    else if (audit.adjustedScore < 60) { decision = 'CAUTION'; color = 'amber'; }
    
    return {
        verdict: { decision, title: decision, description: audit.analysisReason, color },
        audit,
        shelfConflicts: [],
        comparison: { result: audit.adjustedScore > 70 ? 'BETTER' : 'NEUTRAL' }
    };
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runWithRetry<any>(async (ai) => {
        const prompt = `
        ACT AS DERMATOLOGIST. User: Age ${user.age}, Skin ${user.skinType}.
        TASK: Generate AM/PM routine with Malaysian products (Watsons/Guardian).
        OUTPUT JSON: { "am": [{ "step": "...", "products": [...] }], "pm": [...] }
        `;
        const response = await ai.models.generateContent({
            model: MODEL_ROUTINE,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return parseJSONFromText(response.text || "{}");
    }, null, 60000);
}

export const generateTargetedRecommendations = async (user: UserProfile, category: string, maxPrice: number, allergies: string, goals: string[]): Promise<any> => {
    return runWithRetry<any>(async (ai) => {
        const goalsString = goals.length > 0 ? goals.join(', ') : "General Skin Health";
        const prompt = `
        ACT AS PERSONAL SHOPPER. User Skin: ${user.skinType}, Concerns: ${JSON.stringify(user.biometrics)}.
        CRITERIA: ${category}, Goals: ${goalsString}, Max RM ${maxPrice}, Avoid: ${allergies}.
        TASK: Find 3 products in Malaysia (Watsons/Guardian/Sephora).
        OUTPUT JSON: [{ "name": "...", "brand": "...", "price": "RM 45", "reason": "...", "rating": 95, "tier": "VALUE" }]
        `;
        const response = await ai.models.generateContent({
            model: MODEL_ROUTINE,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }], responseMimeType: 'application/json' }
        });
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [];
    }, [], 60000);
};
