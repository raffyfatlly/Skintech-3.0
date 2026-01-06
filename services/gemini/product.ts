import { Product, SkinMetrics } from '../../types';
import { runWithTimeout, runWithRetry, parseJSONFromText, extractSources, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

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
                contents: prompt + "\n\nUse your internal database to estimate ingredients and details.",
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
    userMetrics: SkinMetrics, 
    routineActives: string[] = [],
    location: string = "Global"
): Promise<Product> => {
    return runWithTimeout<Product>(async (ai) => {
        const visionPrompt = `Identify the skincare product in this image. Return JSON: { "brand": "Brand Name", "name": "Product Name" }. If unclear, return { "name": "Unknown" }`;
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
        return analyzeProductFromSearch(detectedName, userMetrics, null, detectedBrand, routineActives, location);
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
