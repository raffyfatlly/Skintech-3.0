
import { Product, UserProfile, UserPreferences, ShelfAuditReport, SkinMetrics } from '../../types';

// --- SYNCHRONOUS HELPERS (NO AI CALLS) ---

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

    // 3. ACNE / OIL / PORE CHECK
    if (bio.acneActive < 55 || bio.oiliness < 50 || bio.pores < 50) {
        const cloggers = ['coconut oil', 'cocoa butter', 'isopropyl myristate', 'algae extract', 'palm oil', 'wheat germ'];
        const found = cloggers.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = Math.min(adjustedScore, 40);
            warnings.unshift({ severity: 'CAUTION', reason: `Contains ${found}, which can be heavy for your pores.` });
        }
    }

    // 4. PREGNANCY SAFETY
    if (prefs.isPregnant) {
        const unsafe = ['retinol', 'retinyl', 'tretinoin', 'hydroquinone', 'arbutin', 'salicylic acid', 'adapalene', 'tazarotene', 'isotretinoin']; 
        const found = unsafe.find(a => ingStr.includes(a));
        if (found) {
            adjustedScore = 0;
            warnings.unshift({ severity: 'CRITICAL', reason: `Contains ${found}, generally not recommended during pregnancy.` });
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
    const notes: any[] = [];
    let totalScore = 0;
    let count = 0;
    
    products.forEach(p => {
        const audit = auditProduct(p, user);
        totalScore += audit.adjustedScore;
        count++;
        
        // Soften the language. Only show top priority warnings.
        if (audit.warnings.length > 0) {
            // Prioritize CRITICAL, then take first CAUTION
            const mainWarning = audit.warnings.find(w => w.severity === 'CRITICAL') || audit.warnings[0];
            
            // Rephrase specifically for the "Coach" persona
            let tip = mainWarning.reason;
            if (mainWarning.severity === 'CRITICAL' && (user.preferences?.isPregnant)) {
                // Keep pregnancy warnings strict
            } else {
                // Soften others
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

    // Check for Retinol/Acid conflicts (Timing advice)
    const activeIngredients = products.flatMap(p => p.ingredients.join(' ').toLowerCase());
    const hasRetinol = activeIngredients.some(i => i.includes('retinol') || i.includes('tretinoin'));
    const hasAcids = activeIngredients.some(i => i.includes('glycolic') || i.includes('salicylic') || i.includes('lactic'));
    const hasVitC = activeIngredients.some(i => i.includes('ascorbic') || i.includes('vitamin c'));

    if (hasRetinol && hasAcids) {
        notes.push({ product: "Routine", note: "You have both Retinol and Acids. Use them on alternate nights to avoid irritation.", type: "TIMING" });
    } else if (hasRetinol && hasVitC) {
        notes.push({ product: "Routine", note: "Use Vitamin C in the morning and Retinol at night for best results.", type: "TIMING" });
    }

    // Pure Mathematical Average for Grade
    const avg = count > 0 ? totalScore / count : 0;
    
    let grade = 'C';
    if (products.length === 0) grade = '-';
    else if (avg >= 90) grade = 'S';
    else if (avg >= 80) grade = 'A';
    else if (avg >= 70) grade = 'B';
    else if (avg >= 60) grade = 'C';
    else grade = 'D';

    // Generate "Shelf Mind" Headline
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
            notes: notes.slice(0, 3), // Top 3 notes only
            missing,
        }
    };
};

export const runPostScanAudit = (user: UserProfile, shelf: Product[]): ShelfAuditReport | null => {
    const history = user.scanHistory || [];
    // Use latest scan (current) or biometrics if history is single
    const current = history.length > 0 ? history[history.length - 1] : user.biometrics;
    
    if (!current) return null;

    const prev = history.length > 1 ? history[history.length - 2] : null;
    const flags: any[] = [];

    // Thresholds
    const DROP_THRESHOLD = -5;
    const CRITICAL_THRESHOLD = 45;

    // Helper: Determine if a metric is problematic (either dropped significantly OR is absolutely bad)
    const getMetricStatus = (metric: keyof SkinMetrics) => {
        const currVal = current[metric] as number;
        const prevVal = prev ? prev[metric] as number : 100; // Default to 100 if no prev so we don't trigger "drop" on first scan
        
        const dropped = prev ? (currVal - prevVal) < DROP_THRESHOLD : false;
        const isBad = currVal < CRITICAL_THRESHOLD;
        
        return { 
            isIssue: dropped || isBad,
            reason: dropped ? 'dropped' : 'bad'
        };
    };

    const rednessState = getMetricStatus('redness');
    const hydrationState = getMetricStatus('hydration');
    const acneState = getMetricStatus('acneActive');

    // If no issues, return null
    if (!rednessState.isIssue && !hydrationState.isIssue && !acneState.isIssue) return null;

    // 2. Audit Products against Issues
    shelf.forEach(p => {
        const ingStr = p.ingredients.join(' ').toLowerCase();
        let flag = null;

        // A. REDNESS ISSUE (Sensitive)
        if (rednessState.isIssue) {
            const irritants = ['retinol', 'tretinoin', 'glycolic', 'salicylic', 'lactic', 'fragrance', 'alcohol', 'menthol', 'peppermint', 'eucalyptus'];
            const found = irritants.find(i => ingStr.includes(i));
            
            if (found) {
                const isEssential = p.type === 'CLEANSER' || p.type === 'MOISTURIZER';
                const hasAcneBenefit = p.benefits.some(b => b.target === 'acneActive') && (current.acneActive > 60);

                if (isEssential) {
                     flag = {
                        advice: 'BUFFER',
                        severity: 'CAUTION',
                        issue: `Redness ${rednessState.reason === 'dropped' ? 'spiked' : 'is critical'}. ${p.name} contains ${found}.`,
                        smartUsage: `Your skin is sensitive right now. Apply this over a thin layer of moisturizer to reduce irritation.`
                    };
                } else if (hasAcneBenefit) {
                    flag = {
                        advice: 'LESS_FREQ',
                        severity: 'CAUTION',
                        issue: `Redness ${rednessState.reason === 'dropped' ? 'spiked' : 'is high'}, but ${p.name} helps acne.`,
                        smartUsage: `Don't stop completely. Reduce use to every other day to manage redness while keeping acne in check.`
                    };
                } else {
                    flag = {
                        advice: 'PAUSE',
                        severity: 'CRITICAL',
                        issue: `Redness detected. ${found} in ${p.name} is a likely trigger.`,
                        smartUsage: `Pause use for 3-5 days until your Redness score improves.`
                    };
                }
            }
        }

        // B. HYDRATION ISSUE (Drying)
        if (!flag && hydrationState.isIssue) {
             const drying = ['alcohol denat', 'clay', 'charcoal', 'salicylic', 'benzoyl peroxide', 'sulfate'];
             const found = drying.find(i => ingStr.includes(i));
             
             if (found) {
                 if (p.type === 'CLEANSER') {
                     flag = {
                         advice: 'LESS_FREQ',
                         severity: 'CAUTION',
                         issue: `Hydration ${hydrationState.reason === 'dropped' ? 'dropped' : 'is low'}. ${p.name} might be stripping.`,
                         smartUsage: `Try washing your face only in the evening, or switch to a milk cleanser temporarily.`
                     };
                 } else {
                     flag = {
                         advice: 'BUFFER',
                         severity: 'CAUTION',
                         issue: `Skin is dehydrated. ${found} can worsen this.`,
                         smartUsage: `Apply this after your moisturizer (sandwich method) to lock in water.`
                     };
                 }
             }
        }

        if (flag) {
            flags.push({
                productId: p.id,
                productName: p.name,
                productType: p.type,
                ...flag
            });
        }
    });

    if (flags.length === 0) return null;

    return {
        timestamp: Date.now(),
        flags
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