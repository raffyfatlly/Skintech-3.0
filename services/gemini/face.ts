
import { SkinMetrics } from '../../types';
import { runWithTimeout, runWithRetry, parseJSONFromText, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithTimeout<SkinMetrics>(async (ai) => {
        const prompt = `
        ACT AS A BOARD-CERTIFIED DERMATOLOGIST.
        Perform a strict clinical assessment of the face in the image using the Visual Rubric below.
        
        SCORING PROTOCOL (0-100 Scale):
        - 100: Perfect / Ideal Health.
        - 90-99: Excellent / Near Perfect.
        - 75-89: Good / Minor aesthetic issues.
        - 60-74: Fair / Moderate concern.
        - < 60: Poor / Significant clinical concern requiring treatment.
        
        VISUAL RUBRIC FOR BIOMARKERS (STRICT):

        1. BREAKOUTS & ACNE
        - acneActive: (Inflamed papules/pustules)
          * 90-100: Clear. No active lesions.
          * <70: Visible red bumps or whiteheads.
        - blackheads: (Open comedones)
          * 90-100: Invisible.
          * <70: Visible "strawberry nose" or congestion on chin.
        - acneMarks: (PIH/PIE - post-inflammatory marks)
          * 90-100: Even tone.
          * <70: Distinct brown (PIH) or red (PIE) spots from old acne.

        2. TONE & PIGMENTATION
        - redness: (Erythema/Flushing)
          * 90-100: Uniform skin color.
          * <70: Pink/Red patches, broken capillaries, or rosacea signs.
        - darkSpots: (Sun damage/Melasma)
          * 90-100: None.
          * <70: Defined hyperpigmented patches or sun spots.
        - darkCircles: (Infraorbital shadowing)
          * 90-100: Bright and smooth undereye.
          * <70: Visible dark, blue, or purple shadows.

        3. TEXTURE & SURFACE
        - pores: (Follicle openings)
          * 90-100: Invisible at conversational distance.
          * <70: Distinct "orange peel" texture on cheeks/nose.
        - oiliness: (Sebum reflection)
          * 90-100: Balanced/Satin finish.
          * <70: High glare/greasy film on T-zone.
        - hydration: (Water retention/Plumpness)
          * 90-100: Radiant, plump, light-reflecting.
          * <70: Dull, flat, crepey, or flaky appearance.
        - scars: (Atrophic/pitted texture)
          * 90-100: Smooth surface.
          * <70: Visible indentations (boxcar, icepick, rolling scars).
        - skinTags: (Acrochordons)
          * 90-100: None.
          * <70: Visible fleshy growths.

        4. AGING & STRUCTURE
        - wrinkles: (Static lines)
          * 90-100: Smooth at rest.
          * <70: Visible forehead lines, crows feet, or nasolabial folds.
        - firmness: (Laxity/Gravity effects)
          * 90-100: Sharp jawline contour.
          * <70: Jowling, sagging, or loss of definition.

        ANALYSIS LOGIC:
        - Identify the 1-2 lowest scores based on the rubric. These are the "Primary Concerns".
        - Generate a "headline" summarizing these concerns (e.g. "Active Acne with Dehydration").
        - "immediateAction" should directly address the lowest score.

        INPUT METRICS (Reference Only - Prioritize Visual Evidence): ${JSON.stringify(localMetrics)}

        OUTPUT JSON (Strict):
        {
          "overallScore": number (Weighted average: Breakouts 30%, Tone 25%, Texture 25%, Aging 20%),
          "acneActive": number,
          "blackheads": number,
          "acneMarks": number,
          "darkSpots": number,
          "redness": number,
          "darkCircles": number,
          "pores": number,
          "oiliness": number,
          "hydration": number,
          "scars": number,
          "skinTags": number,
          "wrinkles": number,
          "firmness": number,
          "skinAge": number (Visual estimate),
          "analysisSummary": {
            "headline": "string",
            "generalCondition": "string (2-3 sentences)",
            "points": [
                { "subtitle": "Primary Concern", "content": "string" },
                { "subtitle": "Secondary Observation", "content": "string" }
            ]
          },
          "immediateAction": "string"
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
