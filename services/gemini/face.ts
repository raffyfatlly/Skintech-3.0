
import { SkinMetrics } from '../../types';
import { runWithTimeout, runWithRetry, parseJSONFromText, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

/**
 * CLINICAL GRADING ENGINE
 * Uses a strict 6-tier rubric to evaluate skin health based on visual evidence.
 */
export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, shelf: string[] = [], history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithTimeout<SkinMetrics>(async (ai) => {
        const prompt = `
        ACT AS A SENIOR CLINICAL DERMATOLOGIST.
        Perform a rigorous visual grading of the face in the image.
        
        You must assign a score (0-100) for ALL 13 BIOMARKERS based on the "Health/Clearance" scale.
        HIGH SCORE (100) = PERFECT / HEALTHY.
        LOW SCORE (0) = SEVERE ISSUE.

        USE THIS STRICT 6-TIER GRADING MATRIX FOR EVERY METRIC:

        TIER 1: CRISIS (Score 0-19)
        - Condition: Severe, widespread, inflamed, or deep structural damage.
        - Visuals: Cysts, raw/cracked skin, deep folds, >50% face affected.

        TIER 2: CLINICAL (Score 20-39)
        - Condition: Distinct visible issues requiring active treatment.
        - Visuals: Pustules (>10), distinct hyperpigmentation spots, static lines.

        TIER 3: REACTIVE (Score 40-59)
        - Condition: Noticeable fluctuations, mild inflammation.
        - Visuals: Red patches, clusters of whiteheads (5-10), visible dullness.

        TIER 4: IMBALANCE (Score 60-79)
        - Condition: Generally healthy but with texture/tone issues.
        - Visuals: Visible pores in T-zone, singular blemishes (1-4), uneven tan.

        TIER 5: RESILIENT (Score 80-94)
        - Condition: Healthy, stable barrier.
        - Visuals: Smooth texture, even tone, no inflammation. Minor "human" imperfections allowed.

        TIER 6: PRISTINE (Score 95-100)
        - Condition: Flawless, "Glass Skin", Ideal.
        - Visuals: Invisible pores, high radiance, uniform eumelanin/hemoglobin distribution.

        --- BIOMARKER SPECIFIC SIGNS (Scan for these) ---

        [GROUP 1: BREAKOUTS]
        1. acneActive: Look for raised red papules, pustules, or cysts.
           - Crisis: Cystic/Nodular acne.
           - Imbalance: 1-3 small whiteheads.
        2. blackheads: Look for oxidized open comedones (nose/chin).
           - Crisis: "Strawberry nose" texture.
           - Resilient: Invisible at arm's length.
        3. acneMarks: Look for PIH (Brown) or PIE (Red) flat spots.
           - Clinical: Dark/Deep purple spots.
           - Resilient: Faint fading shadows.

        [GROUP 2: TONE]
        4. redness: Look for diffuse erythema or broken capillaries.
           - Crisis: Deep beet-red flushing or Rosacea.
           - Pristine: Uniform skin tone.
        5. darkSpots: Look for sun lentigines or melasma patches.
           - Clinical: Distinct brown patches with defined borders.
        6. darkCircles: Look for infraorbital shadowing/vascularity.
           - Crisis: Deep purple/blue hollows.

        [GROUP 3: SURFACE]
        7. pores: Look for follicle size on cheeks/nose.
           - Crisis: "Orange peel" texture visible from distance.
           - Pristine: Blurry/Invisible pores.
        8. oiliness: Look for specular reflection (shine) on forehead/nose.
           - Crisis: Wet/Greasy look (High Glare).
           - Pristine: Satin/Matte finish.
        9. hydration: Look for plumpness and light bounce.
           - Crisis: Flaking, cracking, dull/ashy cast.
           - Pristine: "Glow" / High light reflection.
        10. scars: Look for atrophic indentations (icepick/boxcar).
            - Clinical: Visible pitted texture.
        11. skinTags: Look for fleshy pedunculated growths (neck/eyes).

        [GROUP 4: AGING]
        12. wrinkles: Look for static lines (forehead, nasolabial, crows feet).
            - Crisis: Deep folds present at rest.
            - Resilient: Fine lines only when smiling (dynamic).
        13. firmness: Look for jawline contour and jowls.
            - Crisis: Sagging jowls, loss of oval shape.
            - Pristine: Sharp, defined jawline.

        --- OUTPUT REQUIREMENT ---
        Return a valid JSON object.
        - overallScore: Weighted average of all scores.
        - skinAge: Estimated biological skin age based on wrinkles/firmness.
        - analysisSummary: A professional summary.
        - immediateAction: One generic tip.

        {
          "overallScore": number,
          "skinAge": number,
          "acneActive": number,
          "blackheads": number,
          "acneMarks": number,
          "redness": number,
          "darkSpots": number,
          "darkCircles": number,
          "pores": number,
          "oiliness": number,
          "hydration": number,
          "scars": number,
          "skinTags": number,
          "wrinkles": number,
          "firmness": number,
          "analysisSummary": {
            "headline": "Short Clinical Headline (e.g. 'Mild Comedonal Acne')",
            "generalCondition": "2 sentences describing the primary tier (e.g. 'Skin is in the Reactive stage due to visible redness...')",
            "points": [
               { "subtitle": "Primary Concern", "content": "Specific observation." },
               { "subtitle": "Strongest Feature", "content": "Specific observation." }
            ]
          }
        }
        `;
        
        const base64Data = image.includes(',') ? image.split(',')[1] : image;

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
        if (!data.overallScore) throw new Error("Incomplete analysis");

        return { ...localMetrics, ...data, timestamp: Date.now() };
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
