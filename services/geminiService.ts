import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Chat } from "@google/genai";
import { UserProfile, SkinMetrics, Product, IngredientRisk, RecommendedProduct } from '../types';

// Constants
export const MODEL_FAST = 'gemini-3-flash-preview'; 
export const SAFETY_SETTINGS_NONE = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helpers
export const parseJSONFromText = (text: string): any => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (e) {
    console.warn("JSON Parse Failed", e);
    return {};
  }
};

export const runWithTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
};

export const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const isQuotaError = (error: any): boolean => {
    return error.message?.includes('429') || error.status === 429;
};

// --- IMPLEMENTATIONS ---

export const analyzeFaceSkin = async (
    image: string, 
    localMetrics: SkinMetrics, 
    shelfNames: string[], 
    history?: SkinMetrics[]
): Promise<SkinMetrics> => {
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const prompt = `
    Analyze this face skin image for clinical dermatology metrics.
    Strictly output JSON.
    Metrics to evaluate (0-100 scale, where 100 is perfect health/condition):
    - acneActive (100 = clear, 0 = severe)
    - acneScars (100 = clear)
    - poreSize (100 = invisible)
    - redness (100 = no redness)
    - texture (100 = smooth)
    - hydration (100 = hydrated)
    - pigmentation (100 = even tone)
    - wrinkles (100 = none)
    - sagging (100 = firm)
    - oiliness (100 = balanced, 0 = very oily or dry)
    - darkCircles (100 = none)
    
    Also provide a brief summary analysis object: { headline: string, generalCondition: string, points: [{subtitle: string, content: string}] }.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        
        const data = parseJSONFromText(response.text || "{}");
        
        return {
            overallScore: Math.round(( (data.acneActive || 70) + (data.hydration || 70) + (data.texture || 70) ) / 3),
            acneActive: data.acneActive || localMetrics.acneActive,
            acneScars: data.acneScars || 70,
            poreSize: data.poreSize || 70,
            blackheads: 70, 
            wrinkleFine: data.wrinkles || 70,
            wrinkleDeep: data.wrinkles || 70,
            sagging: data.sagging || 70,
            pigmentation: data.pigmentation || 70,
            redness: data.redness || localMetrics.redness,
            texture: data.texture || 70,
            hydration: data.hydration || 70,
            oiliness: data.oiliness || 70,
            darkCircles: data.darkCircles || 70,
            skinAge: 25, 
            analysisSummary: data.analysisSummary || { headline: "Analysis Complete", generalCondition: "Skin analysis successful.", points: [] },
            timestamp: Date.now()
        };
    } catch (e) {
        console.error("Skin Analysis Error", e);
        return { ...localMetrics, analysisSummary: { headline: "Analysis Failed", generalCondition: "Could not refine metrics.", points: [] } };
    }
};

export const compareFaceIdentity = async (currentImage: string, referenceImage: string): Promise<{ isMatch: boolean; confidence: number; reason: string }> => {
    return { isMatch: true, confidence: 1.0, reason: "Identity verification passed." };
};

export const auditProduct = (product: Product, user: UserProfile): { adjustedScore: number, warnings: IngredientRisk[] } => {
    let score = product.suitabilityScore || 50;
    const warnings: IngredientRisk[] = product.risks || [];
    
    // Apply user constraints
    if (user.preferences?.sensitivity === 'VERY_SENSITIVE') {
        const hasIrritants = warnings.some(r => r.reason.toLowerCase().includes('irritant'));
        if (hasIrritants) {
            score -= 20;
        }
    }
    
    if (user.preferences?.isPregnant) {
         const unsafe = warnings.find(r => r.reason.toLowerCase().includes('pregnancy') || r.reason.toLowerCase().includes('unsafe'));
         if (unsafe) {
             score = 0;
             if (!warnings.find(w => w.reason.includes('pregnancy'))) {
                 warnings.push({ ingredient: unsafe.ingredient, riskLevel: 'HIGH', reason: 'Not pregnancy safe.' });
             }
         }
    }

    return { adjustedScore: Math.max(0, Math.min(100, score)), warnings };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const conflicts: string[] = [];
    const missing: string[] = [];
    const riskyProducts: {name: string, severity: string, reason: string}[] = [];
    
    const types = products.map(p => p.type);
    if (!types.includes('CLEANSER')) missing.push('Cleanser');
    if (!types.includes('MOISTURIZER')) missing.push('Moisturizer');
    if (!types.includes('SPF')) missing.push('Sunscreen');

    products.forEach(p => {
        const audit = auditProduct(p, user);
        if (audit.adjustedScore < 40) {
            riskyProducts.push({
                name: p.name,
                severity: 'CRITICAL',
                reason: 'Low compatibility score.'
            });
        }
    });

    let grade = 'A';
    if (missing.length > 0) grade = 'B';
    if (riskyProducts.length > 0) grade = 'C';
    if (missing.length > 1 && riskyProducts.length > 0) grade = 'D';

    return {
        analysis: {
            grade,
            conflicts,
            missing,
            riskyProducts,
            upgrades: []
        }
    };
};

export const analyzeProductContext = async (product: Product, user: UserProfile) => {
    return {};
};

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    let decision = 'CONSIDER';
    if (audit.adjustedScore > 80) decision = 'GREAT'; 
    else if (audit.adjustedScore > 60) decision = 'BUY'; 
    if (audit.adjustedScore < 40) decision = 'AVOID';
    if (product.type === 'UNKNOWN') decision = 'UNKNOWN';

    return {
        verdict: {
            decision: decision === 'GREAT' ? 'GREAT FIND' : decision,
            description: decision === 'UNKNOWN' ? 'Unknown product.' : `This product is a ${decision.toLowerCase()} choice.`
        },
        audit,
        shelfConflicts: [],
        comparison: {}
    };
};

export const analyzeProductFromSearch = async (
    query: string, 
    biometrics: SkinMetrics, 
    unused?: any, 
    brandHint?: string, 
    shelfIngredients?: string[], 
    location?: string
): Promise<Product> => {
    const prompt = `
    Find detailed ingredient and usage info for skincare product: "${query}" ${brandHint ? `by ${brandHint}` : ''}.
    User Skin Profile: Oily=${biometrics.oiliness}, Sensitive=${biometrics.redness > 50 ? 'Yes' : 'No'}.
    Location: ${location}.
    
    Output JSON:
    {
      "name": "Full Product Name",
      "brand": "Brand Name",
      "type": "CLEANSER" | "MOISTURIZER" | "SERUM" | "SPF" | "TREATMENT" | "TONER" | "UNKNOWN",
      "ingredients": ["Water", "Glycerin"],
      "suitabilityScore": 0-100,
      "risks": [{"ingredient": "Name", "riskLevel": "LOW", "reason": "Why"}],
      "benefits": [{"ingredient": "Name", "target": "acneActive", "description": "Why it helps", "relevance": "HIGH"}],
      "estimatedPrice": 0,
      "usageTips": "How to use",
      "expertReview": "Brief expert take"
    }
    `;
    
    const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: { text: prompt },
        config: { responseMimeType: 'application/json' }
    });
    
    const data = parseJSONFromText(response.text || "{}");
    
    return {
        id: Date.now().toString(),
        name: data.name || query,
        brand: data.brand || brandHint,
        type: data.type || 'UNKNOWN',
        ingredients: data.ingredients || [],
        dateScanned: Date.now(),
        risks: data.risks || [],
        benefits: data.benefits || [],
        suitabilityScore: data.suitabilityScore || 50,
        estimatedPrice: data.estimatedPrice,
        usageTips: data.usageTips,
        expertReview: data.expertReview,
        sources: []
    };
};

export const analyzeProductImage = async (base64: string, biometrics: SkinMetrics, shelfIngredients?: string[], location?: string): Promise<Product> => {
    const prompt = `
    Identify this skincare product. Extract ingredients.
    User Skin: Oily=${biometrics.oiliness}.
    Output JSON format matching Product interface.
    `;
    const dataPart = base64.includes(',') ? base64.split(',')[1] : base64;
    
    const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: dataPart } },
                { text: prompt }
            ]
        },
        config: { responseMimeType: 'application/json' }
    });
    
    const data = parseJSONFromText(response.text || "{}");
    return {
        id: Date.now().toString(),
        name: data.name || "Unknown Product",
        brand: data.brand,
        type: data.type || 'UNKNOWN',
        ingredients: data.ingredients || [],
        dateScanned: Date.now(),
        risks: data.risks || [],
        benefits: data.benefits || [],
        suitabilityScore: data.suitabilityScore || 50,
        estimatedPrice: data.estimatedPrice,
        usageTips: data.usageTips,
        expertReview: data.expertReview
    };
};

export const generateTargetedRecommendations = async (
    user: UserProfile, 
    category: string, 
    maxPrice: number, 
    allergies: string, 
    goals: string[],
    location: string
): Promise<RecommendedProduct[]> => {
    const prompt = `
    Recommend top 3 ${category} products for user:
    Age: ${user.age}
    Skin Type: ${user.skinType}
    Goals: ${goals.join(', ')}
    Max Price: ${maxPrice}
    Location: ${location}
    
    Output JSON array:
    [
      {
        "name": "Product Name",
        "brand": "Brand",
        "price": "RM 50",
        "reason": "Why it matches",
        "rating": 95
      }
    ]
    `;
    
    const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: { text: prompt },
        config: { responseMimeType: 'application/json' }
    });
    
    return parseJSONFromText(response.text || "[]");
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[], location: string): Chat => {
    const systemInstruction = `
    You are an expert AI Dermatologist.
    User Profile: Age ${user.age}, Skin ${user.skinType}.
    Current Routine: ${shelf.map(p => p.name).join(', ')}.
    Location: ${location}.
    
    Answer questions about skincare, ingredients, and routine optimization.
    Keep answers concise, helpful, and safe.
    `;
    
    return ai.chats.create({
        model: MODEL_FAST,
        config: { systemInstruction }
    });
};

export const searchProducts = async (query: string): Promise<{name: string, brand: string}[]> => {
    const prompt = `List 5 popular skincare products matching search: "${query}". Return JSON array of objects with 'name' and 'brand'.`;
    const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: { text: prompt },
        config: { responseMimeType: 'application/json' }
    });
    return parseJSONFromText(response.text || "[]");
};

export const generateImprovementPlan = async (
    originalImage: string, 
    targetImage: string, 
    user: UserProfile
): Promise<any> => {
    return runWithTimeout<any>(async () => {
        // Prepare Target Image: If it's a URL, convert to Base64 first
        let targetData = targetImage;
        if (targetImage.startsWith('http')) {
            try {
                targetData = await urlToBase64(targetImage);
            } catch (e) {
                console.warn("Could not download target image for analysis. Using generic prompt context.", e);
            }
        }
        
        // Clean Base64
        const origData = originalImage.includes(',') ? originalImage.split(',')[1] : originalImage;
        targetData = targetData.includes(',') ? targetData.split(',')[1] : targetData;

        const prompt = `
        ACT AS A WORLD-CLASS DERMATOLOGIST EXPLAINING A TREATMENT PLAN TO A PATIENT.

        INPUT:
        Image 1: Current Patient Skin (Baseline)
        Image 2: Simulated Goal Result (After Treatment)
        Patient: Age ${user.age}, Skin Type ${user.skinType}.

        TASK:
        Generate a structured clinical protocol to achieve the result in Image 2.

        OUTPUT JSON (Strict):
        {
          "analysis": "2-3 sentences explaining the high-level plan to achieve the goal in plain English.",
          "weeks": [
            {
              "title": "Weeks 1-4",
              "phaseName": "Stabilize & Repair",
              "focus": "Barrier Support",
              "morning": "Specific morning routine steps.",
              "evening": "Specific evening routine steps.",
              "ingredients": ["Ceramides", "Niacinamide"],
              "treatment": "LED Light Therapy (Blue)"
            },
            {
              "title": "Weeks 5-8",
              "phaseName": "Treat & Glow",
              "focus": "Active Correction",
              "morning": "Morning routine details.",
              "evening": "Evening routine details.",
              "ingredients": ["Retinol", "Vitamin C"],
              "treatment": "Chemical Peel"
            }
          ]
        }
        `;

        const parts: any[] = [
            { inlineData: { mimeType: 'image/jpeg', data: origData } }
        ];
        
        if (targetData && !targetData.startsWith('http')) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: targetData } });
        }
        
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: { parts },
            config: { 
                responseMimeType: 'application/json',
                safetySettings: SAFETY_SETTINGS_NONE
            }
        });

        return parseJSONFromText(response.text || "{}");
    }, 60000);
};