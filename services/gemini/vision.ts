
import { UserProfile } from '../../types';
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

        const prompt = `
        ACT AS A TOP DERMATOLOGIST EXPLAINING A TREATMENT PLAN TO A PATIENT.

        INPUT:
        Image 1: Current Patient Skin (Baseline)
        Image 2: Simulated Goal Result (Clear/Healthy)
        
        PATIENT DATA:
        - Age: ${user.age}
        - Skin Type: ${user.skinType}
        - Current Metrics (0-100 Scale, 100=Perfect/Healthy): 
          Acne: ${user.biometrics.acneActive}, 
          Redness: ${user.biometrics.redness}, 
          Hydration: ${user.biometrics.hydration},
          Scars: ${user.biometrics.scars || 70},
          Skin Tags: ${user.biometrics.skinTags || 70}.
          (Note: If scores are low, focus the plan on treating those severe issues).

        TASK 1: EXPLAIN THE TRANSFORMATION (Simple Language)
        Compare Image 1 vs Image 2.
        Explain to the patient in SIMPLE, EASY-TO-UNDERSTAND language:
        1. What specific issues are visible in their current skin (Image 1).
        2. How the simulated result (Image 2) looks better.
        3. SUMMARY OF THE PLAN: Briefly explain the timeline and steps to get there (e.g., "We will spend the first 4 weeks repairing your barrier, then focus on clearing the spots...").
        
        DO NOT use complex medical jargon (e.g. say "pimples" not "inflammatory papules", say "redness" not "erythema").
        Keep it encouraging and clear.

        TASK 2: CLINICAL PROTOCOL
        Design a regimen to achieve the result in Image 2.

        OUTPUT JSON (Strict):
        {
          "analysis": "Simple explanation for the patient. E.g., 'Your current skin shows [Issues]. The goal is [Result]. To achieve this, our plan covers 8 weeks: First we calm the redness, then we treat the texture.'",
          "weeks": [
            {
              "title": "Weeks 1-4",
              "phaseName": "Stabilize & Repair",
              "focus": "Barrier Support",
              "morning": "Morning routine details.",
              "evening": "Evening routine details.",
              "ingredients": ["Ceramides", "Niacinamide"],
              "treatment": "LED Light Therapy (Blue)"
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
