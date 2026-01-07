
import { UserProfile, Product, UserPreferences } from '../../types';
import { getAi, MODEL_FAST } from './core';
import type { Chat } from "@google/genai";

export const createDermatologistSession = (
    user: UserProfile, 
    shelf: Product[],
    location: string = "Global"
): Chat => {
    const biometrics = user.biometrics;
    
    // Simplification of context to save tokens and focus model
    const bioSummary = `
    SCORING SCALE (0-100): 
    **100 = Perfect/Healthy/Clear**. 
    **0 = Severe/Bad/Damaged**.
    
    USER STATS:
    - Acne: ${biometrics.acneActive}/100 (High score means CLEAR skin. Low score means ACTIVE acne)
    - Redness: ${biometrics.redness}/100 (High score means CALM skin. Low score means INFLAMED/SENSITIVE)
    - Hydration: ${biometrics.hydration}/100 (High score means HYDRATED. Low score means DRY)
    - Texture Category: Scars ${biometrics.scars}/100, Tags ${biometrics.skinTags}/100 (High score means CLEAR/SMOOTH)
    - Wrinkles: ${biometrics.wrinkles}/100 (High score means SMOOTH. Low score means WRINKLED)
    - Pigmentation: ${biometrics.darkSpots}/100 (High score means EVEN TONE. Low score means SPOTS)
    `;

    const shelfContext = shelf.map(p => `${p.brand || ''} ${p.name} (${p.type})`).join(', ');

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

    return getAi().chats.create({
        model: MODEL_FAST,
        config: { 
            systemInstruction: `You are a helpful, friendly dermatologist assistant.
            
            CONTEXT:
            User: ${user.name}
            Biometrics: ${bioSummary}
            Routine: ${shelfContext}
            Location: ${location}
            Safety Profile: ${safetyContext}
            
            PROTOCOL:
            1. TONE: Warm, simple, and direct. Like a friend who is a skin expert.
            2. GREETING: If the user says "Hi", just reply "Hi, how can I help you today?".
            3. LENGTH: Keep answers short (1-2 sentences). No big paragraphs.
            4. FORMATTING: Use **bold** for key terms only.
            5. SAFETY: If the user asks for product recommendations or advice, YOU MUST CROSS-REFERENCE THE "Safety Profile" above. If they are pregnant, do not recommend Retinol/BHA. If sensitive, avoid fragrance.
            
            IMPORTANT: When analyzing the user's skin, remember that a LOW score indicates a PROBLEM. A HIGH score indicates HEALTH. 
            Example: If Acne Score is 30, say "I see you're dealing with some breakouts." If Acne Score is 90, say "Your skin is quite clear."
            
            GOAL: Answer the user's specific question quickly and helpfully.` 
        }
    });
};
