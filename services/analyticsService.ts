
import { db } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';

const GLOBAL_EVENTS_COLLECTION = 'analytics_events';

// --- TYPES ---
export interface ValidationMetrics {
  totalUsers: number;
  activeUsers24h: number;
  retentionRate: number; // Used for "Total Subscribers" count
  totalScans: number;
  avgScansPerUser: number; 
  paywallHitRate: number; // Conversion Rate (Paid / Visits)
  trustScore: number; 
  apiCostEst: number; 
  mostScannedBrands: { name: string, count: number }[];
  localStats: {
      myScans: number;
      myShelfSize: number;
      mySpendPotential: number; // Real Revenue
  }
}

export interface LiveEvent {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  meta?: string;
  userAgent?: string;
}

export interface DailyMetric {
    date: string;
    scans: number;
    actions: number;
    visits: number; // New: Unique Visits
    conversions: number; // New: Paid Subscribers
}

// --- UTILS ---
const getAnonymousId = () => {
    let id = localStorage.getItem('skinos_anon_id');
    if (!id) {
        id = 'anon_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        localStorage.setItem('skinos_anon_id', id);
    }
    return id;
};

// --- GLOBAL EVENT TRACKING (FIRESTORE) ---
export const trackEvent = async (eventName: string, meta: any = {}) => {
    // 1. Log to console for dev visibility
    // console.log(`[Analytics] ${eventName}`, meta);

    if (!db) return;

    try {
        const payload = {
            action: eventName,
            timestamp: Date.now(),
            meta: typeof meta === 'string' ? meta : JSON.stringify(meta),
            userId: localStorage.getItem('skinos_user_uid') || 'unauth', // If logged in
            anonId: getAnonymousId(), // Always present for unique visitor tracking
            userAgent: navigator.userAgent
        };

        // Fire and forget - don't await to avoid blocking UI
        addDoc(collection(db, GLOBAL_EVENTS_COLLECTION), payload).catch(err => 
            console.error("Analytics Write Fail (Check Firestore Rules)", err)
        );
        
    } catch (e) {
        console.error("Analytics Error", e);
    }
};

// --- DATA AGGREGATION ---

export const getDailyTrends = async (): Promise<DailyMetric[]> => {
    if (!db) return [];

    // Query last 1000 events to build the trend
    const q = query(collection(db, GLOBAL_EVENTS_COLLECTION), orderBy('timestamp', 'desc'), limit(1500));
    
    try {
        const snapshot = await getDocs(q);
        const days: Record<string, DailyMetric> = {};
        
        // Initialize last 7 days
        for (let i=6; i>=0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString(undefined, { weekday: 'short' });
            days[key] = { date: key, scans: 0, actions: 0, visits: 0, conversions: 0 };
        }

        const processedVisits = new Set<string>(); // composite key: date + anonId

        snapshot.forEach(doc => {
            const data = doc.data();
            const d = new Date(data.timestamp);
            const key = d.toLocaleDateString(undefined, { weekday: 'short' });
            const dateStr = d.toDateString(); // Full date for unique checking

            // Filter: Only last 7 days
            const diffTime = Math.abs(Date.now() - data.timestamp);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays <= 7 && days[key]) {
                days[key].actions++;
                
                // Track Unique Visits (Deduped by AnonID per day)
                if (data.action === 'APP_VISIT') {
                    const uniqueKey = `${dateStr}_${data.anonId || 'unknown'}`;
                    if (!processedVisits.has(uniqueKey)) {
                        days[key].visits++;
                        processedVisits.add(uniqueKey);
                    }
                }
                
                // Track Conversions
                if (data.action === 'PAYMENT_SUCCESS_CLOUD' || data.action === 'PAYMENT_SUCCESS_LOCAL' || data.action === 'CODE_REDEEMED') {
                    days[key].conversions++;
                }

                // Track Scans
                if (data.action.includes('SCAN') || data.action.includes('PRODUCT_FOUND')) {
                    days[key].scans++;
                }
            }
        });

        return Object.values(days);
    } catch (e) {
        console.error("Failed to fetch trends", e);
        return [];
    }
};

