
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
        
        const safetyConstraints = [];
        if (prefs.isPregnant) safetyConstraints.push("PREGNANCY SAFE (No Retinoids/Salicylic/Hydroquinone)");
        if (prefs.hasEczema) safetyConstraints.push("ECZEMA FRIENDLY (No Fragrance/Alcohol)");
        if (prefs.onMedication) safetyConstraints.push("MEDICATION SAFE (Gentle/No harsh actives)");
        if (prefs.sensitivity === 'VERY_SENSITIVE') safetyConstraints.push("SENSITIVE SKIN (Hypoallergenic)");

        const prompt = `
        TASK: Recommend 3 ${category} products available in ${location} or Globally.
        USER GOALS: ${goals.join(', ')}.
        BUDGET: ${maxPrice} (Approximate in local currency).
        SKIN TYPE: ${user.skinType}
        
        CURRENT SKIN HEALTH (Scale 0-100, 100 is Best/Healthy):
        - Acne Score: ${m.acneActive} (Low score implies ACTIVE ACNE needs treatment)
        - Sensitivity Score: ${m.redness} (Low score implies HIGH SENSITIVITY/REDNESS)
        - Hydration Score: ${m.hydration} (Low score implies DEHYDRATION)
        
        CRITICAL SAFETY CONSTRAINTS: ${safetyConstraints.join(', ') || 'None'}.
        Output strict JSON: [{ "name": "string", "brand": "string", "price": "string", "reason": "string", "rating": number }]
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
