
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile, IngredientRisk, Benefit } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helpers
const parseJSONFromText = (text: string): any => {
    try {
        // Find the first occurrence of { or [
        const startObj = text.indexOf('{');
        const startArr = text.indexOf('[');
        
        // Determine which comes first (or exists)
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

const runWithRetry = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, fallback: T, timeoutMs: number = 30000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));
        return await Promise.race([fn(ai), timeoutPromise]);
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
        
        TASK:
        1. **Brand Detection**: Analyze if the query contains a specific brand name (e.g., "Neutrogena", "CeraVe", "Ordinary", "La Roche").
        
        2. **STRICT FILTERING RULES**:
           - **IF A BRAND IS IDENTIFIED**: 
             - You must ONLY return products from that EXACT brand. 
             - Do **NOT** include products from competitors.
             - Return a list of 5-10 items covering the specific product intended AND its variations/lines (e.g., if user types "neutrogena acne cleanser", return "Neutrogena Deep Clean Acne Foaming Cleanser", "Neutrogena Oil-Free Acne Wash", "Neutrogena Stubborn Texture Daily Cleanser", etc.).
             - Include full names with specific versions (e.g. "Deep Clean", "Hydro Boost", "2021 formulation" if relevant).
           
           - **IF NO BRAND IS IDENTIFIED**:
             - Return 5-10 top-rated products from various reputable global brands that match the description.
        
        3. **Robustness**: Fix typos (e.g., "nutrogena" -> "Neutrogena"). Handle product name variations and aliases (e.g., "ANR" -> "Advanced Night Repair").
        
        OUTPUT FORMAT:
        Strict JSON Array of objects.
        [
          {"brand": "Neutrogena", "name": "Neutrogena Deep Clean Acne Foaming Cleanser"},
          {"brand": "Neutrogena", "name": "Neutrogena Oil-Free Acne Wash"},
          ...
        ]
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [res].filter(x => x.name);
    }, [{ name: query, brand: "Generic" }]);
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithRetry<SkinMetrics>(async (ai) => {
        const prompt = `Analyze this face image for dermatological metrics. 
        The provided image may have lighting variances.
        Current computer-vision estimates (for reference only): ${JSON.stringify(localMetrics)}.
        
        TASK:
        1. Ignore the provided metrics if they contradict visible skin condition.
        2. Calibrate scoring to avoid extreme outliers:
           - 90-100: Clinical perfection / Glass Skin.
           - 75-89: Healthy, minor imperfections (Normal).
           - 50-74: Visible issues needing routine adjustment.
           - <50: Significant dermatological concerns.
        3. Output robust, realistic scores.

        Return JSON with fields: overallScore, acneActive, acneScars, poreSize, blackheads, wrinkleFine, wrinkleDeep, sagging, pigmentation, redness, texture, hydration, oiliness, darkCircles, skinAge, analysisSummary (string), observations (map of metric key to string observation).`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        
        const data = parseJSONFromText(response.text || "{}");
        return { ...localMetrics, ...data, timestamp: Date.now() };
    }, localMetrics);
};

