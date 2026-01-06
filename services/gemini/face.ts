
import { SkinMetrics } from '../../types';
import { runWithTimeout, runWithRetry, parseJSONFromText, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithTimeout<SkinMetrics>(async (ai) => {
        const prompt = `
        ACT AS A DERMATOLOGICAL GRADING AI. 
        Analyze the face image using the 12 BIOMARKERS defined below.
        
        INPUT CV METRICS (Reference): ${JSON.stringify(localMetrics)}. 
        
        --- SCORING RUBRIC (0-100) ---
        100 = Perfect/Clear/Healthy.
        0 = Severe/Damaged/Unhealthy.

        1. THE "BREAKOUT" GROUP
        - acneActive: Live pimples, cysts, bacterial inflammation.
        - blackheads: Oxidized clogged pores (nose/chin).
        - acneMarks: Post-Acne Marks (PIH brown spots, PIE red spots). NOTE: Do not confuse with active acne.

        2. THE "TONE" GROUP
        - darkSpots: Sun damage, melasma, age spots (distinct from acne marks).
        - redness: Sensitivity, broken capillaries, general inflammation.
        - darkCircles: Pigment or shadows under eyes.

        3. THE "SURFACE" GROUP
        - pores: Visible size/openness.
        - texture: Bumpiness, roughness, closed comedones.
        - oiliness: Shine intensity (T-zone).
        - hydration: Water content (Score 100 = Plump, Score 0 = Dehydrated/Flaking).

        4. THE "AGING" GROUP
        - wrinkles: Static lines (forehead, crows feet, nasolabial).
        - firmness: Jawline definition, sagging, elasticity.

        --- LOGIC TREE DIAGNOSIS (HOLISTIC) ---
        Use this logic to generate the 'headline' and 'generalCondition':
        
        RULE 1: BARRIER FIRST. 
        IF (Redness < 50 OR Hydration < 50):
           Diagnosis: "Compromised Barrier".
           Advice: Stop actives. Focus on repair.
        
        RULE 2: ACNE TYPES.
        IF (AcneActive < 60):
           IF (Oiliness < 50): Diagnosis = "Congestion Oily". Focus: BHA/Clay.
           IF (Oiliness > 80): Diagnosis = "Dry/Irritated Breakouts". Focus: Hydration + Gentle Spot Treat.
        
        RULE 3: AGING vs DEHYDRATION.
        IF (Wrinkles < 60):
           IF (Hydration < 60): Diagnosis = "Dehydration Lines". Focus: Hyaluronic Acid (reversible).
           IF (Hydration > 80): Diagnosis = "Static Wrinkles". Focus: Retinoids/Peptides.

        OUTPUT JSON (Strict):
        {
          "overallScore": number,
          "acneActive": number,
          "blackheads": number,
          "acneMarks": number,
          "darkSpots": number,
          "redness": number,
          "darkCircles": number,
          "pores": number,
          "texture": number,
          "oiliness": number,
          "hydration": number,
          "wrinkles": number,
          "firmness": number,
          "skinAge": number,
          "analysisSummary": {
            "headline": "Short clinical diagnosis (e.g. 'Compromised Barrier with Mild Acne')",
            "generalCondition": "2 sentences explaining the holistic situation based on the Logic Tree.",
            "points": [
                { "subtitle": "Primary Concern", "content": "The main issue identified." },
                { "subtitle": "Secondary Observation", "content": "Another notable finding (e.g. 'Dehydration is exacerbating fine lines')." }
            ]
          },
          "immediateAction": "One specific clinical tip.",
          "observations": { 
             "acneActive": "Details...",
             "tone": "Details..."
          }
        }
        `;
        
        const base64Data = image.includes(',') ? image.split(',')[1] : image;

        // Use MODEL_FAST (gemini-3-flash-preview) for robust analysis
        const response = await ai.models.generateContent({
            model: MODEL_FAST, 
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: prompt }
                ]
            },
            config: { 
                responseMimeType: 'application/json',
                safetySettings: SAFETY_SETTINGS_NONE 
            }
        });
        
        const data = parseJSONFromText(response.text || "{}");
        if (!data.overallScore && !data.analysisSummary) throw new Error("Incomplete analysis");

        const observations = data.observations || {};
        if (data.immediateAction) observations.advice = data.immediateAction;

        return { ...localMetrics, ...data, observations, timestamp: Date.now() };
    }, 60000); 
};

export const compareFaceIdentity = async (newImage: string, referenceImage: string): Promise<{ isMatch: boolean; confidence: number; reason: string }> => {
    return runWithRetry(async (ai) => {
        const newData = newImage.includes(',') ? newImage.split(',')[1] : newImage;
        const refData = referenceImage.includes(',') ? referenceImage.split(',')[1] : referenceImage;

        const response = await ai.models.generateContent({
            model: MODEL_FAST, 
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: refData } },
                    { inlineData: { mimeType: 'image/jpeg', data: newData } },
                    { text: `Compare faces. JSON: { "isMatch": boolean, "confidence": number, "reason": "string" }` }
                ]
            },
            config: { 
                responseMimeType: 'application/json',
                safetySettings: SAFETY_SETTINGS_NONE 
            }
        });
        return parseJSONFromText(response.text || "{}");
    }, { isMatch: true, confidence: 100, reason: "Fallback" });
};
