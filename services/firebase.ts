
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  signOut as firebaseSignOut, 
  Auth 
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// --- CONFIGURATION ---

const getEnv = (key: string, fallback: string = "") => {
  // 1. Try Vite standard (import.meta.env)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {
    // ignore
  }

  // 2. Try Node/Process standard (process.env)
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      // @ts-ignore
      return process.env[key];
    }
  } catch (e) {
    // ignore
  }

  return fallback;
};

// ------------------------------------------------------------------
// Firebase Configuration
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY", "AIzaSyCdvlMe7-XMrp5kJaU2IWDnes5yOfQSOg8"), 
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN", "skinapp-1f71a.firebaseapp.com"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID", "skinapp-1f71a"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET", "skinapp-1f71a.firebasestorage.app"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "115659351214"),
  appId: getEnv("VITE_FIREBASE_APP_ID", "1:115659351214:web:6d21eed5aab9bedda1393f"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-RT6VLVB6GX")
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// Check if the user has actually pasted their keys (simple validation)
const isConfigured = firebaseConfig.apiKey && 
                     !firebaseConfig.apiKey.includes("PASTE_YOUR_API_KEY");

try {
  // Simple check: if app exists, get it; otherwise initialize it.
  if (getApps().length > 0) {
      app = getApp();
  } else {
      // Only initialize if we have a valid API key
      if (isConfigured) {
          app = initializeApp(firebaseConfig);
      } else {
          console.warn("⚠️ Firebase Not Configured: Open services/firebase.ts and paste your keys.");
      }
  }

  if (app) {
      auth = getAuth(app);
      db = getFirestore(app);
  } 
} catch (e) {
  console.error("CRITICAL: Firebase Initialization Failed", e);
}

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
    if (!isConfigured) {
        throw new Error("Firebase not configured. Please open services/firebase.ts and paste your API keys from the Firebase Console.");
    }
    if (!auth) {
        console.error("Auth object is undefined. App likely failed to initialize.");
        throw new Error("Firebase failed to initialize. Check console for errors.");
    }
    
    // Directly return the promise so the caller handles the raw error object (with correct .code)
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
};

export const registerWithEmail = async (name: string, email: string, pass: string) => {
  if (!auth) throw new Error("Firebase auth not initialized");
  
  // 1. Create User
  const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
  const user = userCredential.user;

  // 2. Update Display Name
  await updateProfile(user, {
    displayName: name
  });

  return user;
};

export const loginWithEmail = async (email: string, pass: string) => {
  if (!auth) throw new Error("Firebase auth not initialized");
  const userCredential = await signInWithEmailAndPassword(auth, email, pass);
  return userCredential.user;
};

export const signOut = async () => {
    if (!auth) return;
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
};

export { auth, db };
