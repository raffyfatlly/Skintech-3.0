
// ... existing imports ...
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

// ... keep existing helpers and analysis functions ...
// (Retaining parseJSONFromText, extractSources, runWithTimeout, runWithRetry, analyzeProductFromSearch, analyzeProductImage, searchProducts, analyzeFaceSkin, compareFaceIdentity, auditProduct, analyzeShelfHealth, analyzeProductContext, getClinicalTreatmentSuggestions, createDermatologistSession, isQuotaError)

// --- CONFIGURATION ---
// Upgraded to Gemini 3 Flash for improved speed and reasoning
const MODEL_FAST = 'gemini-3-flash-preview'; 

// --- HELPERS ---

const parseJSONFromText = (text: string): any => {
    if (!text) return {};
    try {
        // 1. Remove markdown code blocks
        // We match ```json, ```JSON, or just ```
        let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // 2. Identify start char (Object or Array)
        const firstBrace = cleanText.indexOf('{');
        const firstBracket = cleanText.indexOf('[');
        
        let start = -1;
        let startChar = '';
        
        // Determine which comes first
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            start = firstBrace;
            startChar = '{';
        } else if (firstBracket !== -1) {
            start = firstBracket;
            startChar = '[';
        }
        
        if (start === -1) return {};
        
        // 3. Smart extraction with brace/bracket counting
        // This ensures we capture exactly one complete JSON root object, ignoring trailing text.
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
             // Fallback: If braces don't balance (truncated output), try finding the last closing char
             const lastClose = cleanText.lastIndexOf(closeChar);
             if (lastClose !== -1) {
                 cleanText = cleanText.substring(start, lastClose + 1);
             }
        }

        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Failure", e);
        // Return empty object/array depending on context if needed, but {} is safe default
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

// --- CORE ANALYSIS FUNCTION ---

export const analyzeProductFromSearch = async (
    productName: string, 
    userMetrics: SkinMetrics, 
    _unused?: any, 
    knownBrand?: string, 
    routineActives: string[] = [],
    location: string = "Global"
): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        
        // User's Exact Prompt Structure - NOW LOCATION AWARE
        const prompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        USER LOCATION: ${location} (Determine currency and product availability based on this).
        USER PROFILE (0=Bad, 100=Good): ${JSON.stringify(userMetrics)}.
        ROUTINE ACTIVES ALREADY USED: [${routineActives.join(', ')}].

        TASK: 
        1. Use Google Search to find the ingredients list and price in the User's Local Currency (infer from location).
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

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        const sources = extractSources(response);

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

        // STRICT NO-FALLBACK LOGIC
        const hasIngredients = Array.isArray(data.ingredients) && data.ingredients.length > 0;

        return {
            id: Date.now().toString(),
            name: finalName,
            brand: finalBrand,
            type: detectedType,
            ingredients: hasIngredients ? data.ingredients : [],
            // No fallback price (e.g. 45). If missing, return 0 to indicate unknown.
            estimatedPrice: typeof data.estimatedPrice === 'number' ? data.estimatedPrice : 0,
            // If ingredients are missing, score must be 0 (Unknown/Unverified), not 50.
            suitabilityScore: (typeof data.suitabilityScore === 'number' && hasIngredients) ? data.suitabilityScore : 0,
            risks: Array.isArray(data.risks) ? data.risks : [],
            benefits: Array.isArray(data.benefits) ? data.benefits : [],
            dateScanned: Date.now(),
            sources: sources,
            // Explicitly state unavailability instead of generic advice
            usageTips: data.usageTips || "Usage guidelines are unavailable for this product.",
            expertReview: data.expertReview || "Expert clinical review is unavailable at this time due to insufficient data."
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
                suitabilityScore: 0, // Score 0 for unknown
                estimatedPrice: 0,
                expertReview: "Could not identify the product from the image. Please try scanning the text or searching manually."
             }
        }

        // Step 2: Search & Deep Analysis (Using the User's "Refinement Prompt")
        const refinementPrompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${detectedBrand} ${detectedName}"
        USER LOCATION: ${location} (Determine currency and product availability based on this).
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
          "name": "${detectedName}",
          "brand": "${detectedBrand}",
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

        const searchResponse = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: refinementPrompt,
            config: { 
                tools: [{ googleSearch: {} }],
            }
        });

        const data = parseJSONFromText(searchResponse.text || "{}");
        const sources = extractSources(searchResponse);

        // STRICT NO-FALLBACK LOGIC
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
            expertReview: data.expertReview || "Analysis based on visual identification only. Detailed verification unavailable."
        };

    }, 60000);
};

