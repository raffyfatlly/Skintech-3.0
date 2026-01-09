
import { Product, SkinMetrics, UserProfile, UserPreferences } from '../../types';
import { runWithTimeout, runWithRetry, parseJSONFromText, extractSources, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

export const analyzeProductFromSearch = async (
    productName: string, 
    userProfile: UserProfile, 
    _unused?: any, 
    knownBrand?: string, 
    routineActives: string[] = [],
    location: string = "Global"
): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        const userMetrics = userProfile.biometrics;
        const prefs = userProfile.preferences || {} as Partial<UserPreferences>;
        
        // Build Safety String
        const safetyFlags = [];
        if (prefs.isPregnant) safetyFlags.push("USER IS PREGNANT (Flag Retinoids/BHA/Hydroquinone as CRITICAL RISK)");
        if (prefs.hasEczema) safetyFlags.push("USER HAS ECZEMA (Flag Fragrance/Alcohol/Harsh Acids)");
        if (prefs.onMedication) safetyFlags.push("USER ON MEDICATION (Skin is extra sensitive)");
        if (prefs.sensitivity === 'VERY_SENSITIVE') safetyFlags.push("VERY SENSITIVE SKIN");

        const prompt = `
        ACT AS AN EXPERT COSMETIC CHEMIST.
        PRODUCT: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        USER LOCATION: ${location}.
        
        USER BIO-METRICS (Scale 0-100):
        NOTE: 100 = Perfect/Healthy, 0 = Severe Issue.
        - Acne Score: ${userMetrics.acneActive} (Lower score = More/Severe Acne)
        - Redness Score: ${userMetrics.redness} (Lower score = More Sensitive/Red)
        - Hydration Score: ${userMetrics.hydration} (Lower score = Dehydrated/Dry)
        - Oiliness Score: ${userMetrics.oiliness} (Lower score = Very Oily, High score = Balanced)
        
        SAFETY ALERTS: ${safetyFlags.join(', ') || 'None specific'}.
        
        ROUTINE ACTIVES ALREADY USED: [${routineActives.join(', ')}].

        TASK: 
        1. Find ingredients and price.
        2. Analyze against user profile.
        3. IF MAKEUP (Foundation, Concealer, Primer, Blush):
           - Check for "Finish" (Matte vs Dewy). If user is Dry (Hydration < 50) and product is Matte, flag as Risk.
           - Check for "Pore Clogging" ingredients (Ethylhexyl Palmitate, Algae Extract, etc) if Acne Score < 60.
           - Check for "Flashback" ingredients (Silica/Zinc Oxide) if relevant.
        4. Output strict JSON.

        OUTPUT JSON SCHEMA:
        \`\`\`json
        {
          "name": "string",
          "brand": "string",
          "type": "CLEANSER" | "TONER" | "SERUM" | "MOISTURIZER" | "SPF" | "TREATMENT" | "FOUNDATION" | "CONCEALER" | "PRIMER" | "SETTING_SPRAY" | "POWDER" | "UNKNOWN",
          "ingredients": ["string"],
          "estimatedPrice": number,
          "suitabilityScore": number,
          "risks": [{ "ingredient": "string", "riskLevel": "LOW"|"MEDIUM"|"HIGH", "reason": "string" }],
          "benefits": [{ "ingredient": "string", "target": "acneActive"|"hydration" etc, "description": "string", "relevance": "HIGH"|"MAINTENANCE" }],
          "usageTips": "string (Smart Usage guide. For makeup: Mention finish, skin prep needed (e.g. 'Use hydrating primer first'), and removal method (e.g. 'Double cleanse required').)",
          "expertReview": "string"
        }
        \`\`\`
        `;

        let response;
        let sources: string[] = [];

        try {
            response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] }
            });
            sources = extractSources(response);
        } catch (e) {
            console.warn("Product Search Tool failed, falling back to internal knowledge", e);
            response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt + "\n\nUse your internal knowledge to estimate ingredients and details.",
                config: { responseMimeType: 'application/json' }
            });
        }

        const data = parseJSONFromText(response.text || "{}");

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
            else if (lowerName.includes('foundation') || lowerName.includes('tint')) detectedType = 'FOUNDATION';
            else if (lowerName.includes('conceal')) detectedType = 'CONCEALER';
            else if (lowerName.includes('prime')) detectedType = 'PRIMER';
        }

        const hasIngredients = Array.isArray(data.ingredients) && data.ingredients.length > 0;

        return {
            id: Date.now().toString(),
            name: finalName,
            brand: finalBrand,
            type: detectedType,
            ingredients: hasIngredients ? data.ingredients : [],
            estimatedPrice: typeof data.estimatedPrice === 'number' ? data.estimatedPrice : 0,
            suitabilityScore: (typeof data.suitabilityScore === 'number' && hasIngredients) ? data.suitabilityScore : 50,
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
    userProfile: UserProfile, 
    routineActives: string[] = [],
    location: string = "Global"
): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        const visionPrompt = `Identify the skincare or makeup product in this image. Return JSON: { "brand": "Brand Name", "name": "Product Name" }. If unclear, return { "name": "Unknown" }`;
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;

        const visionResp = await ai.models.generateContent({
            model: MODEL_FAST, // Use Flash Preview for better vision reasoning
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: visionPrompt }
                ]
            },
            config: { 
                responseMimeType: 'application/json',
                safetySettings: SAFETY_SETTINGS_NONE 
            }
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

        // Pass details to search function to get ingredients
        return analyzeProductFromSearch(detectedName, userProfile, null, detectedBrand, routineActives, location);
    }, 60000);
};

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry(async (ai) => {
        const prompt = `
        Search for commercial skincare or makeup products matching: "${query}".
        
        STRICT RULES:
        1. If the user specifies a BRAND (e.g. "Neutrogena"), ONLY return products from that brand.
        2. If the user specifies a CATEGORY (e.g. "Cleanser"), ONLY return products of that type.
        3. If specific (e.g. "Neutrogena Hydro Boost"), return that exact item plus relevant variations.
        4. Return 5 distinct items if possible.
        
        Return strict JSON array: [{"brand": "Brand Name", "name": "Full Product Name"}]
        `;
        
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
