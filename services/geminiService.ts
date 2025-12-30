
import { GoogleGenAI, Type, SchemaShared } from "@google/genai";
import type { Chat } from "@google/genai";
import { SkinMetrics, Product, UserProfile } from '../types';

let aiInstance: GoogleGenAI | null = null;

const getAi = (): GoogleGenAI => {
    if (!aiInstance) {
        aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return aiInstance;
};

// --- CONFIGURATION ---
// Using Flash for speed. The multi-step architecture provides the intelligence.
const MODEL_FAST = 'gemini-3-flash-preview'; 

// --- HELPERS ---

const parseJSONFromText = (text: string): any => {
    if (!text) return {};
    try {
        const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            return JSON.parse(codeBlockMatch[1]);
        }
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
             try { return JSON.parse(text); } catch(e) { return isArray ? [] : {}; }
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

const runWithTimeout = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, timeoutMs: number = 240000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Analysis timed out. Please check your connection.")), timeoutMs));
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

// --- SCORING RULES ---
const getStrictScoringRules = (user: UserProfile): string => {
    const m = user.biometrics;
    
    // Identify USER DEFICITS (Low scores = Bad condition)
    const deficits = [];
    if (m.acneActive < 75) deficits.push('ACNE/CONGESTION (User has active breakouts)');
    if (m.pigmentation < 75) deficits.push('HYPERPIGMENTATION (User has dark spots)');
    if (m.wrinkleFine < 75 || m.wrinkleDeep < 75) deficits.push('AGING/WRINKLES (User has signs of aging)');
    if (m.hydration < 60) deficits.push('DEHYDRATION (User skin is dry/dehydrated)');
    if (m.redness < 70) deficits.push('SENSITIVITY (User is prone to redness/irritation)');
    if (m.oiliness < 60) deficits.push('EXCESS OIL (User has uncontrolled oil production)');

    const userProfileString = deficits.length > 0 
        ? `USER PRIORITIES (Conditions needing treatment): ${deficits.join(', ')}`
        : "USER STATUS: Healthy/Maintenance Mode. Focus on barrier support.";

    let rules = [
        `CONTEXT: ${userProfileString}`,
        "CLIMATE: Malaysia (Hot & Humid).",
        "SCORING SYSTEM (0-100):",
        "1. PERSONALIZATION IS MANDATORY. Do not score generically.",
        "2. HIGH SCORE (85-100): Product contains active ingredients that DIRECTLY treat the User's Priorities listed above. (e.g. Salicylic for Acne user).",
        "3. LOW SCORE (0-40): Product contains ingredients that conflict with User's Priorities (e.g. Alcohol for Sensitive user, Pore cloggers for Acne user).",
        "4. NEUTRAL (50-75): Product is safe but does not target specific deficits.",
        "",
        "RISK ASSESSMENT:",
        "- CRITICAL RISK (High Level): Only assign 'HIGH' risk if the ingredient harms a SPECIFIC user condition identified above.",
        "- REFERENCE RISK (Low/Medium Level): General 'clean beauty' concerns (e.g. Fragrance, Essential Oils) are LOW RISK unless the user has SENSITIVITY/REDNESS.",
        "  - Example: Fragrance is fine for a non-sensitive user (Score stays high). Fragrance is CRITICAL for a sensitive user (Score drops).",
    ];
    
    return rules.join('\n');
};

// --- SCHEMAS ---
const PRODUCT_SCHEMA: SchemaShared = {
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
                    relevance: { type: Type.STRING }
                }
            }
        },
        usageTips: { type: Type.STRING },
        expertReview: { type: Type.STRING }
    },
    required: ["name", "brand", "type"]
};

// --- RECOVERY AGENTS ---

// Agent 1: Ingredient Hunter (Robust Fallback Strategy)
const recoverIngredients = async (ai: GoogleGenAI, name: string, brand: string): Promise<string[]> => {
    console.log(`[Agent] Recovering ingredients for ${brand} ${name}...`);
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: `
            Find the EXACT full ingredient list for "${brand} ${name}".
            
            SEARCH STRATEGY (Execute in order):
            1. **PRIORITY**: Search "site:incidecoder.com ${brand} ${name}". If found, use this list.
            2. **SECONDARY**: If Incidecoder is blocked or empty, search "site:skincarisma.com ${brand} ${name}" OR "site:cosdna.com ${brand} ${name}".
            3. **FALLBACK**: Search general retailers (Sephora, Ulta, Watsons) or the official brand site for the ingredient list.
            4. **LAST RESORT**: Search for "ingredients in ${brand} ${name}" and synthesize the list from snippets.
            
            Return ONLY a JSON object: { "ingredients": ["Water", "Glycerin", ...] }. 
            If completely unavailable after all attempts, return { "ingredients": [] }.
            `,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json'
            }
        });
        const data = parseJSONFromText(response.text || "{}");
        return Array.isArray(data.ingredients) ? data.ingredients : [];
    } catch (e) {
        console.warn("Ingredient recovery failed", e);
        return [];
    }
};

