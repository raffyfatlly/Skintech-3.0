
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SkinMetrics, Product, UserProfile, IngredientRisk, Benefit } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- FEATURE-SPECIFIC MODEL CONFIGURATION ---
// Separated to ensure changes to one feature don't break others.

// 1. FACE ANALYSIS: Uses 3.0 Flash for speed + existing calibrated rubric.
const MODEL_FACE_SCAN = 'gemini-3-flash-preview';

// 2. PRODUCT INTELLIGENCE: Uses 3.0 Flash for superior Search Grounding & JSON formatting.
const MODEL_PRODUCT_SEARCH = 'gemini-3-flash-preview';

// 3. VISION: Uses 2.5 Flash for reliable OCR/Text recognition in images.
const MODEL_VISION = 'gemini-2.5-flash';

// 4. ROUTINE ARCHITECT: Uses 3.0 Pro for complex reasoning and large JSON structures.
const MODEL_ROUTINE = 'gemini-3-pro-preview';

// Helpers
const parseJSONFromText = (text: string): any => {
    try {
        // Find the first occurrence of { or [
        const startObj = text.indexOf('{');
        const startArr = text.indexOf('[');
        
        // Determine which comes first (or exists)
        let start = -1;
        let end = -1;
        let isArray = false;

        if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
            start = startObj;
            end = text.lastIndexOf('}');
        } else if (startArr !== -1) {
            start = startArr;
            end = text.lastIndexOf(']');
            isArray = true;
        }

        if (start === -1 || end === -1) return isArray ? [] : {};

        const jsonStr = text.substring(start, end + 1);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error", e);
        return {};
    }
};

const extractSources = (response: any): string[] => {
    try {
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        return chunks
            .map((c: any) => c.web?.uri)
            .filter((u: string) => u && typeof u === 'string');
    } catch (e) {
        return [];
    }
};

const runWithRetry = async <T>(fn: (ai: GoogleGenAI) => Promise<T>, fallback: T, timeoutMs: number = 45000): Promise<T> => {
    try {
        const timeoutPromise = new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs));
        return await Promise.race([fn(ai), timeoutPromise]);
    } catch (e) {
        console.error("Gemini Error:", e);
        return fallback;
    }
};

const getFallbackProduct = (userMetrics: SkinMetrics, name: string): Product => ({
    id: Date.now().toString(),
    name: name,
    brand: "Unknown",
    type: "UNKNOWN",
    ingredients: [],
    dateScanned: Date.now(),
    risks: [],
    benefits: [],
    suitabilityScore: 50
});

// --- EXPORTED FUNCTIONS ---

export const searchProducts = async (query: string): Promise<{ name: string, brand: string }[]> => {
    return runWithRetry<{ name: string, brand: string }[]>(async (ai) => {
        const prompt = `
        User Query: "${query}"
        
        ACT AS A PRECISE SKINCARE PRODUCT SEARCH ENGINE.
        
        TASK:
        1. **Brand Detection**: Analyze if the query contains a specific brand name.
        2. **STRICT FILTERING**:
           - Return ONLY products from the requested brand if specified.
           - Prioritize products available in MALAYSIA (Watsons, Guardian, Sephora MY).
        
        OUTPUT FORMAT:
        Strict JSON Array of objects.
        [
          {"brand": "Neutrogena", "name": "Neutrogena Deep Clean Acne Foaming Cleanser"},
          ...
        ]
        `;
        
        const response = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        
        const res = parseJSONFromText(response.text || "[]");
        return Array.isArray(res) ? res : [res].filter(x => x.name);
    }, [{ name: query, brand: "Generic" }]);
};

