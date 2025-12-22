
import { db } from './firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, where, Timestamp, getCountFromServer } from 'firebase/firestore';

const GLOBAL_EVENTS_COLLECTION = 'analytics_events';

// --- TYPES ---
export interface ValidationMetrics {
  totalUsers: number; // Active Visitors in Range
  registeredUsers: number; // Total Registered
  totalPremium: number; // Total Paid Users
  isExactCount: boolean; // True if DB access worked, False if estimated from events
  activeUsers24h: number;
  retentionRate: number; 
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

        // Fire and forget
        addDoc(collection(db, GLOBAL_EVENTS_COLLECTION), payload).catch(err => 
            console.error("Analytics Write Fail", err)
        );
        
    } catch (e) {
        console.error("Analytics Error", e);
    }
};

// --- DATA AGGREGATION ---

export const getDailyTrends = async (): Promise<DailyMetric[]> => {
    if (!db) return [];

    // Query recent events to build the trend
    const q = query(collection(db, GLOBAL_EVENTS_COLLECTION), orderBy('timestamp', 'desc'), limit(2000));
    
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

        const processedVisits = new Set<string>();

        snapshot.forEach(doc => {
            const data = doc.data();
            const d = new Date(data.timestamp);
            const key = d.toLocaleDateString(undefined, { weekday: 'short' });
            const dateStr = d.toDateString();

            const diffTime = Math.abs(Date.now() - data.timestamp);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays <= 7 && days[key]) {
                days[key].actions++;
                
                if (data.action === 'APP_VISIT') {
                    const uniqueKey = `${dateStr}_${data.anonId || 'unknown'}`;
                    if (!processedVisits.has(uniqueKey)) {
                        days[key].visits++;
                        processedVisits.add(uniqueKey);
                    }
                }
                
                if (data.action.includes('PAYMENT') || data.action === 'CODE_REDEEMED') {
                    days[key].conversions++;
                }

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

export const getAdminStats = async (timeRange: '24h' | '7d' | '30d' | 'all' = '24h'): Promise<ValidationMetrics> => {
    if (!db) return { 
        totalUsers: 0, registeredUsers: 0, totalPremium: 0, isExactCount: false, activeUsers24h: 0, retentionRate: 0, totalScans: 0, 
        avgScansPerUser: 0, paywallHitRate: 0, trustScore: 0, apiCostEst: 0, 
        mostScannedBrands: [], localStats: { myScans: 0, myShelfSize: 0, mySpendPotential: 0 } 
    };

    try {
        // 1. Determine Start Date based on Filter
        let startTime = 0;
        const now = Date.now();
        if (timeRange === '24h') startTime = now - (24 * 60 * 60 * 1000);
        else if (timeRange === '7d') startTime = now - (7 * 24 * 60 * 60 * 1000);
        else if (timeRange === '30d') startTime = now - (30 * 24 * 60 * 60 * 1000);
        else startTime = 0; // All time

        // 2. Fetch Events
        // INCREASE LIMIT TO 10,000 for 'all' to ensure deep history scan
        const limitCount = timeRange === 'all' ? 10000 : 2500;
        
        const q = query(collection(db, GLOBAL_EVENTS_COLLECTION), orderBy('timestamp', 'desc'), limit(limitCount));
        const snapshot = await getDocs(q);
        
        let events = snapshot.docs.map(d => ({ ...d.data(), id: d.id })) as any[];

        // Filter by time range client-side
        if (startTime > 0) {
            events = events.filter(e => e.timestamp >= startTime);
        }

        // --- METRIC CALCULATION ---

        // 1. Visitors (Unique Anon IDs)
        const visitors = new Set(events.filter(e => e.action === 'APP_VISIT').map(e => e.anonId)).size;
        
        // 2. Scan Counts
        const scanEvents = events.filter(e => e.action === 'FACE_SCAN_COMPLETE' || e.action === 'PRODUCT_FOUND' || e.action === 'SCAN_PRODUCT');
        const totalScans = scanEvents.length;

        // 3. Paid Subscribers (From Events - Fallback)
        const subscriberSet = new Set();
        events.forEach(e => {
            if (e.action === 'PAYMENT_SUCCESS_CLOUD' || e.action === 'PAYMENT_SUCCESS_LOCAL' || e.action === 'CODE_REDEEMED') {
                subscriberSet.add(e.userId && e.userId !== 'unauth' ? e.userId : e.anonId);
            }
        });
        const subscribersFromEvents = subscriberSet.size;
        
        // 4. Conversion Rate
        const conversionRate = visitors > 0 ? (subscribersFromEvents / visitors) * 100 : 0;

        // 5. Trust Score
        const discards = events.filter(e => e.action === 'DISCARD_PRODUCT').length;
        const productScans = events.filter(e => e.action === 'PRODUCT_FOUND').length;
        const trustScore = productScans > 0 ? Math.round((discards / productScans) * 100) : 0;

        // 6. API Cost
        const faceScans = events.filter(e => e.action === 'FACE_SCAN_COMPLETE').length;
        const prodScans = events.filter(e => e.action === 'PRODUCT_FOUND').length;
        const chatMsgs = events.filter(e => e.action === 'CHAT_SENT').length;
        const estCost = (faceScans * 0.004) + (prodScans * 0.002) + (chatMsgs * 0.001);

        // 7. Brand Data
        const brandCounts: Record<string, number> = {};
        events.forEach(e => {
            if (e.action === 'PRODUCT_FOUND' && e.meta) {
                try {
                    const metaObj = typeof e.meta === 'string' ? JSON.parse(e.meta) : e.meta;
                    if (metaObj.name) {
                        const firstWord = metaObj.brand && metaObj.brand !== 'Unknown' ? metaObj.brand : metaObj.name.split(' ')[0]; 
                        if (firstWord.length > 2) brandCounts[firstWord] = (brandCounts[firstWord] || 0) + 1;
                    }
                } catch (err) {}
            }
        });
        const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count }));

        // 8. REAL REGISTERED USER & PREMIUM COUNT (Try DB -> Fallback to Events)
        let registeredUsers = 0;
        let totalPremium = 0;
        let isExactCount = false;
        
        try {
            // Attempt Exact Count
            const usersColl = collection(db, 'users');
            const userCountSnapshot = await getCountFromServer(usersColl);
            registeredUsers = userCountSnapshot.data().count;

            // Attempt Premium Count
            const premiumQuery = query(usersColl, where('profile.isPremium', '==', true));
            const premiumSnapshot = await getCountFromServer(premiumQuery);
            totalPremium = premiumSnapshot.data().count;

            isExactCount = true;
        } catch (dbErr) {
            console.warn("DB Count Permission Denied. Switching to Event-based estimation. (Fix Firestore Rules for exact count)");
            
            // Fallback: Count unique logged-in users from events
            const uniqueUserIds = new Set();
            events.forEach(e => {
                // Check explicit Login/Signup events
                if (e.action === 'LOGIN_SUCCESS' || e.action === 'SIGNUP_SUCCESS') {
                    if (e.userId && e.userId !== 'unauth') uniqueUserIds.add(e.userId);
                }
                // Check any authenticated action
                if (e.userId && e.userId !== 'unauth') {
                    uniqueUserIds.add(e.userId);
                }
            });
            registeredUsers = uniqueUserIds.size;
            totalPremium = subscribersFromEvents; // Use event-based subscriber count
            isExactCount = false;
        }

        return {
            totalUsers: visitors, 
            registeredUsers, 
            totalPremium,
            isExactCount,
            activeUsers24h: visitors, 
            retentionRate: subscribersFromEvents, 
            totalScans,
            avgScansPerUser: visitors > 0 ? Number((totalScans / visitors).toFixed(1)) : 0,
            paywallHitRate: Number(conversionRate.toFixed(1)),
            trustScore: Math.min(100, Math.max(0, trustScore)),
            apiCostEst: Number(estCost.toFixed(4)),
            mostScannedBrands: sortedBrands.length > 0 ? sortedBrands : [{ name: "No Data", count: 0 }],
            localStats: {
                myScans: totalScans, 
                myShelfSize: 0, 
                mySpendPotential: totalPremium * 9.90 
            }
        };
    } catch (e) {
        console.error("Admin Stats Error", e);
        return { 
            totalUsers: 0, registeredUsers: 0, totalPremium: 0, isExactCount: false, activeUsers24h: 0, retentionRate: 0, totalScans: 0, 
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