// Agent 2: Review Summarizer
const recoverReviews = async (ai: GoogleGenAI, name: string, brand: string): Promise<string> => {
    console.log(`[Agent] Recovering reviews for ${brand} ${name}...`);
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: `
            Search for credible reviews (Reddit, MakeupAlley, Incidecoder, Expert Blogs) for "${brand} ${name}". 
            Synthesize the general consensus on efficacy, texture, and experience.
            
            STYLE:
            - Objective consensus synthesis.
            - Do NOT use first-person ("I think", "In my opinion", "As a chemist").
            - Use phrases like "Users report...", "Consensus indicates...", "The formula is noted for...".
            
            Return JSON: { "review": "summary string" }
            `,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json'
            }
        });
        const data = parseJSONFromText(response.text || "{}");
        return data.review || "";
    } catch (e) {
        return "";
    }
};

// Agent 3: Safety Auditor (Pure Reasoning)
// This runs if we had to recover ingredients, to ensure the score matches the new list.
const assessSafety = async (ai: GoogleGenAI, ingredients: string[], userMetrics: SkinMetrics, name: string, type: string): Promise<Partial<Product>> => {
    console.log(`[Agent] Re-calculating safety for ${ingredients.length} ingredients...`);
    const tempUser: UserProfile = { name: "User", age: 25, skinType: "UNKNOWN" as any, hasScannedFace: true, biometrics: userMetrics };
    const rules = getStrictScoringRules(tempUser);
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: `
            Perform a strict, personalized dermatological safety analysis for this product.
            PRODUCT: ${name} (${type})
            INGREDIENTS: ${JSON.stringify(ingredients)}
            
            RULES: 
            ${rules}
            
            OUTPUT JSON: { "suitabilityScore": number, "risks": [], "benefits": [], "usageTips": "string" }
            
            NOTE: "usageTips" should be objective instructions (e.g. "Apply on damp skin"). Do not use "I advise".
            `,
            config: { responseMimeType: 'application/json' }
        });
        return parseJSONFromText(response.text || "{}");
    } catch (e) {
        return {};
    }
};

// --- ORCHESTRATOR ---

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, _unused?: any, knownBrand?: string, routineActives: string[] = []): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        const tempUser: UserProfile = { name: "User", age: 25, skinType: "UNKNOWN" as any, hasScannedFace: true, biometrics: userMetrics };
        const rules = getStrictScoringRules(tempUser);

        // 1. PRIMARY SEARCH (Try to get everything in one shot)
        const prompt = `
        Target: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''} available in Malaysia/Global.
        User: ${JSON.stringify(userMetrics)}
        Routine Actives: ${JSON.stringify(routineActives)}
        
        DATA SOURCE PRIORITY (STRICT):
        1. **Incidecoder.com**: Search "site:incidecoder.com ${productName}" FIRST for the authoritative INCI list.
        2. **Other Databases**: Skincarisma, CosDNA if Incidecoder fails.
        3. **General Web**: Retailers (Sephora, Watsons) or Brand Site.
        
        TASK:
        1. Find EXACT Ingredient List (Following priority above).
        2. Find Price (MYR).
        3. Synthesize a "Consensus Review".
           - STYLE: Objective summary of expert and user consensus.
           - FORBIDDEN: Do NOT use "I", "me", "my", "As a chemist", or personal opinions.
           - FOCUS: Texture, finish, and efficacy based on data.
        4. Analyze Safety using: ${rules}
        
        If ingredients aren't found in snippets, return empty ingredients array []. 
        DO NOT HALLUCINATE INGREDIENTS.
        `;

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                responseSchema: PRODUCT_SCHEMA
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        const sources = extractSources(response);
        
        // 2. DATA REPAIR PIPELINE
        // If critical data is missing, we spawn specific agents to find it.
        let isDataPatched = false;

        // Check Ingredients
        if (!data.ingredients || data.ingredients.length === 0) {
            const recoveredIng = await recoverIngredients(ai, data.name || productName, data.brand || knownBrand || "");
            if (recoveredIng.length > 0) {
                data.ingredients = recoveredIng;
                isDataPatched = true;
            }
        }

        // Check Review
        if (!data.expertReview || data.expertReview.length < 15) {
            const recoveredReview = await recoverReviews(ai, data.name || productName, data.brand || knownBrand || "");
            if (recoveredReview) {
                data.expertReview = recoveredReview;
            }
        }

        // 3. FINAL AUDIT
        // If we patched ingredients, the original score/risks are invalid (based on empty list). Re-run logic.
        if (isDataPatched && data.ingredients.length > 0) {
            const safetyData = await assessSafety(ai, data.ingredients, userMetrics, data.name || productName, data.type || "UNKNOWN");
            // Merge safety data
            data.suitabilityScore = safetyData.suitabilityScore ?? data.suitabilityScore;
            data.risks = safetyData.risks ?? data.risks;
            data.benefits = safetyData.benefits ?? data.benefits;
            data.usageTips = safetyData.usageTips ?? data.usageTips;
        }

        // 4. FALLBACK CONSTRUCTION
        return {
            id: Date.now().toString(),
            name: data.name || productName,
            brand: data.brand || knownBrand || "Unknown",
            type: data.type || "UNKNOWN",
            ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: Math.min(99, Math.max(0, data.suitabilityScore || 50)),
            risks: Array.isArray(data.risks) ? data.risks : [],
            benefits: Array.isArray(data.benefits) ? data.benefits : [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips,
            expertReview: data.expertReview
        };

    }, 240000); // 4 Minutes Window
};

