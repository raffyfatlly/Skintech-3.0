
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

const runWithRetry = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, fallback: T, timeoutMs: number = 45000): Promise<T> => {
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
        1. **Brand Detection**: Analyze if the query contains a specific brand name.
        2. **STRICT FILTERING**:
           - Return ONLY products from the requested brand if specified.
           - Prioritize products available in MALAYSIA (Watsons, Guardian, Sephora MY).
        
        OUTPUT FORMAT:
        Strict JSON Array of objects.
        [
          {"brand": "Neutrogena", "name": "Neutrogena Deep Clean Acne Foaming Cleanser"},
          ...
        ]
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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
        Current computer-vision estimates (reference): ${JSON.stringify(localMetrics)}.
        
        TASK:
        1. Ignore provided metrics if they contradict visible skin condition.
        2. Calibrate scoring (0-100, Higher = Better/Clearer).
        
        Return JSON fields: overallScore, acneActive, acneScars, poreSize, blackheads, wrinkleFine, wrinkleDeep, sagging, pigmentation, redness, texture, hydration, oiliness, darkCircles, skinAge, analysisSummary (string), observations (map of metric key to string).`;
        
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
        CONTEXT: User is in MALAYSIA.
        Product: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        
        User Skin Profile:
        - Type: ${userMetrics.oiliness < 40 ? "Dry" : userMetrics.oiliness > 70 ? "Oily" : "Combination"}
        - Concerns: Acne (${userMetrics.acneActive < 70 ? "Active" : "Clear"}), Sensitivity (${userMetrics.redness < 60 ? "High" : "Normal"}), Hydration (${userMetrics.hydration})
        
        ACTIONS:
        1. USE GOOGLE SEARCH to find:
           - The OFFICIAL full ingredient list (INCI) from sources like INCIDecoder, CosDNA, or Brand Site.
           - The CURRENT PRICE in MALAYSIA (RM/MYR) from Watsons MY, Guardian MY, Sephora MY, or Official Shopee Mall.
           - User reviews regarding sensitivity and acne triggers.
        
        2. ANALYZE:
           - Cross-reference ingredients with the user's metrics.
           - Identify SPECIFIC pros (benefits) and cons (risks/warnings).
           - Score the product from 0-100 based on this specific user match.

        OUTPUT FORMAT:
        Return ONLY a raw JSON object.
        {
            "name": "Official Product Name",
            "brand": "Brand Name",
            "type": "Category (CLEANSER, SERUM, etc)",
            "ingredients": ["Water", "Glycerin", ...],
            "estimatedPrice": 45.90, // Number in RM
            "suitabilityScore": 85, // 0-100
            "risks": [
                { "ingredient": "Alcohol Denat", "riskLevel": "HIGH", "reason": "Drying for your skin type" }
            ],
            "benefits": [
                { "ingredient": "Centella", "target": "redness", "description": "Calms active inflammation", "relevance": "HIGH" }
            ]
        }
        `;

        // Use gemini-2.5-flash for Search Grounding
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                 tools: [{ googleSearch: {} }] // Enable Google Search
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        const sources = extractSources(response);

        if (!data || !data.name) throw new Error("Analysis failed");

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
            sources: sources
        };
    }, { ...getFallbackProduct(userMetrics, productName), suitabilityScore: consistencyScore || 75, brand: knownBrand || "Unknown Brand" }, 60000); 
};