export const analyzeFaceSkin = async (image: string, localMetrics: SkinMetrics, history?: SkinMetrics[]): Promise<SkinMetrics> => {
    return runWithRetry<SkinMetrics>(async (ai) => {
        const rubric = `
AI REFERENCE RUBRIC: SKIN HEALTH & INTEGRITY GRADING

SCORING ARCHITECTURE
 * Group 1: Crisis (Score 02–19) - Critical / Medical Emergency / Necrotic / Disfigured
 * Group 2: Clinical (Score 20–39) - Severe / Pathological / Deeply Compromised
 * Group 3: Reactive (Score 40–59) - Active Concern / Inflamed / Visibly Damaged
 * Group 4: Imbalanced (Score 60–79) - Sub-Optimal / Dull / Minor Congestion
 * Group 5: Resilient (Score 80–92) - Healthy / Clean / Balanced
 * Group 6: Pristine (Score 93–98) - Flawless / Glass-like / Optimized

CATEGORY 1: BLEMISHES
1. ACNE (Lesion Count, Size & Coverage)
 * Group 1 (Crisis): >50% face coverage. Confluent plaques of infected, weeping, or necrotic tissue. Large cysts >1cm in diameter merging together.
 * Group 2 (Clinical): 10+ active inflammatory lesions. Presence of deep nodules or cysts (>5mm size). Significant swelling extending >2mm beyond the lesion border.
 * Group 3 (Reactive): 5–10 active red papules/pustules. Inflammation is localized (spots are distinct, not merging). Lesions are generally <3mm in size.
 * Group 4 (Imbalanced): Clusters of closed comedones (flesh-colored bumps). No active red inflammation, but texture is bumpy in zones >2cm wide (e.g., forehead or chin).
 * Group 5 (Resilient): 0–1 active minor blemishes. Lesion is small (<1mm), surface-level, and barely red.
 * Group 6 (Pristine): 0 lesions. Surface is completely flat and unbroken. 0% inflammation.

2. SCARS (Depth, Width & Visibility)
 * Group 1 (Crisis): Hypertrophic/Keloid: Raised scars extending >2mm above skin surface. Or severe atrophy causing facial deformity.
 * Group 2 (Clinical): Deep Pitting: Ice-pick or Boxcar scars >1mm deep. Texture is visibly wavy/indented from a distance of 1 meter.
 * Group 3 (Reactive): Pigmented marks (PIH/PIE): Dark red or brown flat spots remaining from acne. High contrast against skin tone. Covers >10% of cheek area.
 * Group 4 (Imbalanced): Shallow indentation: Minor rolling scars (<0.5mm depth). Visible only with side-lighting (shadows cast by uneven texture).
 * Group 5 (Resilient): Micro-textural variance: Variance only visible under 5x magnification. To the naked eye, skin looks smooth.
 * Group 6 (Pristine): Uniform surface: No indentation or pigment variance. Light reflects in a straight, unbroken line across the area.

3. PORES (Diameter & Visibility Distance)
 * Group 1 (Crisis): Ruptured: Pores merged into pitted tracts. "Orange peel" texture visible from >2 meters away.
 * Group 2 (Clinical): Distended: Pores appear oval/stretched. Diameter >0.5mm. Visible clearly on cheeks and forehead from 1 meter.
 * Group 3 (Reactive): Enlarged: Circular pores visible on nose and inner cheeks from 50cm distance. "Strawberry" texture on nose.
 * Group 4 (Imbalanced): Localized: Visible pores confined strictly to the T-zone. Cheek pores are tight. Visible from 30cm.
 * Group 5 (Resilient): Tight: Pores appear as pinpoints (<0.1mm). Visible only on nose tip when looking in a magnifying mirror.
 * Group 6 (Pristine): Invisible: "Blur" effect. Pores are undetectable to the naked eye at any distance.

4. BLACKHEADS (Density & Plug Size)
 * Group 1 (Crisis): Giant Comedones: Pores dilated >1mm by hard, dark, oxidized plugs. Signs of infection around the plug.
 * Group 2 (Clinical): High Density: Clusters of >20 distinct black dots across T-zone and cheeks. Texture feels rough/spiky.
 * Group 3 (Reactive): Moderate Density: 10–20 visible blackheads on nose/chin. Pores look dark and filled.
 * Group 4 (Imbalanced): Sebaceous Filaments: Light grey/tan tops visible on nose only. Not true blackheads (no pore stretching).
 * Group 5 (Resilient): Clear: Pores generally look empty. No dark oxidation spots visible.
 * Group 6 (Pristine): Empty: Pores contain no visible debris. No color difference between pore and skin.


CATEGORY 2: HEALTH
5. HYDRATION (Desquamation Area & Turgor)
 * Group 1 (Crisis): Fissuring: Cracks or bleeding in the skin. Peeling skin sheets >1cm wide. Raw, exposed dermis.
 * Group 2 (Clinical): Scaling: Visible white flakes covering >30% of the face. "Alligator" pattern cracking.
 * Group 3 (Reactive): Micro-flaking: Fine, powdery flakes visible on nose or brows. Skin does not reflect light (matte). Fine crepey lines visible.
 * Group 4 (Imbalanced): Dullness: No flaking, but skin absorbs topicals instantly. Slight "drag" when touching.
 * Group 5 (Resilient): Supple: Soft surface. Good turgor (recovers instantly from pinch).
 * Group 6 (Pristine): Hydro-Plump: Skin looks "wet" or dewy. High water content reflects light broadly.

6. OIL CONTROL (Surface Area & Shine Intensity)
 * Group 1 (Crisis): Seborrhea: Visible crusting of yellow oil/skin mix. Or oil dripping/pooling in creases.
 * Group 2 (Clinical): Slick: Heavy high-gloss shine covering 100% of the face (including cheeks). Oil transfer to fingers upon lightest touch.
 * Group 3 (Reactive): Shiny T-Zone: Distinct glare on forehead/nose/chin. Cheeks are matte. Oil visible 2–3 hours after cleansing.
 * Group 4 (Imbalanced): Satin: Mild sheen on nose tip only. Skin feels slightly tacky but looks mostly matte.
 * Group 5 (Resilient): Velvet: Soft glow, not greasy. Sebum production matches skin needs.
 * Group 6 (Pristine): Balanced: Optimized lipid layer. Skin has a natural luminosity but 0% surface grease accumulation.

7. REDNESS (Intensity & Vascularity)
 * Group 1 (Crisis): Deep Erythema: Purple or bright red inflammation covering >50% of face. Visible swelling/edema.
 * Group 2 (Clinical): Couperose: Distinct network of broken capillaries (spider veins) visible. Or persistent red blotches >2cm in size.
 * Group 3 (Reactive): Flushing: General pink undertone on cheeks/nose. Contrast between red areas and neck color is obvious.
 * Group 4 (Imbalanced): Mild Pinkness: Redness confined to small areas (e.g., creases of nose, chin).
 * Group 5 (Resilient): Calm: Even skin tone. No pink or red undertones visible.
 * Group 6 (Pristine): Porcelain: Uniform color consistency edge-to-edge. 0% redness.

8. TEXTURE (Roughness & Uniformity)
 * Group 1 (Crisis): Scabbing/Crusting: Hard, rough scabs or oozing patches. Surface height varies by >1mm.
 * Group 2 (Clinical): Cobblestone: Widespread tiny bumps (closed comedones) giving a sandpaper look. >50% of texture is uneven.
 * Group 3 (Reactive): Grainy: Uneven surface. Light scatters rather than reflecting. Fingers feel distinct friction/drag.
 * Group 4 (Imbalanced): Dry Patchy: Generally smooth, but isolated rough patches (e.g., on cheeks).
 * Group 5 (Resilient): Silky: Finger glides easily. Minor texture only detecting by touch, not sight.
 * Group 6 (Pristine): Frictionless: Surface is polished and glass-smooth. No drag.


CATEGORY 3: VITALITY

9. FINE LINES (Depth & Persistence)
 * Group 1 (Crisis): Fissures: Deep cracks resembling dried earth. Skin looks brittle and inelastic.
 * Group 2 (Clinical): Static Lines: Lines etched into skin (forehead/eyes) visible at rest (without moving face). Depth >0.5mm.
 * Group 3 (Reactive): Lingering Dynamic: Lines appear deep during expression and take >3 seconds to fade after relaxing.
 * Group 4 (Imbalanced): Shadowing: Faint linear shadows in expression areas. Visible only in harsh overhead lighting.
 * Group 5 (Resilient): Micro-lines: Very faint lines visible only during extreme smiling/frowning. Disappear instantly.
 * Group 6 (Pristine): High Tension: No lines visible even during micro-movements. Surface tension is high.

10. WRINKLES (Structural Fold Depth)
 * Group 1 (Crisis): Collapse: Deep folds/overlaps (e.g., hooded eyes, jowls) that alter face silhouette.
 * Group 2 (Clinical): Furrows: Deep-set wrinkles (Nasolabial/Forehead) >1mm deep. Cannot be stretched flat with fingers.
 * Group 3 (Reactive): Creases: Visible lines at corners of eyes/mouth that are clearly defined but <1mm deep.
 * Group 4 (Imbalanced): Early Etching: "Shadows" forming where wrinkles will be. No permanent physical indentation yet.
 * Group 5 (Resilient): Firm: No deep wrinkles. Skin structure is dense.
 * Group 6 (Pristine): Youthful Density: Skin is thick and supportive. 0 visible folds.

11. FIRMNESS (Elasticity & Droop)
 * Group 1 (Crisis): Laxity: Skin hangs loosely. "Turkey neck" or excessive pooling. 0 elastic recoil.
 * Group 2 (Clinical): Sagging: Jawline definition is lost. Jowls droop >5mm below the jawbone line.
 * Group 3 (Reactive): Looseness: Skin can be pulled >1cm away from the face and returns slowly (poor snap test).
 * Group 4 (Imbalanced): Softening: Jawline is slightly blurred, not razor-sharp. Cheeks have slightly dropped.
 * Group 5 (Resilient): Taut: Strong resistance. Skin sits tight against the muscle/bone.
 * Group 6 (Pristine): Lifted: Maximum tensile strength. Contours are sharp, defined, and high.

12. SPOTS (Pigment Density & Contrast)
 * Group 1 (Crisis): Irregular: Asymmetrical, multi-colored lesions (>6mm) or bleeding spots (Melanoma risk). Large melasma patches >5cm.
 * Group 2 (Clinical): Dense Clustering: Multiple high-contrast brown spots (age spots). Covers >30% of cheek area.
 * Group 3 (Reactive): Mottled: Uneven, patchy brown tone. "Cloudy" appearance. Distinct freckling from sun damage.
 * Group 4 (Imbalanced): Faint: Slight shadows or very light freckling. Low contrast against skin tone.
 * Group 5 (Resilient): Bright: Even complexion. 1-2 very faint spots allowed.
 * Group 6 (Pristine): Luminous: Translucent quality. 0 visible melanin clusters.
13. DARK CIRCLES (Infraorbital Shadow & Volume)
 * Group 1 (Crisis): "Raccoon Eyes": Deep purple/black bruising surrounding the entire eye socket. Or severe edema (swelling) obscuring the eye shape.
 * Group 2 (Clinical): Deep Hollows: Distinct "tear trough" deformity (sunken groove >2mm deep). Pigmentation is dark brown/blue and extends down onto the cheekbone.
 * Group 3 (Reactive): Visible Semicircles: Clearly defined purple/blue crescent shapes under the eye. Shadow is visible from 1 meter.
 * Group 4 (Imbalanced): Inner Corner Shadow: Darkening confined strictly to the inner corner of the eye (near nose). Not a full semicircle.
 * Group 5 (Resilient): Minimal: Very faint shadow, likely due to thin skin rather than pigmentation. Easily covered with light concealer.
 * Group 6 (Pristine): Bright: Under-eye area is the same brightness and color as the cheek. No hollowing or volume loss.
        `;

        const prompt = `Analyze this face image for dermatological metrics. 
        Current computer-vision estimates (reference): ${JSON.stringify(localMetrics)}.
        
        TASK:
        1. Ignore provided metrics if they contradict visible skin condition.
        2. Calibrate scoring (0-100, Higher = Better/Clearer) based on the rubric.
        
        ${rubric}
        
        INSTRUCTIONS FOR 'analysisSummary' (Clinical Verdict):
        - **Goal**: Create a verdict that feels personal, precise, and encouraging.
        - **Language Rule**: Use **Simple, 5th-grade English**. NO complex medical terms.
          - **BAN**: "integrity", "diameter", "resilience", "structural", "erythema", "sebum", "necrotic", "pathological", "turgor", "edema", "vascularity", "lesions".
          - **USE**: "strength", "size", "redness", "oil", "bounce", "swelling", "breakouts", "glow".
        - **Tone**: Positive and observant. Like a smart friend noticing details.
        - **Structure**:
          1. **Validation**: Start with a strong compliment about their best feature (e.g. "Your cheek texture is glass-like...").
          2. **Precision**: Mention a specific detail you see (e.g. "I noticed your T-zone is a bit shiny," or "Your under-eyes look well-rested").
          3. **Action**: Connect a lower score to a simple fix (e.g. "To fix the redness, we just need to calm your skin barrier.").
        - **Do not be generic.** Use specific facial areas (nose, chin, forehead) to show you "see" them.
        
        Return JSON fields: overallScore, acneActive, acneScars, poreSize, blackheads, wrinkleFine, wrinkleDeep, sagging, pigmentation, redness, texture, hydration, oiliness, darkCircles, skinAge, analysisSummary (string), observations (map of metric key to string).`;
        
        const response = await ai.models.generateContent({
            model: MODEL_FACE_SCAN, // MAINTAINED AS 3-FLASH
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
                    { text: prompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });
        
        const data = parseJSONFromText(response.text || "{}");
        return { ...localMetrics, ...data, timestamp: Date.now() };
    }, localMetrics);
};

// Updated: Accepts routineActives for conflict checking
export const analyzeProductFromSearch = async (productName: string, userMetrics: SkinMetrics, consistencyScore?: number, knownBrand?: string, routineActives: string[] = []): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        const prompt = `
        CONTEXT: User is in MALAYSIA (Tropical, Humid Climate).
        Product: "${productName}" ${knownBrand ? `by ${knownBrand}` : ''}
        
        User Skin Profile:
        - Type: ${userMetrics.oiliness < 40 ? "Dry" : userMetrics.oiliness > 70 ? "Oily" : "Combination"}
        - Concerns: Acne (${userMetrics.acneActive < 70 ? "Active" : "Clear"}), Sensitivity (${userMetrics.redness < 60 ? "High" : "Normal"}), Hydration (${userMetrics.hydration})
        
        CURRENT SHELF ACTIVES: [${routineActives.join(', ')}]

        ACTIONS:
        1. USE GOOGLE SEARCH to find:
           - The OFFICIAL INCI ingredient list.
           - The CURRENT PRICE in MALAYSIA (RM/MYR) (Watsons MY, Guardian MY, Sephora MY, Shopee Mall).
           - Reviews regarding humidity suitability (does it feel heavy/sticky?).
        
        2. ANALYZE:
           - **Climate Fit**: Is this product texture suitable for hot/humid Malaysia?
           - **Routine Conflicts**: Does this product conflict with existing actives (e.g. Mixing Retinol with shelf Vitamin C/AHA)?
           - **Suitability**: Score 0-100 based on skin match.

        OUTPUT FORMAT:
        Return ONLY a raw JSON object.
        {
            "name": "Official Product Name",
            "brand": "Brand Name",
            "type": "Category (CLEANSER, SERUM, etc)",
            "ingredients": ["Water", "Glycerin", ...],
            "estimatedPrice": 45.90, // Number in RM
            "suitabilityScore": 85, // 0-100
            "risks": [
                { "ingredient": "Alcohol Denat", "riskLevel": "HIGH", "reason": "Drying for your skin type" }
            ],
            "benefits": [
                { "ingredient": "Centella", "target": "redness", "description": "Calms active inflammation", "relevance": "HIGH" }
            ],
            "usageTips": "Specific advice. E.g. 'Contains Retinol - do not use on the same night as your existing AHA serum. Since Malaysia is humid, use a thin layer only in the PM.'"
        }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH, // UPGRADED TO 3-FLASH FOR SEARCH GROUNDING
            contents: prompt,
            config: {
                 tools: [{ googleSearch: {} }] // Enable Google Search
            }
        });

        const data = parseJSONFromText(response.text || "{}");
        const sources = extractSources(response);

        if (!data || !data.name) throw new Error("Analysis failed");

        return {
            id: Date.now().toString(),
            name: data.name,
            brand: data.brand || knownBrand || "Unknown",
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips
        };
    }, { ...getFallbackProduct(userMetrics, productName), suitabilityScore: consistencyScore || 75, brand: knownBrand || "Unknown Brand" }, 60000); 
};

// Updated: Accepts routineActives for conflict checking
export const analyzeProductImage = async (base64: string, userMetrics: SkinMetrics, routineActives: string[] = []): Promise<Product> => {
    return runWithRetry<Product>(async (ai) => {
        
        // STEP 1: VISION RECOGNITION (Using 2.5 Flash for reliable OCR)
        const visionPrompt = `
        Analyze this skincare product image. 
        Identify the BRAND and PRODUCT NAME clearly.
        If ingredients are visible, list them.
        
        OUTPUT JSON:
        { 
            "brand": "string", 
            "name": "string", 
            "detectedIngredients": ["string"] 
        }
        `;

        const visionResponse = await ai.models.generateContent({
            model: MODEL_VISION, // USE 2.5-FLASH FOR VISION (Proven reliability)
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64.split(',')[1] } },
                    { text: visionPrompt }
                ]
            },
            config: { responseMimeType: 'application/json' }
        });

        const visionData = parseJSONFromText(visionResponse.text || "{}");

        if (!visionData.name || visionData.name === "Unknown") {
            throw new Error("Could not identify product. Please try scanning closer.");
        }

        // STEP 2: SEARCH & REFINEMENT (Using 3 Flash for Search Grounding)
        const refinementPrompt = `
        PRODUCT: "${visionData.brand} ${visionData.name}"
        CONTEXT: User in MALAYSIA (Tropical Climate).
        USER METRICS: ${JSON.stringify(userMetrics)}
        CURRENT ROUTINE ACTIVES: [${routineActives.join(', ')}]

        TASK:
        1. SEARCH GOOGLE to confirm exact product & INCI ingredients.
        2. FIND MALAYSIAN PRICE (RM).
        3. ANALYZE suitability and ROUTINE CONFLICTS (e.g. Retinol vs Acid).
        4. Provide CLIMATE-AWARE usage tips.

        OUTPUT JSON:
        {
            "name": "Full Name",
            "brand": "Brand",
            "type": "CLEANSER | SERUM | ...",
            "ingredients": ["..."],
            "estimatedPrice": 0, // RM
            "suitabilityScore": 0,
            "risks": [{ "ingredient": "...", "riskLevel": "HIGH", "reason": "..." }],
            "benefits": [{ "ingredient": "...", "target": "...", "description": "...", "relevance": "HIGH" }],
            "usageTips": "Advice on layering with current routine and handling Malaysian humidity."
        }
        `;

        const finalResponse = await ai.models.generateContent({
            model: MODEL_PRODUCT_SEARCH, // UPGRADED TO 3-FLASH FOR SEARCH GROUNDING
            contents: refinementPrompt,
            config: { 
                tools: [{ googleSearch: {} }] 
            }
        });

        const data = parseJSONFromText(finalResponse.text || "{}");
        const sources = extractSources(finalResponse);
        
        if (!data.name) throw new Error("Analysis failed during refinement.");

        return {
            id: Date.now().toString(),
            name: data.name,
            brand: data.brand || visionData.brand, 
            type: data.type || "UNKNOWN",
            ingredients: data.ingredients || [],
            estimatedPrice: data.estimatedPrice || 0,
            suitabilityScore: data.suitabilityScore || 50,
            risks: data.risks || [],
            benefits: data.benefits || [],
            dateScanned: Date.now(),
            sources: sources,
            usageTips: data.usageTips
        };

    }, getFallbackProduct(userMetrics, "Scanned Product"), 60000); 
};

export const auditProduct = (product: Product, user: UserProfile) => {
    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    
    let adjustedScore = product.suitabilityScore;
    if (user.biometrics.redness < 50 && warnings.length > 0) adjustedScore -= 10;
    
    return {
        adjustedScore: Math.max(0, Math.min(100, adjustedScore)),
        warnings,
        analysisReason: warnings.length > 0 ? warnings[0].reason : "Good formulation match."
    };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const conflicts: string[] = [];
    const riskyProducts: any[] = [];
    const missing: string[] = [];
    const redundancies: string[] = [];
    const upgrades: string[] = [];
    
    const types = new Set(products.map(p => p.type));
    if (!types.has('CLEANSER')) missing.push('Cleanser');
    if (!types.has('SPF')) missing.push('SPF');
    if (!types.has('MOISTURIZER')) missing.push('Moisturizer');

    // Calculate Grade
    const avgScore = products.length > 0 ? products.reduce((acc, p) => acc + p.suitabilityScore, 0) / products.length : 0;
    let grade = 'C';
    if (avgScore > 85 && missing.length === 0) grade = 'S';
    else if (avgScore > 75) grade = 'A';
    else if (avgScore > 60) grade = 'B';

    products.forEach(p => {
        if (p.suitabilityScore < 50) {
            riskyProducts.push({ name: p.name, reason: "Low suitability score", severity: "CAUTION" });
        }
    });

    return {
        analysis: {
            grade,
            conflicts,
            riskyProducts,
            missing,
            redundancies,
            upgrades,
            balance: { 
                exfoliation: 50, 
                hydration: products.some(p => p.type === 'MOISTURIZER') ? 80 : 30, 
                protection: products.some(p => p.type === 'SPF') ? 90 : 20, 
                treatment: products.some(p => p.type === 'SERUM' || p.type === 'TREATMENT') ? 70 : 40 
            }
        }
    };
};

export const analyzeProductContext = (product: Product, shelf: Product[]) => {
    const typeCount = shelf.filter(p => p.type === product.type && p.id !== product.id).length;
    // Simple conflict detection (e.g. Retinol vs AHA)
    const conflicts: string[] = [];
    const ingredients = product.ingredients.join(' ').toLowerCase();
    
    shelf.forEach(p => {
        if (p.id === product.id) return;
        const pIng = p.ingredients.join(' ').toLowerCase();
        if (ingredients.includes('retinol') && (pIng.includes('glycolic') || pIng.includes('salicylic'))) {
            conflicts.push(`Retinol in ${product.name} vs Acids in ${p.name}`);
        }
    });

    return { conflicts, typeCount };
};

export const getClinicalTreatmentSuggestions = (user: UserProfile) => {
    const suggestions = [];
    const b = user.biometrics;

    if (b.acneActive < 70) suggestions.push({ type: 'FACIAL', name: 'Deep Pore Cleanse', benefit: 'Clears active congestion', downtime: 'None' });
    if (b.acneScars < 70) suggestions.push({ type: 'LASER', name: 'Microneedling', benefit: 'Smooths texture & scars', downtime: '1-3 Days' });
    if (b.pigmentation < 70) suggestions.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades dark spots', downtime: '2-4 Days' });
    if (b.wrinkleFine < 70) suggestions.push({ type: 'LASER', name: 'Fractional Laser', benefit: 'Stimulates collagen', downtime: '3-5 Days' });
    if (b.redness < 70) suggestions.push({ type: 'LASER', name: 'IPL Therapy', benefit: 'Reduces redness', downtime: 'None' });
    if (b.hydration < 60) suggestions.push({ type: 'FACIAL', name: 'Hydra-Infusion', benefit: 'Deep moisture boost', downtime: 'None' });
    if (b.poreSize < 65) suggestions.push({ type: 'PEEL', name: 'Carbon Laser Peel', benefit: 'Refines pore size', downtime: 'None' });

    if (suggestions.length < 2) {
        if (b.texture < 85) suggestions.push({ type: 'PEEL', name: 'Enzyme Exfoliation', benefit: 'Smooths surface texture', downtime: 'None' });
        if (b.sagging < 85) suggestions.push({ type: 'FACIAL', name: 'Microcurrent', benefit: 'Lifts and tones', downtime: 'None' });
        if (b.darkCircles < 80) suggestions.push({ type: 'FACIAL', name: 'Lymphatic Massage', benefit: 'Reduces puffiness', downtime: 'None' });
    }

    if (suggestions.length < 2) {
        suggestions.push({ type: 'FACIAL', name: 'LED Light Therapy', benefit: 'Maintains healthy glow', downtime: 'None' });
        suggestions.push({ type: 'FACIAL', name: 'Oxygen Facial', benefit: 'Event-ready radiance', downtime: 'None' });
    }

    const unique = suggestions.filter((v,i,a)=>a.findIndex(t=>(t.name===v.name))===i);
    return unique.slice(0, 3);
};

export const createDermatologistSession = (user: UserProfile, shelf: Product[]): Chat => {
    return ai.chats.create({
        model: MODEL_FACE_SCAN, // Using 2.5 Flash for Chat (Fast, low cost)
        config: {
             systemInstruction: `You are a helpful dermatologist. User metrics: ${JSON.stringify(user.biometrics)}. Shelf: ${JSON.stringify(shelf.map(p => p.name))}.`
        }
    });
};

export const isQuotaError = (e: any) => {
    return e?.message?.includes('429') || e?.status === 429;
};

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    const audit = auditProduct(product, user);
    let decision = 'CONSIDER';
    let color = 'zinc';
    
    if (audit.adjustedScore > 85 && audit.warnings.length === 0) { 
        decision = 'BUY'; color = 'emerald'; 
    } else if (audit.adjustedScore > 75) {
        decision = 'GREAT FIND'; color = 'teal';
    } else if (audit.adjustedScore < 40 || audit.warnings.some(w => w.severity === 'CRITICAL')) { 
        decision = 'AVOID'; color = 'rose'; 
    } else if (audit.adjustedScore < 60) {
        decision = 'CAUTION'; color = 'amber';
    }
    
    return {
        verdict: { decision, title: decision, description: audit.analysisReason, color },
        audit,
        shelfConflicts: [],
        comparison: { result: audit.adjustedScore > 70 ? 'BETTER' : 'NEUTRAL' }
    };
};

export const generateRoutineRecommendations = async (user: UserProfile): Promise<any> => {
    return runWithRetry<any>(async (ai) => {
        const prompt = `
        ACT AS AN EXPERT DERMATOLOGIST SPECIALIZING IN THE MALAYSIAN MARKET.
        User Profile: Age ${user.age}, Skin Type ${user.skinType}.
        Metrics: ${JSON.stringify(user.biometrics)}.
        Goals: ${JSON.stringify(user.preferences?.goals || [])}.

        TASK:
        Generate a comprehensive AM and PM skincare routine.
        For EACH step, provide 3 specific recommendations available in MALAYSIA (Watsons, Guardian, Sephora MY).
        Include Price in RM (Ringgit Malaysia).

        OUTPUT FORMAT (Strict JSON):
        {
          "am": [
            {
              "step": "Cleanser",
              "products": [
                { "name": "...", "brand": "...", "tier": "BUDGET", "price": "RM XX", "reason": "...", "rating": 95 },
                { "name": "...", "brand": "...", "tier": "VALUE", "price": "RM XX", "reason": "...", "rating": 98 },
                { "name": "...", "brand": "...", "tier": "LUXURY", "price": "RM XX", "reason": "...", "rating": 97 }
              ]
            }
          ],
          "pm": [ ... ]
        }
        `;

        const response = await ai.models.generateContent({
            model: MODEL_ROUTINE, // UPGRADED TO 3-PRO FOR BETTER JSON STRUCTURE & REASONING
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }] 
            }
        });

        return parseJSONFromText(response.text || "{}");
    }, null, 60000);
}
