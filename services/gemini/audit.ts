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

    const warnings = product.risks.map(r => ({ 
        severity: r.riskLevel === 'HIGH' ? 'CRITICAL' : 'CAUTION', 
        reason: r.reason 
    }));
    let adjustedScore = product.suitabilityScore;
    const ingStr = product.ingredients.join(' ').toLowerCase();
    const bio = user.biometrics;

    const prefs = user.preferences || {} as Partial<UserPreferences>;

    if (bio.hydration < 50 || prefs.onMedication) {
        const dryingAgents = ['alcohol denat', 'sd alcohol', 'isopropyl alcohol', 'sodium lauryl sulfate', 'sls'];
        const found = dryingAgents.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore -= 30;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, which dehydrates skin (Risky with medication/dryness).` });
        }
    }

    if (bio.redness < 50 || prefs.sensitivity === 'VERY_SENSITIVE' || prefs.hasEczema || prefs.onMedication) {
        const irritants = ['fragrance', 'parfum', 'alcohol denat', 'essential oil', 'menthol', 'peppermint'];
        const found = irritants.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 40);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, a known trigger for sensitive/medicated skin.` });
        }
    }

    if (bio.acneActive < 55) {
        const cloggers = ['coconut oil', 'cocoa butter', 'isopropyl myristate', 'algae extract', 'palm oil', 'wheat germ'];
        const found = cloggers.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 35);
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, a pore clogger.` });
        }
    }

    if (prefs.isPregnant) {
        const unsafe = ['retinol', 'retinyl', 'tretinoin', 'hydroquinone', 'arbutin', 'salicylic acid', 'adapalene', 'tazarotene', 'isotretinoin']; 
        const found = unsafe.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = 0;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, not recommended during pregnancy.` });
        }
    }

    return {
        adjustedScore: Math.max(0, Math.min(99, adjustedScore)),
        warnings,
        analysisReason: warnings.length > 0 ? warnings[0].reason : "Good match based on your profile."
    };
};

export const analyzeShelfHealth = (products: Product[], user: UserProfile) => {
    const missing = [];
    const types = new Set(products.map(p => p.type));
    if (!types.has('CLEANSER')) missing.push('Cleanser');
    if (!types.has('SPF')) missing.push('SPF');
    if (!types.has('MOISTURIZER')) missing.push('Moisturizer');
    
    let grade = 'B';
    const avg = products.reduce((a,b) => a + b.suitabilityScore, 0) / (products.length || 1);
    if (avg > 80 && missing.length === 0) grade = 'S';
    else if (avg > 70) grade = 'A';
    else if (avg < 50) grade = 'C';

    return {
        analysis: {
            grade, conflicts: [], riskyProducts: [], missing, redundancies: [], upgrades: [],
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
    if (user.biometrics.pigmentation < 70) s.push({ type: 'PEEL', name: 'Brightening Peel', benefit: 'Fades spots', downtime: '2 Days' });
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
