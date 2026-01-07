
import { UserProfile, UserPreferences } from '../../types';
import { getAi, runWithTimeout, parseJSONFromText, urlToBase64, MODEL_IMAGE, MODEL_FAST, SAFETY_SETTINGS_IMAGE, SAFETY_SETTINGS_NONE } from './core';

// --- GEN AI IMAGE MANIPULATION (Must use MODEL_IMAGE) ---

export const generateRetouchedImage = async (imageBase64: string): Promise<string> => {
    return runWithTimeout<string>(async (ai) => {
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

        // UPDATED PROMPT: Specifically engineered for the model to behave as an image editor
        const prompt = "Improve the skin texture in this image. Reduce redness, minimize acne, and smooth pores while keeping the person's identity exactly the same. Output ONLY the modified image.";

        let attempts = 0;
        const maxAttempts = 2; 

        while (attempts < maxAttempts) {
            try {
                const response = await ai.models.generateContent({
                    model: MODEL_IMAGE, 
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                            { text: prompt },
                        ]
                    },
                    config: {
                        safetySettings: SAFETY_SETTINGS_IMAGE,
                        temperature: 0.4,
                    }
                });

                const respParts = response.candidates?.[0]?.content?.parts;
                const imagePart = respParts?.find(p => p.inlineData);
                
                if (imagePart && imagePart.inlineData) {
                    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                }
                
                const textPart = respParts?.find(p => p.text);
                if (textPart) {
                    console.warn("Model returned text instead of image:", textPart.text);
                    throw new Error("Model failed to generate image.");
                }
                
                throw new Error("Empty response from AI model.");

            } catch (e: any) {
                console.warn(`Attempt ${attempts + 1} failed:`, e.message);
                attempts++;
                
                if (e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('limit')) {
                    throw new Error("429 Quota Exceeded");
                }
                if (e.message?.includes('Safety') || e.message?.includes('blocked')) {
                    throw new Error("Safety Blocked");
                }
                
                if (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                
                throw e;
            }
        }
        
        throw new Error("Failed to generate image.");
    }, 90000); 
};

export const generateImprovementPlan = async (
    originalImage: string, 
    targetImage: string, 
    user: UserProfile
): Promise<any> => {
    return runWithTimeout<any>(async (ai) => {
        // Prepare Target Image: If it's a URL, convert to Base64 first
        let targetData = targetImage;
        if (targetImage.startsWith('http')) {
            try {
                targetData = await urlToBase64(targetImage);
            } catch (e) {
                console.warn("Could not download target image for analysis. Using generic prompt context.", e);
                // Fallback: Proceed without visual target if download fails
                // We'll simulate target context via prompt
            }
        }
        
        // Clean Base64
        const origData = originalImage.includes(',') ? originalImage.split(',')[1] : originalImage;
        targetData = targetData.includes(',') ? targetData.split(',')[1] : targetData;

        // Build Safety Context
        const prefs = user.preferences || {} as Partial<UserPreferences>;
        const safetyFlags = [];
        if (prefs.isPregnant) safetyFlags.push("PREGNANCY: Avoid Retinoids, Salicylic Acid (>2%), Hydroquinone.");
        if (prefs.hasEczema) safetyFlags.push("ECZEMA: Avoid Fragrance, High % Glycolic Acid, Harsh Scrubs.");
        if (prefs.onMedication) safetyFlags.push("ON MEDICATION: Skin is extra sensitive. Focus on barrier repair.");
        if (prefs.sensitivity === 'VERY_SENSITIVE') safetyFlags.push("VERY SENSITIVE: Hypoallergenic focus.");

        const safetyContext = safetyFlags.length > 0 
            ? `CRITICAL SAFETY CONSTRAINTS (MUST FOLLOW): ${safetyFlags.join(" ")}` 
            : "Standard safety protocols apply.";

        const prompt = `
        ACT AS A TOP DERMATOLOGIST EXPLAINING A TREATMENT PLAN TO A PATIENT.

        INPUT:
        Image 1: Current Patient Skin (Baseline)
        Image 2: Simulated Goal Result (Clear/Healthy)
        
        PATIENT DATA:
        - Age: ${user.age}
        - Skin Type: ${user.skinType}
        - Safety Profile: ${safetyContext}
        - Current Metrics (0-100 Scale, 100=Perfect/Healthy): 
          Acne: ${user.biometrics.acneActive}, 
          Redness: ${user.biometrics.redness}, 
          Hydration: ${user.biometrics.hydration},
          Scars: ${user.biometrics.scars || 70},
          Skin Tags: ${user.biometrics.skinTags || 70}.
          (Note: If scores are low, focus the plan on treating those severe issues).

        TASK:
        1. Compare Image 1 vs Image 2 and explain the improvement.
        2. Identify the top 2-3 biomarkers being targeted (e.g. Inflammation, Hyper-pigmentation, Texture).
        3. Suggest professional clinical treatments (e.g. Microneedling, LED, Peels) if relevant for faster results.
        4. Suggest simple lifestyle habits (e.g. Diet, Sleep, Hygiene).
        5. Design a phased routine respecting the SAFETY CONSTRAINTS above.

        OUTPUT JSON (Strict):
        {
          "analysis": "Simple explanation for the patient. E.g., 'Your current skin shows [Issues]. The goal is [Result]. To achieve this, our plan covers 8 weeks...'",
          "targetedBiomarkers": ["Acne", "Redness", "Texture"],
          "clinicalTreatments": ["LED Light Therapy (Blue)", "Salicylic Acid Peel"],
          "lifestyleTips": ["Change pillowcase every 2 days", "Reduce sugar intake"],
          "weeks": [
            {
              "title": "Weeks 1-4",
              "phaseName": "Stabilize & Repair",
              "focus": "Barrier Support",
              "morning": "Morning routine details.",
              "evening": "Evening routine details.",
              "ingredients": ["Ceramides", "Niacinamide"],
              "treatment": "Optional home device usage"
            }
          ]
        }
        `;

        const parts: any[] = [
            { inlineData: { mimeType: 'image/jpeg', data: origData } }
        ];
        
        // Only add target image if we successfully converted it to data
        if (targetData && !targetData.startsWith('http')) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: targetData } });
        }
        
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: MODEL_FAST, // Use Flash Preview for Analysis
            contents: { parts },
            config: { 
                responseMimeType: 'application/json',
                safetySettings: SAFETY_SETTINGS_NONE
            }
        });

        return parseJSONFromText(response.text || "{}");
    }, 60000);
};
