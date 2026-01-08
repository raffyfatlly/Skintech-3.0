
import { UserProfile, UserPreferences } from '../../types';
import { runWithRetry, runWithTimeout, parseJSONFromText, getAi, MODEL_FAST } from './core';

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
        
        // --- 1. CONSTRUCT AUDIT LOGIC (MATCHING SCANNER) ---
        const safetyConstraints: string[] = [];
        const avoidList: string[] = [];

        // Pregnancy (Highest Priority)
        if (prefs.isPregnant) {
            safetyConstraints.push("PREGNANCY SAFE: STRICTLY NO Retinoids, Salicylic Acid (>2%), Hydroquinone.");
            avoidList.push("Retinol", "Tretinoin", "Adapalene", "Salicylic Acid");
        }

        // Sensitivity / Redness Rule (from audit.ts)
        // If Redness < 60 or Sensitive Type, avoid irritants.
        if (m.redness < 60 || prefs.sensitivity === 'VERY_SENSITIVE' || prefs.hasEczema) {
            safetyConstraints.push("SENSITIVE SKIN SAFE: NO Fragrance, Alcohol Denat, Essential Oils, Menthol.");
            avoidList.push("Fragrance", "Parfum", "Alcohol Denat", "Peppermint", "Eucalyptus");
        }

        // Dryness / Barrier Rule
        if (m.hydration < 50 || prefs.hasEczema) {
            safetyConstraints.push("BARRIER SUPPORT: NO drying sulfates or high-proof alcohols.");
            avoidList.push("Sodium Lauryl Sulfate", "SD Alcohol");
        }

        // Acne / Pore Clogging Rule
        // If Acne < 60 or Oiliness < 50 (Oily) or Pores < 50 (Large)
        if (m.acneActive < 60 || m.oiliness < 50 || m.pores < 50) {
            safetyConstraints.push("NON-COMEDOGENIC: NO pore-clogging oils or butters.");
            avoidList.push("Coconut Oil", "Cocoa Butter", "Isopropyl Myristate", "Palm Oil", "Wheat Germ Oil");
        }

        // Allergies
        if (allergies) {
            safetyConstraints.push(`USER ALLERGIES: Avoid ${allergies}`);
        }

        const prompt = `
        ACT AS AN EXPERT DERMATOLOGIST.
        
        TASK: Recommend 3 ${category} products available in ${location} or Globally.
        
        CRITICAL GOAL: Find "Perfect Match" products (Suitability Score > 90/100) for this specific user.
        
        USER BIOMETRICS (Scale 0-100, 100=Perfect/Healthy):
        - Acne Score: ${m.acneActive} ${m.acneActive < 60 ? '(PRONE TO BREAKOUTS)' : ''}
        - Redness Score: ${m.redness} ${m.redness < 60 ? '(HIGH SENSITIVITY)' : ''}
        - Hydration Score: ${m.hydration} ${m.hydration < 60 ? '(DEHYDRATED)' : ''}
        
        USER PREFERENCES:
        - Skin Type: ${user.skinType}
        - Goals: ${goals.join(', ')}
        - Budget: ~${maxPrice} (Local Currency or USD)
        
        STRICT EXCLUSION RULES (The "Scanner Audit"):
        ${safetyConstraints.map(s => `- ${s}`).join('\n')}
        ${avoidList.length > 0 ? `- MUST NOT CONTAIN: ${avoidList.join(', ')}` : ''}
        
        INSTRUCTIONS:
        1. Select products with CLEAN, EFFECTIVE ingredients matching the user's goals.
        2. VERIFY ingredients against the "Must Not Contain" list above. Discard any fails.
        3. Provide a 'rating' score between 90 and 99 representing the match confidence.
        
        OUTPUT JSON:
        [{ 
            "name": "Full Product Name", 
            "brand": "Brand", 
            "price": "Price String (e.g. RM 50)", 
            "reason": "One sentence explaining why it fits their biometrics & goals.", 
            "rating": 95 
        }]
        `;
        
        try {
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { tools: [{ googleSearch: {} }] }
            });
            return parseJSONFromText(response.text || "[]");
        } catch (e) {
            console.warn("Routine Recommendation Tool failed, using fallback", e);
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt + "\nUse your internal knowledge of global products.",
                config: { responseMimeType: 'application/json' }
            });
            return parseJSONFromText(response.text || "[]");
        }
    }, 240000);
};