// --- OTHER EXPORTS ---

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: `Find 5 specific skincare products that strictly match the user search query: "${query}".
            
            STRICT RULES:
            1. If the query is a Brand Name, return their most popular products.
            2. If the query is a Product Name, return the exact match.
            3. Do NOT suggest competitors or alternatives.
            4. Do NOT filter by skin type - return exactly what was searched.
            
            Return strictly a JSON array: [{"brand": "Brand Name", "name": "Product Name"}]`,
            config: { 
                tools: [{ googleSearch: {} }],
            }
        });
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [];
    }, [{ name: query, brand: "Generic" }]);
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    const prompt = `
    You are SkinOS. Analyze this face image for dermatological health.
    
    INPUT CV METRICS (Reference Only): ${JSON.stringify(localMetrics)}. 
    Note: These metrics are a baseline. Trust your visual analysis of the image features for the text report.
    
    GRADING RUBRIC (Use this to calibrate your JSON score output):
    - 90-100 (EXCELLENT): Healthy barrier. Minimal issues. Glass skin or very slight imperfections.
    - 75-89 (GOOD): Generally healthy. May have mild texture, slight redness, or occasional spots. **Normal skin often falls here.**
    - 60-74 (AVERAGE): Visible congestion, uneven tone, or regular mild acne.
    - 40-59 (CONCERN): Active inflammation, significant breakouts, or damaged barrier.
    - 0-39 (SEVERE): Critical condition requiring medical attention.
    
    INSTRUCTION FOR TEXT ANALYSIS ("analysisSummary" and "observations"):
    - **BE OBJECTIVE:** Describe exactly what you see (e.g., "Visible redness on cheeks", "Enlarged pores on nose"). 
    - **DO NOT** sugarcoat the visual description just because the score is high. 
    - If the score is 85 but you see a pimple, say "Overall healthy skin with a visible spot on the chin."
    - Use clinical terms but explain them simply.
    
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
    
    // No tools used here, so responseMimeType is safe and recommended
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
    // 0. MISSING DATA CHECK
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            adjustedScore: 0,
            warnings: [{ severity: 'CAUTION', reason: "Ingredients list could not be retrieved." }],
            analysisReason: "We could not access the ingredient data for this product to perform a safety audit."
        };
    }

    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    let adjustedScore = product.suitabilityScore;
    const ingStr = product.ingredients.join(' ').toLowerCase();
    const bio = user.biometrics;

    // 1. HYDRATION PENALTY (Specific request: Low Hydration = High Penalty for Drying Agents)
    if (bio.hydration < 50) {
        const dryingAgents = ['alcohol denat', 'sd alcohol', 'isopropyl alcohol', 'sodium lauryl sulfate', 'sls', 'ammonium lauryl sulfate'];
        const found = dryingAgents.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore -= 30; // Heavy penalty
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, which dehydrates dry skin.` });
        }
    }

    // 2. SENSITIVITY / REDNESS PENALTY
    if (bio.redness < 50 || user.preferences?.sensitivity === 'VERY_SENSITIVE' || user.preferences?.hasEczema) {
        const irritants = ['fragrance', 'parfum', 'alcohol denat', 'essential oil', 'menthol', 'eucalyptus'];
        const found = irritants.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 40);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, a known trigger for sensitive skin.` });
        }
    }

    // 3. ACNE PENALTY (Low Score = Active Acne)
    if (bio.acneActive < 55) {
        const cloggers = ['coconut oil', 'cocoa butter', 'isopropyl myristate', 'algae extract', 'carrageenan', 'palm oil'];
        const found = cloggers.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 35);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, a high-risk pore clogger.` });
        }
    }

    // 4. PREGNANCY SAFETY
    if (user.preferences?.isPregnant) {
        const unsafe = ['retinol', 'retinyl', 'tretinoin', 'hydroquinone', 'arbutin', 'salicylic acid']; 
        // Note: Salicylic < 2% is often okay but generally flagged for safety in apps
        const found = unsafe.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = 0;
            warnings.unshift({ severity: 'CRITICAL', reason: `Not recommended during pregnancy (contains ${found}).` });
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
            USER LOCATION: ${location}. Take into account the user's local climate, season, and likely product availability when giving advice.
            USER SHELF: ${shelfContext}
            Provide specific, science-backed advice.
            ` 
        }
    });
};

export const isQuotaError = (e: any) => e?.message?.includes('429') || e?.status === 429;

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    // SPECIAL: Missing Data handling to prevent AVOID fallback
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            verdict: { 
                decision: 'UNKNOWN', 
                title: 'Info Unavailable', 
                description: "We couldn't retrieve the ingredients for this product. Use Google AI to verify safety.", 
                color: 'zinc' 
            },
            audit: {
                adjustedScore: 0, 
                warnings: [], 
                analysisReason: "Ingredients missing."
            },
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
        // No tools, safe to use responseMimeType
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
        const prompt = `
        TASK: Recommend 3 ${category} products available in ${location} or Globally.
        
        USER GOALS: ${goals.join(', ')}.
        USER LOCATION: ${location} (Respect local currency/availability).
        BUDGET: ${maxPrice} (Approximate in local currency).
        SKIN TYPE: ${user.skinType}
        
        SAFETY CONSTRAINTS:
        - Acne Score: ${m.acneActive} (If < 60: Avoid Pore Cloggers)
        - Sensitivity: ${m.redness} (If < 60: Avoid Alcohol/Fragrance)
        
        Output strictly valid JSON: [{ "name": "string", "brand": "string", "price": "string", "reason": "string", "rating": number }]
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
            }
        });
        return parseJSONFromText(response.text || "[]");
    }, 240000);
};
