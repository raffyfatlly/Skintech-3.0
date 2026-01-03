
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile, Product } from '../types';
import { auth, db } from './firebase';

const USER_KEY = 'skinos_user_v2';
const SHELF_KEY = 'skinos_shelf_v2';

// --- ACCESS CODE CONFIGURATION ---

// 1. MASTER CODES (Bypass DB, Multi-use)
// These work instantly for anyone, even offline.
const MAGIC_CODES = ["AK72-M9XP", "SKINOSVIP", "DEMO2025"];

// 2. UNIQUE CODES (Single-use, Verified via DB)
// These must be claimed in Firestore to ensure they are used only once per user.
export const VALID_ACCESS_CODES = [
  "A7K2-M9XP", "AK72-M9XP", "L4W8-Q2ZR", "B9X3-Y6VM", "H2J5-T8NK", "R7C4-D1QS", "P3M9-F6GL", "X8W2-Z5VB", "K1N7-H4TJ", "Q6D9-S3RF", "V2B8-L5YM",
  "C4G7-P9XN", "M8J3-K2WQ", "T5R6-D1ZL", "F9H2-B4CS", "W3Q8-V7NP", "Z6L5-X9MK", "G2T4-J8RY", "S7P3-N1WD", "D5M9-H6BF", "Y8K2-C4VG",
  "R3X7-Q9ZL", "L6N2-W5TJ", "B8D4-P1SM", "H9G5-F3VK", "M2Q7-R8YC", "X5J9-Z4TN", "C1W6-L8KP", "K7B3-D2RF", "V4S9-H5XQ", "T8M2-N6GP",
  "F3Y7-J9WL", "P6R5-C2VB", "Z9K4-G1TS", "Q2L8-D5XM", "W7N3-B6RJ", "G4H9-S2FK", "D8T5-P1VQ", "Y3C6-X9ZL", "J5M2-R7WN", "N9S8-K4YF",
  "R2B6-L3TJ", "H7Q4-D9VP", "X3G5-F8MC", "L9W2-Z1NK", "C6J8-T5RS", "M4P7-Y2XB", "K8D3-Q6VG", "V5N9-H1ZL", "S2R4-B8WJ", "F7T6-C3KM",
  "Q9X5-G2NP", "W4L8-D7YV", "Z1J3-M6RF", "P8H2-K5TS", "B6S7-N9WQ", "G3C5-R1XL", "D9M4-V2FB", "Y7K8-T3ZP", "R5W6-J9LG", "L2Q9-X4HN",
  "H8G3-S7VK", "C5B2-D6MY", "M9T7-F1RJ", "X4P5-N8WS", "K6R2-L9ZC", "V3J8-G5TP", "F1S4-Q7XM", "T9N6-B2KV", "W5H3-C8YD", "Z2M7-K4RL",
  "P7D9-R6WG", "Q4L2-J5XN", "G8W5-V1TS", "Y6B3-S9FM", "D2K7-H4ZP", "J9R8-C5VQ", "N5T2-L3YB", "R8X6-M1GK", "H4Q9-D7WJ", "L7G5-P2ZN",
  "C3J2-F6VR", "X9S4-K8TY", "M6N8-B1DL", "V2H5-R9WQ", "F8M3-T4XG", "W1P7-L6ZJ", "Z5K9-C2VS", "Q3R4-D8NM", "G7B6-H1YK", "T2J5-S9WF",
  "D6W8-N3XQ", "Y9L2-V5RP", "P4C7-M1ZG", "K3G5-F8TJ", "R1T9-Q6VB", "H5N4-X2LS", "L8S3-J7WK", "B2M6-D9RY", "X7Q2-C5ZN"
];

// Helper: Sanitize undefined values for Firestore
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  
  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = sanitizeForFirestore(obj[key]);
      if (val !== undefined) {
        newObj[key] = val;
      }
    }
  }
  return newObj;
};

// --- LOAD DATA ---
export const loadUserData = async (): Promise<{ user: UserProfile | null, shelf: Product[] }> => {
    // 1. Get Local Data First
    let localUser: UserProfile | null = null;
    let localShelf: Product[] = [];

    try {
        const localUserStr = localStorage.getItem(USER_KEY);
        const localShelfStr = localStorage.getItem(SHELF_KEY);
        
        localUser = localUserStr ? JSON.parse(localUserStr) as UserProfile : null;
        localShelf = localShelfStr ? JSON.parse(localShelfStr) : [];
    } catch (e) {
        console.error("Local Load Error:", e);
    }

    // 2. Try Cloud if Logged In
    if (auth?.currentUser && db) {
        try {
            const docRef = doc(db, "users", auth.currentUser.uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                const cloudProfile = data.profile as UserProfile;
                const cloudShelf = data.shelf as Product[] || [];

                // --- SMART CONFLICT RESOLUTION ---
                const localTs = localUser?.biometrics?.timestamp || 0;
                const cloudTs = cloudProfile?.biometrics?.timestamp || 0;

                if (localTs > cloudTs) {
                    console.log("Load: Local data is newer than Cloud. Using Local.");
                    return { user: localUser, shelf: localShelf };
                } else {
                    console.log("Load: Cloud data is newer/equal. Updating Local.");
                    try {
                        localStorage.setItem(USER_KEY, JSON.stringify(cloudProfile));
                        localStorage.setItem(SHELF_KEY, JSON.stringify(cloudShelf));
                    } catch (e) {
                        console.error("Local Update Error:", e);
                    }
                    return { user: cloudProfile, shelf: cloudShelf };
                }
            }
        } catch (e) {
            console.error("Cloud Load Error:", e);
        }
    }

    return {
        user: localUser,
        shelf: localShelf
    };
};

