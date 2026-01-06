
import { UserProfile, Product } from '../../types';
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
    Acne: ${biometrics.acneActive}/100
    Redness: ${biometrics.redness}/100
    Hydration: ${biometrics.hydration}/100
    Wrinkles: ${biometrics.wrinkles}/100
    Pigmentation: ${biometrics.darkSpots}/100
    `;

    const shelfContext = shelf.map(p => `${p.brand || ''} ${p.name} (${p.type})`).join(', ');

    return getAi().chats.create({
        model: MODEL_FAST,
        config: { 
            systemInstruction: `You are a helpful, friendly dermatologist assistant.
            
            CONTEXT:
            User: ${user.name}
            Biometrics: ${bioSummary}
            Routine: ${shelfContext}
            Location: ${location}
            
            PROTOCOL:
            1. TONE: Warm, simple, and direct. Like a friend who is a skin expert.
            2. GREETING: If the user says "Hi", just reply "Hi, how can I help you today?".
            3. LENGTH: Keep answers short (1-2 sentences). No big paragraphs.
            4. FORMATTING: Use **bold** for key terms only.
            
            GOAL: Answer the user's specific question quickly and helpfully.` 
        }
    });
};
