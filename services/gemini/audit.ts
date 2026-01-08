
import { Product, UserProfile, UserPreferences, ShelfAuditReport, SkinMetrics } from '../../types';
import { runWithTimeout, parseJSONFromText, getAi, MODEL_FAST, SAFETY_SETTINGS_NONE } from './core';

// --- SYNCHRONOUS HELPERS (NO AI CALLS) ---
// Used for instant UI feedback on the Smart Shelf cards

export const auditProduct = (product: Product, user: UserProfile) => {
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            adjustedScore: 50, // Neutral score for unknown
            warnings: [{ severity: 'CAUTION', reason: "Ingredients list could not be retrieved." }],
            analysisReason: "We could not access the ingredient data for this product."
        };
    }

    const bio = user.biometrics;
    const prefs = user.preferences || {} as Partial<UserPreferences>;
    const ingStr = product.ingredients.join(' ').toLowerCase();

    // --- STEP 1: SMART FILTERING OF GENERIC RISKS ---
    const relevantRisks = (product.risks || []).filter(risk => {
        const txt = (risk.reason + ' ' + risk.ingredient).toLowerCase();
        
        if (risk.riskLevel === 'HIGH') return true;

        // Filter out dryness warnings if hydration is good
        if (txt.match(/dry|dehydrat|strip|alcohol/)) {
            if (bio.hydration > 70) return false;
        }

        // Filter out sensitivity warnings if redness is low (good)
        if (txt.match(/irritat|sensitiv|redness|tingl|burn/)) {
            if (bio.redness > 70 && !prefs.hasEczema) return false;
        }

        // Filter out oily skin warnings if balanced
        if (txt.match(/oily|greas|shine/)) {
            if (bio.oiliness > 70) return false;
        }

        return true;
    });

    let adjustedScore = product.suitabilityScore;

    const warnings = relevantRisks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));

    // --- STEP 2: HARD RULES (OVERRIDES) ---
    // 1. HYDRATION / DEHYDRATION CHECK
    if (bio.hydration < 50 || prefs.onMedication) {
        // Specifically look for drying alcohols, NOT fatty alcohols
        const dryingAgents = ['alcohol denat', 'sd alcohol', 'isopropyl alcohol', 'sodium lauryl sulfate', 'sls'];
        const found = dryingAgents.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore -= 30;
            warnings.unshift({ severity: 'CAUTION', reason: `Might be drying due to ${found}. Ensure you moisturize well.` });
        }
    }

    // 2. REDNESS / SENSITIVITY CHECK
    const irritants = ['fragrance', 'parfum', 'alcohol denat', 'essential oil', 'menthol', 'peppermint', 'eucalyptus'];
    const foundIrritant = irritants.find(a => ingStr.includes(a));

    if (foundIrritant) {
        if (bio.redness < 60 || prefs.hasEczema || prefs.onMedication) {
            adjustedScore = Math.min(adjustedScore, 45);
            warnings.unshift({ severity: 'CAUTION', reason: `Contains ${foundIrritant}, which might trigger redness.` });
        } else if (prefs.sensitivity === 'VERY_SENSITIVE') {
            adjustedScore -= 15; 
            warnings.push({ severity: 'CAUTION', reason: `Contains ${foundIrritant}, monitor for sensitivity.` });
        }
    }

    // 3. PREGNANCY SAFETY
    if (prefs.isPregnant) {
        const unsafe = ['retinol', 'retinyl', 'tretinoin', 'hydroquinone', 'arbutin', 'salicylic acid', 'adapalene', 'tazarotene', 'isotretinoin']; 
        const found = unsafe.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = 0;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, generally not recommended during pregnancy.` });
        }
    }

    const uniqueWarnings = warnings.filter((w, index, self) => 
        index === self.findIndex((t) => (
            t.reason === w.reason
        ))
    );

    return {
        adjustedScore: Math.max(0, Math.min(99, adjustedScore)),
        warnings: uniqueWarnings,
        analysisReason: uniqueWarnings.length > 0 ? uniqueWarnings[0].reason : "Good match based on your profile."
    };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const missing = [];
    const types = new Set(products.map(p => p.type));
    if (!types.has('CLEANSER')) missing.push('Cleanser');
    if (!types.has('SPF')) missing.push('SPF');
    if (!types.has('MOISTURIZER')) missing.push('Moisturizer');
    
    const notes: any[] = [];
    let totalScore = 0;
    let count = 0;
    
    products.forEach(p => {
        const audit = auditProduct(p, user);
        totalScore += audit.adjustedScore;
        count++;
        
        if (audit.warnings.length > 0) {
            const mainWarning = audit.warnings.find(w => w.severity === 'CRITICAL') || audit.warnings[0];
            let tip = mainWarning.reason;
            if (mainWarning.severity === 'CRITICAL' && (user.preferences?.isPregnant)) {
                // Keep strict
            } else {
                if (tip.includes("Contains")) tip = `Use ${p.name} mindfully. ${tip.toLowerCase()}`;
                else tip = `${p.name}: ${tip}`;
            }

            notes.push({
                product: p.name,
                note: tip,
                type: mainWarning.severity === 'CRITICAL' ? 'SWAP' : 'MONITOR'
            });
        }
    });

    const activeIngredients = products.flatMap(p => p.ingredients.join(' ').toLowerCase());
    const hasRetinol = activeIngredients.some(i => i.includes('retinol') || i.includes('tretinoin'));
    const hasAcids = activeIngredients.some(i => i.includes('glycolic') || i.includes('salicylic') || i.includes('lactic'));
    const hasVitC = activeIngredients.some(i => i.includes('ascorbic') || i.includes('vitamin c'));

    if (hasRetinol && hasAcids) {
        notes.push({ product: "Routine", note: "You have both Retinol and Acids. Use them on alternate nights to avoid irritation.", type: "TIMING" });
    } else if (hasRetinol && hasVitC) {
        notes.push({ product: "Routine", note: "Use Vitamin C in the morning and Retinol at night for best results.", type: "TIMING" });
    }

    const avg = count > 0 ? totalScore / count : 0;
    let grade = 'C';
    if (products.length === 0) grade = '-';
    else if (avg >= 90) grade = 'S';
    else if (avg >= 80) grade = 'A';
    else if (avg >= 70) grade = 'B';
    else if (avg >= 60) grade = 'C';
    else grade = 'D';

    let headline = "Shelf Analysis";
    if (grade === 'S') headline = "Perfectly balanced.";
    else if (grade === 'A') headline = "Great setup. Keep it up.";
    else if (grade === 'B') headline = "Solid routine with room to improve.";
    else if (grade === 'C') headline = "Some products may be mismatched.";
    else if (grade === 'D') headline = "Routine needs adjustment.";
    else headline = "Start by adding products.";

    if (notes.length > 2 && grade !== 'S' && grade !== 'A') {
        headline = "Let's refine your product choices.";
    }

    return {
        analysis: {
            grade, 
            headline,
            averageScore: Math.round(avg),
            notes: notes.slice(0, 3), 
            missing,
        }
    };
};

// --- ASYNC AI AUDIT (Triggered on Scan Complete) ---
export const runPostScanAudit = async (user: UserProfile, shelf: Product[]): Promise<ShelfAuditReport | null> => {
    return runWithTimeout<ShelfAuditReport | null>(async (ai) => {
        const history = user.scanHistory || [];
        const current = history.length > 0 ? history[history.length - 1] : user.biometrics;
        if (!current) return null;

        const prev = history.length > 1 ? history[history.length - 2] : null;

        // 1. Detect Shifts (Positive and Negative)
        const changes = [];
        const improvements = [];

        if (prev) {
            // Negative Shifts
            if (current.redness < prev.redness - 10) changes.push(`Redness worsened significantly (Score dropped from ${prev.redness} to ${current.redness})`);
            if (current.hydration < prev.hydration - 10) changes.push(`Hydration dropped (Score from ${prev.hydration} to ${current.hydration})`);
            if (current.acneActive < prev.acneActive - 10) changes.push(`Breakouts increased (Score from ${prev.acneActive} to ${current.acneActive})`);
            
            // Positive Shifts (Improvements)
            if (current.redness > prev.redness + 15) improvements.push(`Redness improved significantly (Score rose from ${prev.redness} to ${current.redness})`);
            if (current.hydration > prev.hydration + 15) improvements.push(`Hydration improved (Score rose from ${prev.hydration} to ${current.hydration})`);
            if (current.acneActive > prev.acneActive + 15) improvements.push(`Acne clearing up (Score rose from ${prev.acneActive} to ${current.acneActive})`);
        } else {
            // No history, check for critical current states
            if (current.redness < 45) changes.push(`Severe Redness/Sensitivity detected (Score ${current.redness})`);
            if (current.hydration < 40) changes.push(`Severe Dehydration detected (Score ${current.hydration})`);
            if (current.acneActive < 45) changes.push(`Active Breakouts detected (Score ${current.acneActive})`);
        }

        // If nothing happened, return null
        if (changes.length === 0 && improvements.length === 0) return null;

        // 2. Prepare Context for AI
        const shelfContext = shelf.map(p => ({
            id: p.id,
            name: p.name,
            brand: p.brand || "Unknown",
            type: p.type,
            // Send first 30 ingredients
            ingredients: p.ingredients.slice(0, 30).join(', ')
        }));

        const prompt = `
        ACT AS AN ELITE DERMATOLOGIST.
        
        TASK: Audit the user's skincare routine based on their LATEST SKIN CHANGES.
        
        CONTEXT:
        The user just scanned their face. 
        NEGATIVE CHANGES (WORSENED): ${changes.length > 0 ? changes.join(' AND ') : 'None'}.
        POSITIVE CHANGES (IMPROVED): ${improvements.length > 0 ? improvements.join(' AND ') : 'None'}.
        
        ROUTINE (Shelf):
        ${JSON.stringify(shelfContext)}
        
        INSTRUCTIONS:
        1. Identify products that relate to the changes.
        2. IF WORSENED: Identify culprits. Suggest pausing or limiting usage.
           - BE SMART: Do not flag fatty alcohols (Cetearyl) as drying. Flag Alcohol Denat.
           - Focus on irritants for redness, cloggers for acne.
        3. IF IMPROVED: Identify if any *restricted* products can be safely re-introduced or increased.
           - Example: If Redness improved significantly, maybe they can resume using Retinol or Acids cautiously.
           - Example: If Hydration improved, they can maybe switch from a heavy balm to a lighter lotion if they prefer.
           - ONLY suggest this if the product contains strong actives (Retinol, AHA/BHA) that might have been paused previously.
        
        OUTPUT JSON:
        {
            "flags": [
                {
                    "productId": "id_from_input",
                    "productName": "string",
                    "productType": "string",
                    "issue": "Explanation referencing the specific change (e.g. 'Since redness improved...')",
                    "severity": "CRITICAL" | "CAUTION",
                    "advice": "PAUSE" | "LIMIT" | "MONITOR" | "BUFFER" | "LESS_FREQ" | "RESUME",
                    "smartUsage": "Specific actionable tip (e.g. 'Skip this morning', 'You can now use this 2x a week', 'Pause until redness subsides')"
                }
            ]
        }
        Return "flags": [] if no products need adjustment.
        `;

        try {
            const response = await ai.models.generateContent({
                model: MODEL_FAST,
                contents: prompt,
                config: { 
                    responseMimeType: 'application/json',
                    safetySettings: SAFETY_SETTINGS_NONE 
                }
            });

            const result = parseJSONFromText(response.text || "{}");
            
            if (result.flags && Array.isArray(result.flags) && result.flags.length > 0) {
                return {
                    timestamp: Date.now(),
                    flags: result.flags
                };
            }
            return null;

        } catch (e) {
            console.error("AI Audit Failed", e);
            return null;
        }
    }, 45000);
};

export const analyzeProductContext = (product: Product, shelf: Product[]) => {
    const typeCount = shelf.filter(p => p.type === product.type && p.id !== product.id).length;
    const conflicts: string[] = [];
    const ing = product.ingredients.join(' ').toLowerCase();
    shelf.forEach(p => {
        if (p.id === product.id) return;
        const pIng = p.ingredients.join(' ').toLowerCase();
        if (ing.includes('retinol') && (pIng.includes('acid') || pIng.includes('salicylic'))) {
            conflicts.push(`Retinol + Acid conflict with ${p.name}`);
        }
    });
    return { conflicts, typeCount };
};

export const getClinicalTreatmentSuggestions = (user: UserProfile) => {
    const s = [];
    if (user.biometrics.acneActive < 70) s.push({ type: 'FACIAL', name: 'Deep Cleanse', benefit: 'Clears congestion', downtime: 'None' });
    if (user.biometrics.darkSpots < 70) s.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades spots', downtime: '2 Days' });
    return s;
};

export const getBuyingDecision = (product: Product, shelf: Product[], user: UserProfile) => {
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            verdict: { 
                decision: 'UNKNOWN', 
                title: 'Info Unavailable', 
                description: "We couldn't retrieve the ingredients for this product.", 
                color: 'zinc' 
            },
            audit: { adjustedScore: 0, warnings: [], analysisReason: "Ingredients missing." },
            shelfConflicts: [],
            comparison: { result: 'NEUTRAL' }
        };
    }

    const audit = auditProduct(product, user);
    let decision = 'CONSIDER';
    const hasCriticalWarnings = audit.warnings.some(w => w.severity === 'CRITICAL');

    if (audit.adjustedScore >= 75 && !hasCriticalWarnings) {
        decision = 'BUY';
    } else if (audit.adjustedScore < 45 || hasCriticalWarnings) {
        decision = 'AVOID';
    }
    
    return {
        verdict: { decision, title: decision, description: audit.analysisReason, color: decision === 'BUY' ? 'emerald' : 'amber' },
        audit,
        shelfConflicts: [],
        comparison: { result: 'NEUTRAL' }
    };
};
