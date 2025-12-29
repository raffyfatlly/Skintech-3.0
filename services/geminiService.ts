
import * as GenAI from "@google/genai";
import { Type } from "@google/genai";
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
const MODEL_VISION = 'gemini-3-flash-preview';
const MODEL_ROUTINE = 'gemini-3-flash-preview';

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

        if (start === -1 || end === -1) {
             // 3. Last ditch effort: Try parsing the whole text if it looks like JSON
             try {
                 return JSON.parse(text);
             } catch(e) {
                 return isArray ? [] : {};
             }
        }

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

// --- SHARED SCORING LOGIC ---
const getStrictScoringRules = (user: UserProfile): string => {
    const m = user.biometrics;
    
    // Explicitly define "Bad" scores (Low Score = Deficit/Problem)
    const deficits = [];
    if (m.acneActive < 75) deficits.push('ACNE/CONGESTION');
    if (m.pigmentation < 75) deficits.push('HYPERPIGMENTATION');
    if (m.wrinkleFine < 75 || m.wrinkleDeep < 75) deficits.push('AGING/WRINKLES');
    if (m.hydration < 60) deficits.push('DEHYDRATION');
    if (m.redness < 70) deficits.push('SENSITIVITY/REDNESS');
    if (m.oiliness < 60) deficits.push('EXCESS_OIL');

    const userProfileString = deficits.length > 0 
        ? `USER PRIORITIES (AREAS NEEDING TREATMENT): ${deficits.join(', ')}`
        : "USER STATUS: Healthy/Maintenance Mode.";

    let rules = [
        `SCORING MODEL: Start at 60 (Neutral). Calculate Net Score = 60 + Rewards - Penalties.`,
        `CONTEXT: ${userProfileString}`,
        "CLIMATE: Malaysia (Hot & Humid).",
        "OBJECTIVE: Reward 'Gold Standard' ingredients that fix the USER PRIORITIES.",
    ];

    rules.push("\n--- REWARDS (ADD POINTS) ---");
    rules.push("1. GOLD STANDARD MATCH (+15 PTS): If ingredient is the clinical best-in-class for a USER PRIORITY.");
    rules.push("   - Acne Priority: Salicylic Acid, Adapalene, Benzoyl Peroxide.");
    rules.push("   - Aging Priority: Retinol, Retinal, Peptides, Tretinoin.");
    rules.push("   - Pigmentation Priority: Vitamin C (L-Ascorbic), Tranexamic Acid, Azelaic Acid, Thiamidol.");
    rules.push("   - Hydration Priority: Ceramides, Urea, Squalane (Bio-identical).");
    rules.push("   - Redness Priority: Centella Asiatica, Panthenol, Allantoin, Mugwort.");
    rules.push("2. SECONDARY MATCH (+5 to +10 PTS): Good but generic ingredients.");
    rules.push("3. FORMULATION BONUS (+5 PTS): Soothing agents or lightweight textures.");

    rules.push("\n--- PENALTIES (SUBTRACT POINTS) ---");
    // Sensitivity check: If redness score is low (meaning high redness), penalize irritants heavily
    if (m.redness < 65) rules.push("SENSITIVITY CONFLICT (-30 PTS): Alcohol Denat, High Fragrance, Menthol.");
    else rules.push("IRRITANT CAUTION (-10 PTS): High Alcohol or Fragrance.");

    if (m.acneActive < 70) rules.push("PORE CLOGGING RISK (-30 PTS): Coconut Oil, Cocoa Butter, Isopropyl Myristate.");
    if (m.hydration < 50) rules.push("DRYING RISK (-20 PTS): SLS, Clay (high up), Alcohol Denat.");
    rules.push("CLIMATE MISMATCH (-10 PTS): Heavy Balms, thick Butters.");

    return rules.join('\n');
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
        "headline": "Diagnostic headline",
        "generalCondition": "Holistic summary",
        "points": [
           { "subtitle": "Concern", "content": "Details" }
        ]
      },
      "immediateAction": "Actionable tip",
      "observations": { "acneActive": "Details" }
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

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, _unusedScore?: number, knownBrand?: string, routineActives: string[] = []): Promise<Product> => {
    const tempUser: UserProfile = { 
        name: "User", age: 25, skinType: "UNKNOWN" as any, hasScannedFace: true, biometrics: userMetrics 
    };
    const scoringRules = getStrictScoringRules(tempUser);

    return runWithRetry<Product>(async (ai) => {
        const prompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        CONTEXT: User in MALAYSIA. 
        USER BIOMETRICS: ${JSON.stringify(userMetrics)}.
        ROUTINE ACTIVES: [${routineActives.join(', ')}].

        TASK: 
        1. Use Google Search to find the EXACT full ingredients list and price in MYR.
        2. Analyze using these RULES: ${scoringRules}
        
        CRITICAL: 
        - Be OBJECTIVE. Do not inflate the suitability score. 
        - If the product contains high-risk ingredients for this user (e.g. Alcohol for Sensitive skin), the score MUST reflect that (e.g. < 60).
        
        OUTPUT: Strict JSON Schema.
        `;

        const response = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH,
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        brand: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ["CLEANSER", "TONER", "SERUM", "MOISTURIZER", "SPF", "TREATMENT", "FOUNDATION", "UNKNOWN"] },
                        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                        estimatedPrice: { type: Type.NUMBER },
                        suitabilityScore: { type: Type.NUMBER },
                        risks: { 
                            type: Type.ARRAY, 
                            items: { 
                                type: Type.OBJECT, 
                                properties: {
                                    ingredient: { type: Type.STRING },
                                    riskLevel: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] },
                                    reason: { type: Type.STRING }
                                } 
                            } 
                        },
                        benefits: { 
                            type: Type.ARRAY, 
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    ingredient: { type: Type.STRING },
                                    target: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    relevance: { type: Type.STRING, enum: ["HIGH", "MAINTENANCE"] }
                                }
                            }
                        },
                        usageTips: { type: Type.STRING },
                        expertReview: { type: Type.STRING }
                    },
                    required: ["name", "brand", "type", "ingredients", "suitabilityScore", "risks", "benefits", "expertReview"]
                }
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        const sources = extractSources(response);

        if (!data || (!data.name && !data.ingredients)) {
            throw new Error("Refinement failed: Incomplete data.");
        }

        return {
            id: Date.now().toString(),
            name: data.name || productName,
            brand: data.brand || knownBrand || "Unknown",
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: Math.min(99, Math.max(0, data.suitabilityScore || 50)),
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips,
            expertReview: data.expertReview
        };
    }, { ...getFallbackProduct(userMetrics, productName), suitabilityScore: 75, brand: knownBrand || "Unknown Brand" }, 90000); 
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
        const tempUser: UserProfile = { name: "User", age: 25, skinType: "UNKNOWN" as any, hasScannedFace: true, biometrics: userMetrics };
        const scoringRules = getStrictScoringRules(tempUser);

        const refinementPrompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${visionData.brand} ${visionData.name}"
        CONTEXT: Malaysia.
        USER BIOMETRICS: ${JSON.stringify(userMetrics)}.
        ROUTINE ACTIVES: [${routineActives.join(', ')}].

        TASK: 
        1. Search for the product's full ingredient list and reviews.
        2. Analyze for risks/benefits using these RULES: ${scoringRules}
        
        OUTPUT: Strict JSON Schema.
        `;

        const finalResponse = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH,
            contents: refinementPrompt,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        brand: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ["CLEANSER", "TONER", "SERUM", "MOISTURIZER", "SPF", "TREATMENT", "FOUNDATION", "UNKNOWN"] },
                        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                        estimatedPrice: { type: Type.NUMBER },
                        suitabilityScore: { type: Type.NUMBER },
                        risks: { 
                            type: Type.ARRAY, 
                            items: { 
                                type: Type.OBJECT, 
                                properties: {
                                    ingredient: { type: Type.STRING },
                                    riskLevel: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] },
                                    reason: { type: Type.STRING }
                                } 
                            } 
                        },
                        benefits: { 
                            type: Type.ARRAY, 
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    ingredient: { type: Type.STRING },
                                    target: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    relevance: { type: Type.STRING, enum: ["HIGH", "MAINTENANCE"] }
                                }
                            }
                        },
                        usageTips: { type: Type.STRING },
                        expertReview: { type: Type.STRING }
                    },
                    required: ["name", "brand", "type", "ingredients", "suitabilityScore", "risks", "benefits", "expertReview"]
                }
            }
        });

        const data = parseJSONFromText(finalResponse.text || "{}");
        const sources = extractSources(finalResponse);
        
        if (!data.name && !data.ingredients) throw new Error("Refinement failed: No data extracted.");

        return {
            id: Date.now().toString(),
            name: data.name || visionData.name,
            brand: data.brand || visionData.brand, 
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: Math.min(99, Math.max(0, data.suitabilityScore || 50)),
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
    // This function is for LOCAL re-calculation if needed, but we rely on AI score now.
    // However, to be safe, we re-apply the redness penalty if the AI missed it.
    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    
    let adjustedScore = product.suitabilityScore;
    
    // Safety Net: Double Check critical mismatch even if AI gave high score
    if (user.biometrics.redness < 50 && adjustedScore > 60) {
        // Simple heuristic check for common irritants in the ingredient list string
        const ingStr = product.ingredients.join(' ').toLowerCase();
        if (ingStr.includes('alcohol denat') || ingStr.includes('fragrance') || ingStr.includes('parfum')) {
            adjustedScore = 40; // Force downgrade
            warnings.unshift({ severity: 'CRITICAL', reason: 'Contains fragrance/alcohol which conflicts with your high sensitivity.' });
        }
    }
    
    return {
        adjustedScore: Math.max(0, Math.min(99, adjustedScore)), // CLAMPED MAX 99
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
             - Use the shelf context to give personalized advice on what they ALREADY own.
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
        TASK: Generate AM/PM routine.
        OUTPUT JSON.
        `;
        const response = await ai.models.generateContent({
            model: MODEL_ROUTINE,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }], responseMimeType: 'application/json' }
        });
        return parseJSONFromText(response.text || "{}");
    }, null, 60000);
}

export const generateTargetedRecommendations = async (user: UserProfile, category: string, maxPrice: number, allergies: string, goals: string[]): Promise<any> => {
    // We don't use getStrictScoringRules here directly in the prompt text as we want a cleaner "Search Intent" context first.
    
    return runWithRetry<any>(async (ai) => {
        const goalsString = goals.length > 0 ? goals.join(', ') : "General Skin Health";
        
        // 1. Interpret Biometrics for the AI
        const bio = user.biometrics;
        const lowScores = [];
        if (bio.acneActive < 70) lowScores.push("ACNE/BLEMISHES (Needs Salicylic/Niacinamide)");
        if (bio.oiliness < 60) lowScores.push("EXCESS OIL (Needs Sebum Control)");
        if (bio.redness < 70) lowScores.push("REDNESS/INFLAMMATION (Needs Soothing)");
        if (bio.hydration < 60) lowScores.push("DEHYDRATION (Needs Hydration)");
        if (bio.wrinkleFine < 70) lowScores.push("SIGNS OF AGING (Needs Retinoids/Peptides)");
        if (bio.pigmentation < 70) lowScores.push("HYPERPIGMENTATION (Needs Vit C/Brightening)");

        const priorities = lowScores.length > 0 ? lowScores.join(', ') : "MAINTENANCE (Keep Barrier Healthy)";

        const userContext = `
        USER PROFILE:
        - Skin Type: ${user.skinType}
        - Biometrics Score Legend: HIGH (80-100) = HEALTHY/GOOD. LOW (0-60) = BAD/CONCERN.
        - User's Specific Deficits (Low Scores): ${priorities}
        - Goals: ${goalsString}
        - Allergies/Avoid: ${allergies || "None"}
        - Location: Malaysia (Tropical, Humid).
        - Budget: Under RM ${maxPrice}.
        `;

        const prompt = `
        ACT AS A DERMATOLOGICAL AI ARCHITECT.
        
        INPUT CONTEXT:
        ${userContext}
        
        TASK: FIND THE TOP 3 BEST ${category.toUpperCase()} PRODUCTS.
        
        EXECUTION STEPS:
        1. **GLOBAL SEARCH**: Use Google Search to find 5 top-rated, accessible ${category} products in Malaysia that specifically target: ${priorities} and ${goalsString}.
        2. **FILTER & AUDIT**: 
           - Discard any products containing [${allergies}].
           - Discard products strictly incompatible with ${user.skinType} skin.
           - Ensure price is approx under RM ${maxPrice}.
        3. **SCORING CHECK**:
           - Does it solve the "User's Specific Deficits"? If yes, High Score.
           - If User has "REDNESS" (Low redness score), product MUST be soothing (Aloe, Centella, etc).
           - If User has "EXCESS OIL" (Low oiliness score), product MUST be non-comedogenic/oil-control.
        4. **FINAL SELECTION**: Return the Top 3 products.
        
        CRITICAL: 
        - The products MUST be real and purchasable in Malaysia.
        - The "rating" must be a realistic prediction of the match score (0-99).
        - "reason" should explain why it was chosen over the others.

        OUTPUT JSON:
        [
          { 
             "name": "Product Name", 
             "brand": "Brand", 
             "price": "RM XX", 
             "reason": "Explicitly explain how it addresses [${lowScores[0] || 'Goals'}]...", 
             "rating": 95, 
             "tier": "BEST MATCH" 
          }
        ]
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_ROUTINE,
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }], 
                responseMimeType: 'application/json' 
            }
        });
        const res = parseJSONFromText(response.text || "[]");
        const items = Array.isArray(res) ? res : [];
        return items.map((item: any) => ({
            ...item,
            rating: Math.min(99, item.rating || 0)
        }));
    }, [], 90000); // 90s timeout for deep search
};
