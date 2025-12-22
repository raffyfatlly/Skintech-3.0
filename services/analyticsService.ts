
import { db } from './firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

// Types for our "Smart" Metrics
export interface ValidationMetrics {
  totalUsers: number;
  activeUsers24h: number;
  retentionRate: number; // Day 1 to Day 7 retention
  totalScans: number;
  avgScansPerUser: number; // "Obsession" Metric
  paywallHitRate: number; // % of users who clicked a premium feature
  trustScore: number; // % of products removed after receiving a low score
  apiCostEst: number; // Estimated Gemini Cost
  mostScannedBrands: { name: string, count: number }[];
}

export interface LiveEvent {
  id: string;
  user: string;
  action: string;
  timestamp: number;
  meta?: string;
}

// Mock Data Generator for the "Smart" Dashboard
// In a real app, this would aggregate from Firestore queries or BigQuery.
export const getAdminStats = async (): Promise<ValidationMetrics> => {
    // Simulating API latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Realistic "Validation" Data Structure
    return {
        totalUsers: 1243,
        activeUsers24h: 312,
        retentionRate: 42.5, // 42% is very good for consumer apps
        totalScans: 8450,
        avgScansPerUser: 6.8, // High number indicates high utility
        paywallHitRate: 18.2, // ~18% hitting paywall is strong intent
        trustScore: 64, // 64% of people delete "Red" flagged products
        apiCostEst: 42.15, // Low cost due to Gemini Flash
        mostScannedBrands: [
            { name: "CeraVe", count: 450 },
            { name: "The Ordinary", count: 320 },
            { name: "La Roche-Posay", count: 210 },
            { name: "Cosrx", count: 180 }
        ]
    };
};

export const getLiveFeed = (): LiveEvent[] => {
    return [
        { id: '1', user: 'User_892', action: 'HIT_PAYWALL', timestamp: Date.now() - 1000 * 30, meta: 'Routine Builder' },
        { id: '2', user: 'Sarah_K', action: 'SCAN_FACE', timestamp: Date.now() - 1000 * 120, meta: 'Score: 84' },
        { id: '3', user: 'Anon_22', action: 'DISCARD_PRODUCT', timestamp: Date.now() - 1000 * 300, meta: 'High Risk Found' },
        { id: '4', user: 'Mike_T', action: 'SCAN_PRODUCT', timestamp: Date.now() - 1000 * 600, meta: 'Neutrogena Hydro Boost' },
        { id: '5', user: 'User_101', action: 'SAVE_PROFILE', timestamp: Date.now() - 1000 * 900, meta: 'Converted from Anon' },
    ];
};

// --- REAL EVENT TRACKING (To be hooked into components) ---
export const trackEvent = (eventName: string, meta: any = {}) => {
    // In a real app, fire to Mixpanel/Amplitude/Firestore
    console.log(`[ANALYTICS] ${eventName}`, meta);
};