export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        const prompt = `
        Product Name: "${productName}"
        ${knownBrand ? `Brand: "${knownBrand}"` : ''}
        User Metrics (Scale 0-100, HIGHER IS BETTER/HEALTHIER):
        - Hydration: ${userMetrics.hydration} (High = Hydrated)
        - Redness: ${userMetrics.redness} (High = Calm, Low = Sensitive)
        - Acne Score: ${userMetrics.acneActive} (High = Clear Skin, Low = Severe Acne)
        ${consistencyScore ? `- TARGET SCORE: ${consistencyScore} (The user was previously shown this score. Ensure analysis aligns close to this if ingredients support it.)` : ''}
        
        TASK:
        1. RECALL: Use your internal product database to find the likely FULL INGREDIENTS LIST (INCI) for "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}. 
           - Provide the most common formulation for this specific product name.
           - Estimate current price in MYR.
        
        2. SCORING STRATEGY (STRICT):
           - **Base Score**: 75 (Average).
           - **Perfect (95-99)**: Requires exact active matches AND zero risks.
           - **Excellent (85-94)**: Strong actives, maybe 1 minor acceptable trade-off.
           - **Good (75-84)**: Basic, safe, effective.
           - Penalize heavily (-10) for known irritants if skin is sensitive.
           - LIMIT: Max Score 99. Min Score 1.

        3. OUTPUT: Strict JSON format.
        {
            "name": "${productName}",
            "brand": "${knownBrand || "Brand"}",
            "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "FOUNDATION" | "OTHER",
            "ingredients": ["Water", "Glycerin", ...], 
            "estimatedPrice": Number,
            "suitabilityScore": Number,
            "risks": [{ "ingredient": "Name", "riskLevel": "HIGH", "reason": "Why" }],
            "benefits": [{ "ingredient": "Name", "target": "Target", "description": "Why", "relevance": "HIGH" }]
        }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                 responseMimeType: 'application/json'
            }
        });

        const data = parseJSONFromText(response.text || "{}");

        if (!data || !data.name) throw new Error("Analysis failed");

        if (consistencyScore && Math.abs((data.suitabilityScore || 50) - consistencyScore) > 20) {
             data.suitabilityScore = Math.round((data.suitabilityScore + consistencyScore) / 2);
        } else if (consistencyScore) {
             data.suitabilityScore = consistencyScore;
        }

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
            dateScanned: Date.now()
        };
    }, { ...getFallbackProduct(userMetrics, productName), suitabilityScore: consistencyScore || 75, brand: knownBrand || "Unknown Brand" }, 45000); 
};

/**
 * INTELLIGENT PRODUCT VISION PIPELINE (UPDATED V3)
 * 1. Vision: Loose identification of text, logos, packaging clues AND Visual Context.
 * 2. Authority Check: Gemini Cross-Reference with Variation Handling.
 */
export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        
        // STEP 1: VISION RECOGNITION (LOOSE & DESCRIPTIVE)
        const visionPrompt = `
        Analyze this skincare product image. 
        
        PHASE 1: VISUAL IDENTIFICATION
        - Look at the LOGO, COLOR SCHEME, BOTTLE SHAPE, and VISIBLE TEXT.
        - Even if text is blurry, infer the Brand (e.g. Blue/White/Cera = CeraVe, Minimalist/White/Dropper = The Ordinary).
        - Describe the visual context (e.g. "White bottle with blue text", "Small dark dropper").
        
        PHASE 2: TEXT EXTRACTION (Best Effort)
        - Extract any readable text fragments for the Product Name.
        - Do not worry about perfection. "Hyalu... B5" is enough context.
        
        PHASE 3: INGREDIENTS
        - Are full ingredients visible? (Back of bottle usually).
        - If yes, extract them into 'detectedIngredients'.
        - If no, leave empty.
        
        OUTPUT JSON:
        { 
            "brand": "string", 
            "name": "string (Guessed Name or Text Fragments)", 
            "visualContext": "string (e.g. Blue pump bottle)",
            "hasReadableIngredients": boolean,
            "detectedIngredients": ["string"] 
        }
        `;

        const visionResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: visionPrompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });

        const visionData = parseJSONFromText(visionResponse.text || "{}");

        if (!visionData.name || visionData.name === "Unknown") {
            throw new Error("Could not identify product. Please try scanning closer.");
        }

        console.log("Vision Output:", visionData);

        // STEP 2: AUTHORITY CHECK & REFINEMENT
        // We now have a "clue" (visionData). We ask Gemini to be the authority and standardize this.
        
        const refinementPrompt = `
        CONTEXT:
        Vision Output: "${visionData.brand} - ${visionData.name}"
        Visual Context: "${visionData.visualContext}"
        Detected Ingredients (OCR): ${JSON.stringify(visionData.detectedIngredients || [])}.
        
        USER METRICS: ${JSON.stringify(userMetrics)}

        TASK:
        1. **IDENTIFICATION & NORMALIZATION (CRITICAL)**: 
           - You are the Product Authority. The vision output might be partial (e.g. "Anua Soothing Toner") or contain typos.
           - Identify the EXACT, CANONICAL product. 
           - **HANDLE VARIATIONS**: Consider regional names, reformulations, and aliases (e.g. "Advanced Night Repair" vs "ANR", "CeraVe Foaming Cleanser" vs "CeraVe Foaming Facial Cleanser").
           - If the name is ambiguous, use the 'Visual Context' (e.g. bottle color) to disambiguate.
           
        2. **INGREDIENT RETRIEVAL**: 
           - IF the OCR ingredients above are comprehensive (>5 items) and look accurate, use them.
           - IF OCR is empty, partial, or looks like noise, RETRIEVE the standard INCI list from your internal database for this exact product.
           - **PRIORITIZE INTERNAL KNOWLEDGE** if the OCR looks messy or incomplete.
        
        3. **ANALYSIS**:
           - Analyze suitability for the user's skin metrics.

        OUTPUT JSON:
        {
            "name": "string (Correct Full Commercial Name)",
            "brand": "string (Correct Brand)",
            "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "FOUNDATION" | "OTHER",
            "ingredients": ["string"],
            "ingredientsSource": "OCR" | "KNOWLEDGE_BASE", 
            "estimatedPrice": Number,
            "suitabilityScore": Number,
            "risks": [{ "ingredient": "Name", "riskLevel": "HIGH", "reason": "Why" }],
            "benefits": [{ "ingredient": "Name", "target": "Target", "description": "Why", "relevance": "HIGH" }]
        }
        `;

        const finalResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: refinementPrompt,
            config: { responseMimeType: 'application/json' }
        });

        const data = parseJSONFromText(finalResponse.text || "{}");
        
        if (!data.name) throw new Error("Analysis failed during refinement.");

        return {
            id: Date.now().toString(),
            name: data.name,
            brand: data.brand || visionData.brand, // Fallback to vision brand if refinement misses it
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now()
        };

    }, getFallbackProduct(userMetrics, "Scanned Product"), 60000); 
};

export const auditProduct = (product: Product, user: UserProfile) => {
    // Basic audit logic
    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    
    let adjustedScore = product.suitabilityScore;
    // Penalty for sensitivity mismatch
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

    // Calculate Grade
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
            grade,
            conflicts,
            riskyProducts,
            missing,
            redundancies,
            upgrades,
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
    // Simple conflict detection (e.g. Retinol vs AHA)
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

    // 1. High Priority (Low Scores) - Immediate Correction
    if (b.acneActive < 70) suggestions.push({ type: 'FACIAL', name: 'Deep Pore Cleanse', benefit: 'Clears active congestion', downtime: 'None' });
    if (b.acneScars < 70) suggestions.push({ type: 'LASER', name: 'Microneedling', benefit: 'Smooths texture & scars', downtime: '1-3 Days' });
    if (b.pigmentation < 70) suggestions.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades dark spots', downtime: '2-4 Days' });
    if (b.wrinkleFine < 70) suggestions.push({ type: 'LASER', name: 'Fractional Laser', benefit: 'Stimulates collagen', downtime: '3-5 Days' });
    if (b.redness < 70) suggestions.push({ type: 'LASER', name: 'IPL Therapy', benefit: 'Reduces redness', downtime: 'None' });
    if (b.hydration < 60) suggestions.push({ type: 'FACIAL', name: 'Hydra-Infusion', benefit: 'Deep moisture boost', downtime: 'None' });
    if (b.poreSize < 65) suggestions.push({ type: 'PEEL', name: 'Carbon Laser Peel', benefit: 'Refines pore size', downtime: 'None' });

    // 2. Optimization (Medium Scores) - Improvement
    if (suggestions.length < 2) {
        if (b.texture < 85) suggestions.push({ type: 'PEEL', name: 'Enzyme Exfoliation', benefit: 'Smooths surface texture', downtime: 'None' });
        if (b.sagging < 85) suggestions.push({ type: 'FACIAL', name: 'Microcurrent', benefit: 'Lifts and tones', downtime: 'None' });
        if (b.darkCircles < 80) suggestions.push({ type: 'FACIAL', name: 'Lymphatic Massage', benefit: 'Reduces puffiness', downtime: 'None' });
    }

    // 3. Maintenance (High Scores or Fillers) - Glow & Health
    if (suggestions.length < 2) {
        suggestions.push({ type: 'FACIAL', name: 'LED Light Therapy', benefit: 'Maintains healthy glow', downtime: 'None' });
        suggestions.push({ type: 'FACIAL', name: 'Oxygen Facial', benefit: 'Event-ready radiance', downtime: 'None' });
    }

    // Deduplicate by name and return max 3
    const unique = suggestions.filter((v,i,a)=>a.findIndex(t=>(t.name===v.name))===i);
    return unique.slice(0, 3);
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
             systemInstruction: `You are a helpful dermatologist. User metrics: ${JSON.stringify(user.biometrics)}. Shelf: ${JSON.stringify(shelf.map(p => p.name))}.`
        }
    });
};

export const isQuotaError = (e: any) => {
    return e?.message?.includes('429') || e?.status === 429;
};

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    let decision = 'CONSIDER';
    let color = 'zinc';
    
    if (audit.adjustedScore > 85 && audit.warnings.length === 0) { 
        decision = 'BUY'; color = 'emerald'; 
    } else if (audit.adjustedScore > 75) {
        decision = 'GREAT FIND'; color = 'teal';
    } else if (audit.adjustedScore < 40 || audit.warnings.some(w => w.severity === 'CRITICAL')) { 
        decision = 'AVOID'; color = 'rose'; 
    } else if (audit.adjustedScore < 60) {
        decision = 'CAUTION'; color = 'amber';
    }
    
    return {
        verdict: { decision, title: decision, description: audit.analysisReason, color },
        audit,
        shelfConflicts: [], // To be populated by analyzeProductContext logic if needed
        comparison: { result: audit.adjustedScore > 70 ? 'BETTER' : 'NEUTRAL' }
    };
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runWithRetry<any>(async (ai) => {
        const prompt = `
        ACT AS AN EXPERT DERMATOLOGIST SPECIALIZING IN THE MALAYSIAN MARKET.
        User Profile: Age ${user.age}, Skin Type ${user.skinType}.
        Metrics (0-100, higher is better): ${JSON.stringify(user.biometrics)}.
        Goals: ${JSON.stringify(user.preferences?.goals || [])}.
        Sensitivity: ${user.preferences?.sensitivity || 'MILD'}.

        CONTEXT:
        The user is located in Malaysia. Recommendations must be accessible via Watsons, Guardian, Sephora Malaysia, or Official Shopee Mall stores.

        TASK:
        Generate a comprehensive AM and PM skincare routine.
        For EACH step (Cleanser, Serum, Moisturizer, SPF), provide exactly 3 specific real-world product recommendations corresponding to price tiers:

        1. **BUDGET (Approx RM 20 - RM 60)**: High-value drugstore favorites.
           - *Focus*: Aiken, Safi, Hada Labo, Simple, The Ordinary, Inkey List, Cetaphil.
        
        2. **VALUE (Approx RM 60 - RM 180)**: Trending "Cult Favorites" (Asian Beauty) & Derm brands.
           - *Focus*: Skintific, Axis-Y, COSRX, Beauty of Joseon, La Roche-Posay, Paula's Choice, Eucerin, Torriden.
        
        3. **LUXURY (RM 180+)**: Premium & Sephora MY bestsellers.
           - *Focus*: Tatcha, SK-II, Estee Lauder, Kiehl's, Drunk Elephant, Dermalogica, Sunday Riley.

        IMPORTANT RULES:
        - **LOCAL HYPE**: Include trending viral products in Malaysia (e.g., Skintific 5X Ceramide, Axis-Y Dark Spot Serum, COSRX Snail Mucin) if they suit the skin type.
        - **CLIMATE FIT**: Account for Malaysia's hot, humid weather (e.g. prefer lightweight gels/water-creams over heavy butters unless skin is very dry).
        - **SAFETY**: Products MUST be safe for the user's specific metrics.
        - **PRICING**: Estimate prices in MALAYSIAN RINGGIT (RM).
        - **WHY**: Provide a short "Why?" explaining the fit.

        OUTPUT FORMAT (Strict JSON):
        {
          "am": [
            {
              "step": "Cleanser",
              "products": [
                { "name": "...", "brand": "...", "tier": "BUDGET", "price": "RM XX", "reason": "...", "rating": 95 },
                { "name": "...", "brand": "...", "tier": "VALUE", "price": "RM XX", "reason": "...", "rating": 98 },
                { "name": "...", "brand": "...", "tier": "LUXURY", "price": "RM XX", "reason": "...", "rating": 97 }
              ]
            },
            ... other steps (Serum, Moisturizer, SPF)
          ],
          "pm": [
            {
               "step": "Cleanser", ...
            },
            {
               "step": "Treatment", ... (Include Eye or Spot treatment if needed)
            },
            ... other steps (Serum, Moisturizer - No SPF)
          ]
        }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });

        return parseJSONFromText(response.text || "{}");
    }, null, 60000);
}
