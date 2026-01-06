import { SkinMetrics } from '../../types';
import { runWithTimeout, runWithRetry, parseJSONFromText, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithTimeout<SkinMetrics>(async (ai) => {
        const prompt = `
        ACT AS A DERMATOLOGICAL GRADING AI. 
        Analyze the face image for VISIBLE BLEMISHES and PHYSICAL IMPERFECTIONS.
        
        INPUT CV METRICS (Reference Only): ${JSON.stringify(localMetrics)}. 
        
        CRITICAL GRADING RUBRIC (0-100 Scale, 100 = Flawless):
        
        1. ACNE & BLEMISHES ('acneActive'):
           - Look for: Raised bumps, whiteheads, cysts, and inflammatory papules.
           - Score < 60: Visible active breakouts.
           - Score > 90: Flat surface, no active inflammation.
           
        2. ACNE MARKS & SCARS ('acneScars'):
           - LOOK FOR: Post-Inflammatory Hyperpigmentation (PIH - brown spots from old acne) and Post-Inflammatory Erythema (PIE - red spots from old acne).
           - LOOK FOR: Physical indentations (Icepick, Boxcar, Rolling scars).
           - DISTINCTION: If the spot is flat and red/brown where a pimple used to be, it is a MARK, not active acne.
           
        3. PIGMENTATION ('pigmentation'):
           - FOCUS: Sun Damage, Melasma, and Solar Lentigines.
           - DISTINCTION: Do not confuse PIH (acne marks) with Sun Spots.
           - Sun Spots: Usually larger, clustered on cheeks/nose/forehead, often freckle-like.
           - Acne Marks: Individual distinct spots, often on jawline/cheeks/chin.
           
        4. TEXTURE ('texture'):
           - Focus on physical surface roughness, closed comedones (skin colored bumps), and milia.
        
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
            "headline": "Short clinical diagnosis (e.g. 'Mild Comedonal Acne with PIH')",
            "generalCondition": "2 sentences. Explicitly state if pigmentation is 'Sun Induced' or 'Post-Acne Origin'.",
            "points": [
                { "subtitle": "Primary Blemish", "content": "Identify the main visible imperfection (e.g. 'Inflammatory Papules on Cheeks')." },
                { "subtitle": "Pigment Analysis", "content": "Distinguish the source: 'Spots appear to be Post-Inflammatory Hyperpigmentation from previous breakouts' OR 'Signs of UV-related solar lentigines'." }
            ]
          },
          "immediateAction": "One specific clinical tip based on the specific blemish type detected.",
          "observations": { 
             "acneActive": "Location and type of active spots",
             "pigmentation": "Differentiation between sun spots vs acne marks"
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
            model: MODEL_FAST, // Use Flash Preview for better visual reasoning
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