// --- SAVE DATA ---
export const saveUserData = async (user: UserProfile, shelf: Product[]) => {
    // 1. Always save to local storage (Safe Fallback)
    try {
        const userStr = JSON.stringify(user);
        const shelfStr = JSON.stringify(shelf);
        localStorage.setItem(USER_KEY, userStr);
        localStorage.setItem(SHELF_KEY, shelfStr);
    } catch (e: any) {
        console.warn("Local Save Quota Exceeded (Circular Ref?):", e);
        // Fallback: Try saving user WITHOUT the face image to save space
        try {
            const slimUser = { ...user, faceImage: null }; // Drop large image
            localStorage.setItem(USER_KEY, JSON.stringify(slimUser));
            localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
            console.log("Fallback: Saved slim profile to LocalStorage.");
        } catch (e2) {
            console.error("Critical Storage Failure", e2);
        }
    }

    // 2. If Logged In, Sync to Cloud
    if (auth?.currentUser && db) {
        try {
            const docRef = doc(db, "users", auth.currentUser.uid);
            const cloudProfile = sanitizeForFirestore({ ...user, isAnonymous: false });
            const cloudShelf = sanitizeForFirestore(shelf);
            
            await setDoc(docRef, {
                profile: cloudProfile,
                shelf: cloudShelf,
                lastUpdated: Date.now()
            }, { merge: true });
        } catch (e) {
            console.error("Cloud Save Error:", e);
        }
    }
};

// --- SYNC (Local -> Cloud) ---
export const syncLocalToCloud = async () => {
    if (!auth?.currentUser || !db) return;

    let localUser: UserProfile | null = null;
    let localShelf: Product[] = [];

    try {
        const localUserStr = localStorage.getItem(USER_KEY);
        const localShelfStr = localStorage.getItem(SHELF_KEY);
        if (!localUserStr) return; 
        localUser = JSON.parse(localUserStr) as UserProfile;
        localShelf = localShelfStr ? JSON.parse(localShelfStr) : [];
    } catch (e) {
        console.error("Sync Local Read Error:", e);
        return;
    }

    const docRef = doc(db, "users", auth.currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        await saveUserData(localUser, localShelf);
        console.log("Synced local data to new cloud account");
    } else {
        const cloudData = docSnap.data();
        const cloudProfile = cloudData.profile as UserProfile;
        
        const localTs = localUser.biometrics?.timestamp || 0;
        const cloudTs = cloudProfile.biometrics?.timestamp || 0;

        if (localTs > cloudTs) {
            console.log("Local scan is newer. Syncing to Cloud.");
            const isPremium = localUser.isPremium || cloudProfile.isPremium;
            const mergedProfile = { ...localUser, isPremium };
            await saveUserData(mergedProfile, localShelf);
        } 
        else if (localUser.isPremium && !cloudProfile.isPremium) {
            console.log("Local Premium detected. Syncing to Cloud.");
            const mergedProfile = { ...cloudProfile, isPremium: true };
            await saveUserData(mergedProfile, cloudData.shelf || []);
        } 
        else {
            console.log("Cloud data is up-to-date. Syncing to Local.");
            try {
                localStorage.setItem(USER_KEY, JSON.stringify(cloudProfile));
                localStorage.setItem(SHELF_KEY, JSON.stringify(cloudData.shelf || []));
            } catch (e) {
                console.error("Sync Local Write Error:", e);
            }
        }
    }
};

export const clearLocalData = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SHELF_KEY);
    localStorage.removeItem('skinos_guide_seen_v2');
};

// --- ACCESS CODE REDEMPTION ---
export const claimAccessCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
    const codeId = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); 

    const isMagic = MAGIC_CODES.some(mc => mc.replace(/[^A-Z0-9]/g, '') === codeId);
    if (isMagic) {
        return { success: true };
    }

    const validCode = VALID_ACCESS_CODES.find(vc => vc.replace(/[^A-Z0-9]/g, '') === codeId);
    
    if (!validCode) {
        return { success: false, error: "Invalid Access Code." };
    }

    if (!db) {
        console.warn("DB Offline. Attempting soft-verification.");
    }
    
    if (!auth?.currentUser) {
        return { success: false, error: "Please log in to redeem this code." };
    }

    const uid = auth.currentUser.uid;
    const docKey = codeId; 
    const codeRef = doc(db, "claimed_codes", docKey);

    try {
        const codeSnap = await getDoc(codeRef);
        
        if (codeSnap.exists()) {
            const data = codeSnap.data();
            if (data.claimedBy === uid) {
                return { success: true };
            }
            return { success: false, error: "Code already claimed by another user." };
        }

        await setDoc(codeRef, {
            claimedBy: uid,
            claimedAt: Date.now(),
            code: validCode
        });

        return { success: true };
    } catch (e: any) {
        console.error("Code Claim Error:", e);
        if (e.code === 'permission-denied' || e.message?.includes('permission')) {
            console.warn("DB Permission Denied. Falling back to static list validation.");
            return { success: true };
        }
        return { success: false, error: "Verification failed. Check your connection." };
    }
};