export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics, routineActives: string[] = []): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        // Step 1: Vision to Text
        const visionResp = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: `Identify product. Return JSON: { "brand": "string", "name": "string" }` }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        const visionData = parseJSONFromText(visionResp.text || "{}");
        const detectedName = visionData.name && visionData.name !== "Unknown" ? visionData.name : "Unknown Product";
        const detectedBrand = visionData.brand || "";

        // Step 2: Hand off to the robust Search Orchestrator
        // This reuses the same recovery logic defined above.
        const product = await analyzeProductFromSearch(detectedName, userMetrics, undefined, detectedBrand, routineActives);
        
        return product;
    }, 240000);
};

// --- OTHER EXPORTS (Unchanged) ---

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: `List 5 skincare products matching "${query}" in Malaysia. JSON: [{"brand": "string", "name": "string"}]`,
            config: { responseMimeType: 'application/json' }
        });
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [];
    }, [{ name: query, brand: "Generic" }]);
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    const previousScan = history && history.length > 0 ? history[history.length - 1] : null;
    const prompt = `
    You are SkinOS. Analyze this face image.
    INPUT CV METRICS: ${JSON.stringify(localMetrics)}
    PREVIOUS SCORE: ${previousScan ? previousScan.overallScore : 'None'}
    
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
        "generalCondition": "2 sentences summary",
        "points": [{ "subtitle": "Concern", "content": "Details" }]
      },
      "immediateAction": "One tip",
      "observations": { "acneActive": "Details" }
    }
    `;
    
    const response = await getAi().models.generateContent({
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

export const auditProduct = (product: Product, user: UserProfile) => {
    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    let adjustedScore = product.suitabilityScore;
    if (user.biometrics.redness < 50 && adjustedScore > 60) {
        const ingStr = product.ingredients.join(' ').toLowerCase();
        if (ingStr.includes('alcohol denat') || ingStr.includes('fragrance') || ingStr.includes('parfum')) {
            adjustedScore = 40;
            warnings.unshift({ severity: 'CRITICAL', reason: 'Fragrance/Alcohol conflict.' });
        }
    }
    return {
        adjustedScore: Math.max(0, Math.min(99, adjustedScore)),
        warnings,
        analysisReason: warnings.length > 0 ? warnings[0].reason : "Good match."
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

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    // 1. Get User Data
    const biometrics = user.biometrics;
    
    // 2. Construct Data Strings
    const userContext = JSON.stringify(biometrics);
    const shelfContext = shelf.map(p => `${p.brand || ''} ${p.name}`).join(', ');

    // 3. Define Metric Legend (Crucial for AI understanding)
    const legend = `
    CRITICAL SCORING GUIDE (0-100 Scale):
    - HIGH SCORE (80-100) = GOOD / HEALTHY / CONTROLLED.
    - LOW SCORE (0-50) = BAD / CONCERN / UNCONTROLLED.
    
    EXAMPLES:
    - Oiliness: 90 = Balanced/Good. 20 = Very Oily/Bad (Uncontrolled).
    - Acne: 90 = Clear Skin. 20 = Active Breakouts.
    - Hydration: 90 = Well Hydrated. 20 = Dehydrated.
    - Sensitivity/Redness: 90 = Calm/Resilient. 20 = Inflamed/Sensitive.
    
    IMPORTANT: Do NOT misinterpret low 'Oiliness' or 'Acne' scores. A low score means the CONDITION is bad (i.e. very oily or very acne-prone). A high score means the condition is good (balanced oil, clear skin).
    `;

    return getAi().chats.create({
        model: MODEL_FAST,
        config: { 
            systemInstruction: `You are SkinOS, an expert dermatological AI assistant.
            
            USER PROFILE:
            ${userContext}
            
            USER SHELF:
            ${shelfContext}
            
            ${legend}
            
            Your goal is to provide specific, science-backed advice based on the user's specific biometric scores and product routine.
            ` 
        }
    });
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    
    // Default Decision
    let decision = 'CONSIDER';
    
    // Check for critical warnings (High Risk)
    const hasCriticalWarnings = audit.warnings.some(w => w.severity === 'CRITICAL');

    // RULES:
    // 1. BUY: High Score AND No Critical Risks (Minor Cautions OK)
    // 2. AVOID: Low Score OR Critical Risks
    // 3. CONSIDER: Middle Score, No Critical Risks
    
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

export const generateTargetedRecommendations = async (user: UserProfile, category: string, maxPrice: number, allergies: string, goals: string[]): Promise<any> => {
    return runWithTimeout<any>(async (ai) => {
        // --- SMART CONTEXT GENERATION ---
        const m = user.biometrics;
        
        // 1. Define Safety Constraints (MUST AVOID) based on Biometrics
        const safetyConstraints = [];
        if (m.acneActive < 75 || m.oiliness < 70) {
            safetyConstraints.push("ACNE/OILY: STRICTLY AVOID pore-clogging ingredients (e.g., Cocoa Butter, Coconut Oil, Isopropyl Myristate, high Oleic oils). Must be Non-Comedogenic.");
        }
        if (m.redness < 75) {
            safetyConstraints.push("SENSITIVE: STRICTLY AVOID drying alcohols (Alcohol Denat), strong essential oils, and high fragrance loads.");
        }

        // 2. Define "Bonus" Targets (Secondary Ranking Factors)
        // These are low scores that are NOT the primary goal, but good if the product helps them too.
        const secondaryConcerns = [];
        if (m.hydration < 60 && !goals.some(g => g.toLowerCase().includes('hydra'))) secondaryConcerns.push('Dehydration');
        if (m.pigmentation < 70 && !goals.some(g => g.toLowerCase().includes('bright'))) secondaryConcerns.push('Pigmentation');
        if (m.acneScars < 70 && !goals.some(g => g.toLowerCase().includes('scar'))) secondaryConcerns.push('Texture/Scarring');
        if (m.wrinkleFine < 70 && !goals.some(g => g.toLowerCase().includes('aging'))) secondaryConcerns.push('Fine Lines');

        // 3. Nuance Context for Specific Goals (Clarification)
        const nuanceContext = [];
        if (goals.some(g => g.toLowerCase().includes('scar'))) {
            if (m.acneScars < 65) {
                nuanceContext.push("SCAR CONTEXT: User has pitted/atrophic scarring. Prioritize collagen-building actives (Peptides, Retinoids, Growth Factors) over simple brighteners.");
            } else {
                nuanceContext.push("SCAR CONTEXT: User has PIH (Dark Spots). Prioritize Tyrosinase Inhibitors (Vit C, Azelaic Acid, Niacinamide).");
            }
        }

        const prompt = `
        TASK: Recommend 3 ${category} products available in Malaysia/Global.
        
        1. PRIMARY FILTER (USER DEMAND): ${goals.join(', ')}.
           - The product MUST explicitly target this goal.
        
        2. SAFETY FIREWALL (STRICT EXCLUSION):
           - Skin Type: ${user.skinType}
           - Allergies to avoid: ${allergies || "None"}
           - ${safetyConstraints.join('\n   - ')}
        
        3. NUANCE & CLARIFICATION:
           - ${nuanceContext.join('\n   - ')}

        4. SECONDARY RANKING (BONUS POINTS):
           - Rank higher if product ALSO helps with: ${secondaryConcerns.join(', ')}.
        
        INSTRUCTIONS:
        - Step 1: Find products that meet the PRIMARY FILTER.
        - Step 2: Discard any that violate SAFETY FIREWALL (e.g. if User has Acne, discard Coconut Oil products even if they are good for Hydration).
        - Step 3: Sort remaining products by how well they address SECONDARY RANKING.
        
        Output JSON: [{ "name": "string", "brand": "string", "price": "string", "reason": "string", "rating": number, "tier": "BEST MATCH" }]
        
        "reason" should explain WHY it fits the Primary Goal AND matches the Safety Constraints.
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json'
            }
        });
        return parseJSONFromText(response.text || "[]");
    }, 240000);
};