export const getAdminStats = async (): Promise<ValidationMetrics> => {
    if (!db) return { 
        totalUsers: 0, activeUsers24h: 0, retentionRate: 0, totalScans: 0, 
        avgScansPerUser: 0, paywallHitRate: 0, trustScore: 0, apiCostEst: 0, 
        mostScannedBrands: [], localStats: { myScans: 0, myShelfSize: 0, mySpendPotential: 0 } 
    };

    try {
        // Fetch recent events
        const q = query(collection(db, GLOBAL_EVENTS_COLLECTION), orderBy('timestamp', 'desc'), limit(2000));
        const snapshot = await getDocs(q);
        const events = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as any[];

        // 1. Active Users 24h (Unique Anon IDs in last 24h)
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const activeUsers = new Set(
            events.filter(e => (now - e.timestamp) < oneDayMs).map(e => e.anonId || e.userId)
        );

        // 2. Scan Counts
        const scanEvents = events.filter(e => e.action === 'FACE_SCAN_COMPLETE' || e.action === 'PRODUCT_FOUND' || e.action === 'SCAN_PRODUCT');
        const totalScans = scanEvents.length;

        // 3. Conversion Logic
        // Visitors = Unique AnonIDs who fired APP_VISIT
        const visitors = new Set(events.filter(e => e.action === 'APP_VISIT').map(e => e.anonId)).size;
        const subscribers = events.filter(e => e.action === 'PAYMENT_SUCCESS_CLOUD' || e.action === 'PAYMENT_SUCCESS_LOCAL' || e.action === 'CODE_REDEEMED').length;
        
        // Conversion Rate: Subscribers / Unique Visitors
        const conversionRate = visitors > 0 ? (subscribers / visitors) * 100 : 0;

        // 4. Trust Score (Discards vs Scans)
        const discards = events.filter(e => e.action === 'DISCARD_PRODUCT').length;
        const productScans = events.filter(e => e.action === 'PRODUCT_FOUND').length;
        const trustScore = productScans > 0 ? Math.round((discards / productScans) * 100) : 0;

        // 5. API Cost Estimation
        const faceScans = events.filter(e => e.action === 'FACE_SCAN_COMPLETE').length;
        const prodScans = events.filter(e => e.action === 'PRODUCT_FOUND').length;
        const chatMsgs = events.filter(e => e.action === 'CHAT_SENT').length;
        const estCost = (faceScans * 0.004) + (prodScans * 0.002) + (chatMsgs * 0.001);

        // 6. Brand Extraction
        const brandCounts: Record<string, number> = {};
        events.forEach(e => {
            if (e.action === 'PRODUCT_FOUND' && e.meta) {
                try {
                    const metaObj = typeof e.meta === 'string' ? JSON.parse(e.meta) : e.meta;
                    if (metaObj.name) {
                        // Extract brand heuristically if not explicit
                        const firstWord = metaObj.brand && metaObj.brand !== 'Unknown' ? metaObj.brand : metaObj.name.split(' ')[0]; 
                        if (firstWord.length > 2) {
                            brandCounts[firstWord] = (brandCounts[firstWord] || 0) + 1;
                        }
                    }
                } catch (err) {}
            }
        });
        
        const sortedBrands = Object.entries(brandCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([name, count]) => ({ name, count }));

        return {
            totalUsers: activeUsers.size, // Proxy for MAU/DAU in this view
            activeUsers24h: activeUsers.size,
            retentionRate: subscribers, // Hijacking field for Total Sales
            totalScans,
            avgScansPerUser: visitors > 0 ? Number((totalScans / visitors).toFixed(1)) : 0,
            paywallHitRate: Number(conversionRate.toFixed(1)),
            trustScore: Math.min(100, Math.max(0, trustScore)),
            apiCostEst: Number(estCost.toFixed(4)),
            mostScannedBrands: sortedBrands.length > 0 ? sortedBrands : [{ name: "No Data", count: 0 }],
            localStats: {
                myScans: totalScans, 
                myShelfSize: 0, 
                mySpendPotential: subscribers * 9.90 // Revenue
            }
        };
    } catch (e) {
        console.error("Admin Stats Error", e);
        return { 
            totalUsers: 0, activeUsers24h: 0, retentionRate: 0, totalScans: 0, 
            avgScansPerUser: 0, paywallHitRate: 0, trustScore: 0, apiCostEst: 0, 
            mostScannedBrands: [], localStats: { myScans: 0, myShelfSize: 0, mySpendPotential: 0 } 
        };
    }
};

export const getLiveFeed = async (): Promise<LiveEvent[]> => {
    if (!db) return [];
    try {
        const q = query(collection(db, GLOBAL_EVENTS_COLLECTION), orderBy('timestamp', 'desc'), limit(20));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as LiveEvent[];
    } catch (e) {
        console.error("Feed Error", e);
        return [];
    }
};