export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        
        // STEP 1: VISION RECOGNITION (LOOSE & DESCRIPTIVE)
        const visionPrompt = `
        Analyze this skincare product image. 
        Identify the BRAND and PRODUCT NAME clearly.
        If ingredients are visible, list them.
        
        OUTPUT JSON:
        { 
            "brand": "string", 
            "name": "string", 
            "detectedIngredients": ["string"] 
        }
        `;

        const visionResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', // High visual accuracy
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

        // STEP 2: SEARCH & REFINEMENT
        const refinementPrompt = `
        PRODUCT: "${visionData.brand} ${visionData.name}"
        CONTEXT: User in MALAYSIA.
        
        USER METRICS: ${JSON.stringify(userMetrics)}

        TASK:
        1. SEARCH GOOGLE to confirm the exact product name and find its INCI ingredients list.
        2. FIND CURRENT PRICE in MALAYSIA (RM).
        3. ANALYZE suitability for the user.

        OUTPUT JSON:
        {
            "name": "Full Name",
            "brand": "Brand",
            "type": "CLEANSER | SERUM | ...",
            "ingredients": ["..."],
            "estimatedPrice": 0, // RM
            "suitabilityScore": 0,
            "risks": [{ "ingredient": "...", "riskLevel": "HIGH", "reason": "..." }],
            "benefits": [{ "ingredient": "...", "target": "...", "description": "...", "relevance": "HIGH" }]
        }
        `;

        // Use 2.5-flash with Google Search for grounding
        const finalResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: refinementPrompt,
            config: { 
                tools: [{ googleSearch: {} }] 
            }
        });

        const data = parseJSONFromText(finalResponse.text || "{}");
        const sources = extractSources(finalResponse);
        
        if (!data.name) throw new Error("Analysis failed during refinement.");

        return {
            id: Date.now().toString(),
            name: data.name,
            brand: data.brand || visionData.brand, 
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now(),
            sources: sources
        };

    }, getFallbackProduct(userMetrics, "Scanned Product"), 60000); 
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

    if (b.acneActive < 70) suggestions.push({ type: 'FACIAL', name: 'Deep Pore Cleanse', benefit: 'Clears active congestion', downtime: 'None' });
    if (b.acneScars < 70) suggestions.push({ type: 'LASER', name: 'Microneedling', benefit: 'Smooths texture & scars', downtime: '1-3 Days' });
    if (b.pigmentation < 70) suggestions.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades dark spots', downtime: '2-4 Days' });
    if (b.wrinkleFine < 70) suggestions.push({ type: 'LASER', name: 'Fractional Laser', benefit: 'Stimulates collagen', downtime: '3-5 Days' });
    if (b.redness < 70) suggestions.push({ type: 'LASER', name: 'IPL Therapy', benefit: 'Reduces redness', downtime: 'None' });
    if (b.hydration < 60) suggestions.push({ type: 'FACIAL', name: 'Hydra-Infusion', benefit: 'Deep moisture boost', downtime: 'None' });
    if (b.poreSize < 65) suggestions.push({ type: 'PEEL', name: 'Carbon Laser Peel', benefit: 'Refines pore size', downtime: 'None' });

    if (suggestions.length < 2) {
        if (b.texture < 85) suggestions.push({ type: 'PEEL', name: 'Enzyme Exfoliation', benefit: 'Smooths surface texture', downtime: 'None' });
        if (b.sagging < 85) suggestions.push({ type: 'FACIAL', name: 'Microcurrent', benefit: 'Lifts and tones', downtime: 'None' });
        if (b.darkCircles < 80) suggestions.push({ type: 'FACIAL', name: 'Lymphatic Massage', benefit: 'Reduces puffiness', downtime: 'None' });
    }

    if (suggestions.length < 2) {
        suggestions.push({ type: 'FACIAL', name: 'LED Light Therapy', benefit: 'Maintains healthy glow', downtime: 'None' });
        suggestions.push({ type: 'FACIAL', name: 'Oxygen Facial', benefit: 'Event-ready radiance', downtime: 'None' });
    }

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
        shelfConflicts: [],
        comparison: { result: audit.adjustedScore > 70 ? 'BETTER' : 'NEUTRAL' }
    };
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runWithRetry<any>(async (ai) => {
        const prompt = `
        ACT AS AN EXPERT DERMATOLOGIST SPECIALIZING IN THE MALAYSIAN MARKET.
        User Profile: Age ${user.age}, Skin Type ${user.skinType}.
        Metrics: ${JSON.stringify(user.biometrics)}.
        Goals: ${JSON.stringify(user.preferences?.goals || [])}.

        TASK:
        Generate a comprehensive AM and PM skincare routine.
        For EACH step, provide 3 specific recommendations available in MALAYSIA (Watsons, Guardian, Sephora MY).
        Include Price in RM (Ringgit Malaysia).

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
            }
          ],
          "pm": [ ... ]
        }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }] 
            }
        });

        return parseJSONFromText(response.text || "{}");
    }, null, 60000);
}
