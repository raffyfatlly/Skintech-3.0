
import { Product, UserProfile, UserPreferences } from '../../types';

// --- SYNCHRONOUS HELPERS (NO AI CALLS) ---

export const auditProduct = (product: Product, user: UserProfile) => {
    if (!product.ingredients || product.ingredients.length === 0) {
        return {
            adjustedScore: 0,
            warnings: [{ severity: 'CAUTION', reason: "Ingredients list could not be retrieved." }],
            analysisReason: "We could not access the ingredient data for this product."
        };
    }

    const bio = user.biometrics;
    const prefs = user.preferences || {} as Partial<UserPreferences>;
    const ingStr = product.ingredients.join(' ').toLowerCase();

    // --- STEP 1: SMART FILTERING OF GENERIC RISKS ---
    // Filter out risks that aren't relevant to the user's specific high-performing metrics.
    const relevantRisks = (product.risks || []).filter(risk => {
        const txt = (risk.reason + ' ' + risk.ingredient).toLowerCase();
        
        // ALWAYS KEEP: Critical safety risks (Pregnancy, Hormone disruptors, High risk items)
        if (risk.riskLevel === 'HIGH') return true;

        // FILTER: Dryness concerns
        // If user has excellent hydration (>70), mild drying warnings are noise.
        if (txt.match(/dry|dehydrat|strip|alcohol/)) {
            if (bio.hydration > 70) return false;
        }

        // FILTER: Sensitivity concerns
        // If user has a strong barrier (Redness > 70), generic irritation warnings are preventative cautions, not active risks.
        // We filter these out to avoid lowering the score artificially, unless user has Eczema (chronic).
        if (txt.match(/irritat|sensitiv|redness|tingl|burn/)) {
            if (bio.redness > 70 && !prefs.hasEczema) return false;
        }

        // FILTER: Oily Skin concerns
        // If user has balanced oil (Oiliness Score > 70) and Clear Skin (Acne > 70)
        // Note: High Oiliness Score = Balanced/Matte. Low Score = Oily.
        if (txt.match(/oily|greas|shine/)) {
            if (bio.oiliness > 70) return false;
        }

        // FILTER: Clogging concerns (Comedogenic)
        // If user has perfect texture/pores/acne, they are likely resilient to mild cloggers
        if (txt.match(/clog|pore|comedogen|acne/)) {
            if (bio.acneActive > 75 && bio.pores > 70) return false;
        }

        return true;
    });

    // Start with base score
    let adjustedScore = product.suitabilityScore;

    // Initialize warnings with the filtered relevant risks
    const warnings = relevantRisks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));

    // --- STEP 2: HARD RULES (OVERRIDES) ---
    // These specific checks ensure we catch critical mismatches even if the generic list missed them.

    // 1. HYDRATION / DEHYDRATION CHECK
    if (bio.hydration < 50 || prefs.onMedication) {
        const dryingAgents = ['alcohol denat', 'sd alcohol', 'isopropyl alcohol', 'sodium lauryl sulfate', 'sls'];
        const found = dryingAgents.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore -= 30;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, which exacerbates dehydration.` });
        }
    }

    // 2. REDNESS / SENSITIVITY CHECK
    // Logic: Only punish score heavily if skin is ACTIVELY inflamed (Redness < 60) or Eczema present.
    // If user is just "Sensitive" but skin is calm (Redness > 60), apply mild penalty only.
    const irritants = ['fragrance', 'parfum', 'alcohol denat', 'essential oil', 'menthol', 'peppermint', 'eucalyptus'];
    const foundIrritant = irritants.find(a => ingStr.includes(a));

    if (foundIrritant) {
        if (bio.redness < 60 || prefs.hasEczema || prefs.onMedication) {
            // Critical: Active inflammation or condition
            adjustedScore = Math.min(adjustedScore, 40);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${foundIrritant}, a trigger for redness/sensitivity.` });
        } else if (prefs.sensitivity === 'VERY_SENSITIVE') {
            // Caution: Preventative
            adjustedScore -= 15; 
            warnings.push({ severity: 'CAUTION', reason: `Contains ${foundIrritant}, use with caution on sensitive skin.` });
        }
    }

    // 3. ACNE / OIL / PORE CHECK
    // Only apply strict penalties if the user actually has a problem (Score < 55)
    if (bio.acneActive < 55 || bio.oiliness < 50 || bio.pores < 50) {
        const cloggers = ['coconut oil', 'cocoa butter', 'isopropyl myristate', 'algae extract', 'palm oil', 'wheat germ'];
        const found = cloggers.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 35);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, which can clog pores.` });
        }
    }

    // 4. PREGNANCY SAFETY
    if (prefs.isPregnant) {
        const unsafe = ['retinol', 'retinyl', 'tretinoin', 'hydroquinone', 'arbutin', 'salicylic acid', 'adapalene', 'tazarotene', 'isotretinoin']; 
        const found = unsafe.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = 0;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, not recommended during pregnancy.` });
        }
    }

    // Deduplicate warnings
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
    
    // Calculate Safety & Risks
    const riskyProducts: any[] = [];
    let totalScore = 0;
    
    products.forEach(p => {
        const audit = auditProduct(p, user);
        totalScore += audit.adjustedScore;
        
        if (audit.warnings.length > 0) {
            // Aggregate all warnings
            audit.warnings.forEach(w => {
                riskyProducts.push({
                    name: p.name,
                    reason: w.reason,
                    severity: w.severity
                });
            });
        }
    });

    let grade = 'B';
    const avg = products.length > 0 ? totalScore / products.length : 0;
    
    // Grading Logic
    if (riskyProducts.some(r => r.severity === 'CRITICAL')) {
        grade = 'D'; // Downgrade if safety risks exist
    } else if (avg > 85 && missing.length === 0) {
        grade = 'S';
    } else if (avg > 75) {
        grade = 'A';
    } else if (avg < 50) {
        grade = 'C';
    }

    return {
        analysis: {
            grade, 
            conflicts: [], 
            riskyProducts: riskyProducts.slice(0, 3), // Top 3 risks
            missing, 
            redundancies: [], 
            upgrades: [],
            balance: { exfoliation: 50, hydration: 50, protection: 50, treatment: 50 }
        }
    };
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
