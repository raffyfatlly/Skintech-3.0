
import React, { useState, useEffect, useRef } from 'react';
import { 
  AppView, 
  UserProfile, 
  Product, 
  SkinMetrics, 
  SkinType, 
  UsageStats, 
  RecommendedProduct,
  UserPreferences,
  ShelfAuditReport
} from './types';
import { loadUserData, saveUserData, syncLocalToCloud, clearLocalData } from './services/storageService';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { startCheckout } from './services/stripeService';
import { trackEvent } from './services/analyticsService';
import { analyzeProductFromSearch, analyzeProductImage, generateTargetedRecommendations, analyzeShelfHealth, runPostScanAudit } from './services/geminiService';
import { runNotificationEngine } from './services/notificationService';

// Components
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import FaceScanner from './components/FaceScanner';
import { SkinAnalysisReport } from './components/SkinAnalysisReport';
import SmartShelf from './components/SmartShelf';
import ProductScanner from './components/ProductScanner';
import ProductSearch from './components/ProductSearch';
import ProfileSetup from './components/ProfileSetup';
import AIAssistant from './components/AIAssistant';
import { BuyingAssistant } from './components/BuyingAssistant';
import PremiumRoutineBuilder from './components/PremiumRoutineBuilder';
import SaveProfileModal, { AuthTrigger } from './components/SaveProfileModal';
import SmartNotification, { NotificationType } from './components/SmartNotification';
import BetaOfferModal from './components/BetaOfferModal';
import GuideOverlay from './components/GuideOverlay';
import AdminDashboard from './components/AdminDashboard';
import BackgroundTaskBar from './components/BackgroundTaskBar';
import SplashScreen from './components/SplashScreen';
import SkinSimulator from './components/SkinSimulator';
import BottomNavigation from './components/BottomNavigation';
import SwipeInstructionOverlay from './components/SwipeInstructionOverlay';

const LIMIT_SCANS = 3; // Face & Product
const LIMIT_TOOLS = 1; // Routine & Simulator

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LANDING);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [shelf, setShelf] = useState<Product[]>([]);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const viewRef = useRef<AppView>(AppView.LANDING);
  const [analyzedProduct, setAnalyzedProduct] = useState<Product | null>(null);
  const [prefillName, setPrefillName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalTrigger, setSaveModalTrigger] = useState<AuthTrigger>('GENERIC');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [pendingScan, setPendingScan] = useState<{metrics: SkinMetrics, image: string} | null>(null);
  const [activeGuide, setActiveGuide] = useState<'SCAN' | null>(null);
  const [backgroundTask, setBackgroundTask] = useState<{ label: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  // New: Swipe Instruction State
  const [showSwipeInstruction, setShowSwipeInstruction] = useState(false);
  
  // New: Target Category for Routine Builder Auto-fill
  const [targetRoutineCategory, setTargetRoutineCategory] = useState<string | null>(null);
  
  // Location Context State
  const [userLocation, setUserLocation] = useState<string>("Global");

  // Notification State
  const [notification, setNotification] = useState<{ type: NotificationType, title: string, description: string, actionLabel?: string, onAction?: () => void } | null>(null);
  
  // Shelf Audit Report State
  const [auditReport, setAuditReport] = useState<ShelfAuditReport | null>(null);

  const [aiQuery, setAiQuery] = useState<string | null>(null);
  
  // Persisted Routine Results State
  const [routineResults, setRoutineResults] = useState<RecommendedProduct[]>([]);

  // --- GESTURE NAVIGATION STATE ---
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => { viewRef.current = currentView; }, [currentView]);

  // Capture PWA Install Prompt Global Listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // --- LOGIC: SHOW SWIPE INSTRUCTION ---
  useEffect(() => {
      // Show instruction only if:
      // 1. User is logged in/onboarded (has profile)
      // 2. Has scanned face (is on main dashboard flow)
      // 3. Has NOT seen it before
      if (userProfile && userProfile.hasScannedFace && currentView === AppView.DASHBOARD) {
          const hasSeen = localStorage.getItem('skinos_swipe_guide_seen');
          if (!hasSeen) {
              // Slight delay to allow dashboard to load first
              const timer = setTimeout(() => setShowSwipeInstruction(true), 1500);
              return () => clearTimeout(timer);
          }
      }
  }, [userProfile, currentView]);

  const dismissSwipeInstruction = () => {
      localStorage.setItem('skinos_swipe_guide_seen', 'true');
      setShowSwipeInstruction(false);
  };

  // --- LOCATION DETECTION ---
  useEffect(() => {
      // 1. Try Timezone as baseline
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserLocation(`Timezone: ${tz}`);

      // 2. Try Geo for precision
      if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition((pos) => {
              const { latitude, longitude } = pos.coords;
              setUserLocation(`Coordinates: ${latitude.toFixed(2)}, ${longitude.toFixed(2)} (Timezone: ${tz})`);
          }, (err) => {
              console.log("Geo access denied, using timezone");
          });
      }
  }, []);

  // --- NEW: RUN NOTIFICATION ENGINE ---
  useEffect(() => {
      if (userProfile) {
          // Add a small delay to not block main thread on load
          const timer = setTimeout(() => {
              runNotificationEngine(userProfile, shelf);
          }, 3000);
          return () => clearTimeout(timer);
      }
  }, [userProfile, shelf]);

  // --- NEW: HANDLE DEEP LINKS FROM NOTIFICATIONS ---
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      if (action === 'scan' && userProfile) {
          setCurrentView(AppView.FACE_SCANNER);
      } else if (action === 'shelf' && userProfile) {
          setCurrentView(AppView.SMART_SHELF);
      }
      
      // Clean URL
      if (action) {
          window.history.replaceState({}, document.title, window.location.pathname);
      }
  }, [userProfile]);

  useEffect(() => {
      let interval: ReturnType<typeof setInterval>;
      if (isGlobalLoading && loadingMessage?.includes("Syncing")) {
          const messages = [
              "Syncing Profile...",
              "Checking Cloud...",
              "Updating Data..."
          ];
          let i = 0;
          setLoadingMessage(messages[0]);
          interval = setInterval(() => {
              i = (i + 1) % messages.length;
              setLoadingMessage(messages[i]);
          }, 1500);
      }
      return () => clearInterval(interval);
  }, [isGlobalLoading]);

  const openAuth = (trigger: AuthTrigger) => {
      trackEvent('AUTH_OPENED', { trigger });
      setSaveModalTrigger(trigger);
      setShowSaveModal(true);
  };

  const handleUnlockPremium = () => {
      trackEvent('PREMIUM_MODAL_OPEN', { source: currentView });
      if (userProfile?.isAnonymous) {
          openAuth('UNLOCK_DEAL');
          return;
      }
      setShowPremiumModal(true);
  };

  const persistState = (newUser: UserProfile, newShelf: Product[]) => {
      const timestampedUser = { ...newUser, lastUpdated: Date.now() };
      setUserProfile(timestampedUser);
      setShelf(newShelf);
      saveUserData(timestampedUser, newShelf);
  };

  const incrementUsage = (type: keyof UsageStats) => {
      if (!userProfile) return;
      const currentUsage = userProfile.usage || { buyingAssistantViews: 0, manualScans: 0, routineGenerations: 0, simulatorViews: 0 };
      const newUsage = { ...currentUsage, [type]: (currentUsage[type] || 0) + 1 };
      const updatedUser = { ...userProfile, usage: newUsage };
      persistState(updatedUser, shelf);
  };

  const handleFindAlternative = (productType: string) => {
      // Map generic product types to Routine Builder categories
      let category = 'Cleanser'; // Default fallback
      const type = productType.toUpperCase();

      if (type.includes('SPF') || type.includes('SUN')) category = 'Sunscreen';
      else if (type.includes('MOISTURIZER') || type.includes('CREAM')) category = 'Moisturizer';
      else if (type.includes('SERUM')) category = 'Serum';
      else if (type.includes('TONER')) category = 'Toner';
      else if (type.includes('TREATMENT') || type.includes('MASK')) category = 'Treatment';
      else if (type.includes('CLEANSER') || type.includes('WASH')) category = 'Cleanser';
      
      // New Makeup & Specialized Mappings
      else if (type.includes('FOUNDATION')) category = 'Foundation';
      else if (type.includes('CONCEALER')) category = 'Concealer';
      else if (type.includes('PRIMER')) category = 'Primer';
      else if (type.includes('SETTING_SPRAY') || type.includes('SPRAY')) category = 'Setting Spray';
      else if (type.includes('EYE') || type.includes('EYE_CREAM')) category = 'Eye Cream';
      else if (type.includes('MASK')) category = 'Mask';
      
      setTargetRoutineCategory(category);
      setCurrentView(AppView.ROUTINE_BUILDER);
  };

  const handleAddToWishlist = async (product: Product) => {
      if (!userProfile) return;
      const currentWishlist = userProfile.wishlist || [];
      if (currentWishlist.some(p => p.name === product.name)) {
          setNotification({ type: 'GENERIC', title: 'Already Saved', description: 'This product is already in your wishlist.' });
          return;
      }
      
      // 1. Optimistic Save (Immediate UI Update)
      const newWishlist = [...currentWishlist, product];
      const updatedUser = { ...userProfile, wishlist: newWishlist };
      persistState(updatedUser, shelf);
      setNotification({ type: 'GENERIC', title: 'Saved!', description: 'Product added to wishlist.' });

      // 2. Background Enrichment (If ingredients are missing)
      if (product.ingredients.length === 0) {
          setBackgroundTask({ label: `Analyzing ${product.name}...` });
          try {
              const shelfIngredients = shelf.flatMap(p => p.ingredients).slice(0, 50);
              const enriched = await analyzeProductFromSearch(
                  product.name, 
                  updatedUser, 
                  undefined, 
                  product.brand,
                  shelfIngredients,
                  userLocation
              );

              // Merge Enrichment with existing ID
              const finalProduct = { ...enriched, id: product.id, dateScanned: product.dateScanned };

              // Functional Update to Ensure Fresh State
              setUserProfile(prev => {
                  if (!prev) return null;
                  const currentList = prev.wishlist || [];
                  // Only update if it still exists
                  const listWithEnriched = currentList.map(p => p.id === product.id ? finalProduct : p);
                  const newProfileState = { ...prev, wishlist: listWithEnriched };
                  
                  // Save to storage safely
                  setShelf(currentShelf => {
                      saveUserData(newProfileState, currentShelf);
                      return currentShelf;
                  });
                  
                  return newProfileState;
              });

          } catch (e) {
              console.error("Wishlist Enrichment Failed", e);
          } finally {
              setBackgroundTask(null);
          }
      }
  };

  const handleRemoveFromWishlist = (id: string) => {
      if (!userProfile) return;
      const currentWishlist = userProfile.wishlist || [];
      const newWishlist = currentWishlist.filter(p => p.id !== id);
      const updatedUser = { ...userProfile, wishlist: newWishlist };
      persistState(updatedUser, shelf);
  };

  const handleMoveToShelf = (product: Product) => {
      if (!userProfile) return;
      handleRemoveFromWishlist(product.id);
      const newShelf = [...shelf, product];
      persistState(userProfile, newShelf);
      setNotification({ type: 'TASK_COMPLETE', title: 'Added to Routine', description: `${product.name} moved to shelf.` });
  };

  const handleBackgroundAnalysis = async (
      type: 'SEARCH' | 'IMAGE', 
      payload: string, 
      productBrand?: string
  ) => {
      if (!userProfile) return;
      const originatingView = viewRef.current;
      setBackgroundTask({ label: type === 'SEARCH' ? 'Scanning Product...' : 'Analyzing Photo...' });

      try {
          const shelfIngredients = shelf.flatMap(p => p.ingredients).slice(0, 50);
          let product: Product;

          if (type === 'SEARCH') {
              product = await analyzeProductFromSearch(
                  payload, 
                  userProfile, // Pass full user profile for safety checks
                  undefined, 
                  productBrand,
                  shelfIngredients,
                  userLocation
              );
          } else {
              product = await analyzeProductImage(
                  payload, 
                  userProfile, // Pass full user profile for safety checks
                  shelfIngredients,
                  userLocation
              );
          }

          setAnalyzedProduct(product);
          if (!userProfile?.isPremium) {
              incrementUsage('manualScans');
          }
          trackEvent('PRODUCT_FOUND', { name: product.name, match: product.suitabilityScore });

          if (viewRef.current === originatingView) {
              setCurrentView(AppView.BUYING_ASSISTANT);
          } else {
              setNotification({
                  type: 'TASK_COMPLETE',
                  title: 'Analysis Ready',
                  description: `Verdict available for ${product.name.substring(0, 15)}...`,
                  actionLabel: 'View Results',
                  onAction: () => {
                      setCurrentView(AppView.BUYING_ASSISTANT);
                  }
              });
          }

      } catch (err) {
          console.error("Background Analysis Error", err);
          setNotification({
              type: 'GENERIC',
              title: 'Analysis Failed',
              description: 'We encountered an issue connecting to the AI service. Please try again.',
              actionLabel: 'OK',
              onAction: () => {}
          });
          if (viewRef.current === AppView.PRODUCT_SCANNER || viewRef.current === AppView.PRODUCT_SEARCH) {
              setCurrentView(AppView.SMART_SHELF);
          }
      } finally {
          setBackgroundTask(null);
      }
  };

  const handleBackgroundRoutine = async (
      category: string, 
      maxPrice: number, 
      allergies: string, 
      goals: string[]
  ) => {
      if (!userProfile) return;
      if (!userProfile.isPremium) {
          incrementUsage('routineGenerations');
      }
      const originatingView = viewRef.current;
      setBackgroundTask({ label: `Building ${category} Routine...` });

      try {
          const data = await generateTargetedRecommendations(
              userProfile, 
              category, 
              maxPrice, 
              allergies, 
              goals,
              userLocation
          );
          setRoutineResults(data);
          if (viewRef.current !== originatingView) {
              setNotification({
                  type: 'TASK_COMPLETE',
                  title: 'Routine Ready',
                  description: `Found ${data.length} matches for ${category}.`,
                  actionLabel: 'View',
                  onAction: () => setCurrentView(AppView.ROUTINE_BUILDER)
              });
          }
      } catch (e) {
          console.error("Routine Error", e);
          setNotification({
              type: 'GENERIC',
              title: 'Search Failed',
              description: 'Could not generate recommendations. Try simpler filters.',
              actionLabel: 'OK',
              onAction: () => {}
          });
          if (viewRef.current === AppView.ROUTINE_BUILDER) {
               setRoutineResults([]);
          }
      } finally {
          setBackgroundTask(null);
      }
  };

  // --- SHARED AUDIT FUNCTION ---
  const runSmartAudit = async (user: UserProfile, currentShelf: Product[]) => {
      if (currentShelf.length === 0) return;
      
      setBackgroundTask({ label: 'Refreshing Shelf Audit...' });

      try {
          // 1. Clean old audit flags first (so we don't carry over stale risks)
          const cleanShelf = currentShelf.map(p => ({
              ...p,
              risks: p.risks?.filter(r => r.ingredient !== 'AI AUDIT') || []
          }));

          // 2. Run Audit against the NEW user profile (which has updated biometrics)
          const report = await runPostScanAudit(user, cleanShelf);
          
          setBackgroundTask(null);

          let finalShelf = cleanShelf;

          if (report && report.flags.length > 0) {
              setAuditReport(report);
              
              // Apply new flags
              finalShelf = cleanShelf.map(p => {
                  const flag = report.flags.find(f => f.productId === p.id);
                  if (flag) {
                      let newRisks = [...(p.risks || [])];
                      
                      // Improvement (RESUME) -> No risk added
                      // Worsening -> Add AI AUDIT risk
                      if (flag.advice !== 'RESUME') {
                          newRisks.unshift({
                              ingredient: 'AI AUDIT',
                              riskLevel: flag.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
                              reason: flag.issue
                          });
                      }

                      return {
                          ...p,
                          usageTips: flag.smartUsage, 
                          risks: newRisks,
                          expertReview: `[${new Date().toLocaleDateString()}] ${flag.issue}\n\n${p.expertReview || ''}`
                      };
                  }
                  return p;
              });

              setNotification({
                  type: 'GENERIC',
                  title: 'Routine Updated',
                  description: 'Shelf analysis updated to match your current skin profile.',
                  actionLabel: 'View',
                  onAction: () => setCurrentView(AppView.SMART_SHELF)
              });
          } else {
              // No flags found for the new state -> Clean shelf is the final shelf
              setAuditReport(null); 
          }
          
          // 3. Save Everything
          setShelf(finalShelf);
          saveUserData(user, finalShelf);

      } catch (e) {
          console.error("Audit failed", e);
          setBackgroundTask(null);
          // Fallback save just in case
          setShelf(currentShelf); 
          saveUserData(user, currentShelf);
      }
  };

  useEffect(() => {
    const init = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const isPaymentSuccess = urlParams.get('payment') === 'success';
      const isSecretAdmin = urlParams.get('mode') === 'admin';

      if (isSecretAdmin) {
          setIsAdminMode(true);
          return;
      }

      trackEvent('APP_VISIT', { referrer: document.referrer });
      const data = await loadUserData();
      let currentUser = data.user;

      if (isPaymentSuccess && currentUser) {
          currentUser = { ...currentUser, isPremium: true };
          saveUserData(currentUser, data.shelf);
          trackEvent('PAYMENT_SUCCESS_LOCAL');
          if (!auth?.currentUser) {
             setNotification({ type: 'GENERIC', title: 'Premium Unlocked!', description: 'You now have unlimited access.', actionLabel: 'Great', onAction: () => {} });
             window.history.replaceState({}, document.title, window.location.pathname);
          }
      }

      if (currentUser) {
        setUserProfile(currentUser);
        setShelf(data.shelf);
        setCurrentView(currentUser.hasScannedFace ? AppView.DASHBOARD : AppView.FACE_SCANNER);
      } else {
        setCurrentView(AppView.LANDING);
      }
    };
    init();

    const unsubscribe = auth ? onAuthStateChanged(auth, async (user) => {
        if (user) {
            const isLoginFlow = viewRef.current === AppView.LANDING || viewRef.current === AppView.ONBOARDING;
            if (isLoginFlow) {
                setLoadingMessage("Syncing Profile...");
                setIsGlobalLoading(true);
            }
            try {
                await syncLocalToCloud();
                const data = await loadUserData();
                let currentUser = data.user;
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('payment') === 'success' && currentUser) {
                     currentUser = { ...currentUser, isPremium: true };
                     await saveUserData(currentUser, data.shelf);
                     trackEvent('PAYMENT_SUCCESS_CLOUD');
                     setNotification({ type: 'GENERIC', title: 'Premium Unlocked!', description: 'Your account has been upgraded.', actionLabel: 'Awesome', onAction: () => {} });
                     window.history.replaceState({}, document.title, window.location.pathname);
                }
                if (currentUser) {
                    setUserProfile(currentUser);
                    setShelf(data.shelf);
                    if (isLoginFlow) setCurrentView(currentUser.hasScannedFace ? AppView.DASHBOARD : AppView.FACE_SCANNER);
                } else if (isLoginFlow) {
                    if (user.displayName) setPrefillName(user.displayName);
                    setCurrentView(AppView.ONBOARDING);
                }
            } catch (e) { console.error(e); } finally { setTimeout(() => setIsGlobalLoading(false), 800); setLoadingMessage(null); }
        }
    }) : () => {};
    return () => unsubscribe();
  }, []);

  const handleOnboardingComplete = (data: { name: string; age: number; skinType: SkinType; safety: any }) => {
      trackEvent('ONBOARDING_COMPLETE');
      const isAuth = !!auth?.currentUser;
      const initialPrefs: UserPreferences = {
          goals: [],
          sensitivity: data.safety.hasSensitiveSkin ? 'VERY_SENSITIVE' : 'MILD',
          complexity: 'MODERATE',
          sunscreenFrequency: 'SUNNY',
          lifestyle: [],
          buyingPriority: 'Fast Results',
          isPregnant: data.safety.isPregnant,
          hasEczema: data.safety.hasEczema,
          onMedication: data.safety.onMedication
      };
      const newUser: UserProfile = {
          name: data.name, 
          age: data.age, 
          skinType: data.skinType, 
          hasScannedFace: false, 
          biometrics: {} as any, 
          isAnonymous: !isAuth, 
          isPremium: false,
          preferences: initialPrefs,
          usage: { buyingAssistantViews: 0, manualScans: 0, routineGenerations: 0, simulatorViews: 0 },
          lastUpdated: Date.now()
      };
      setUserProfile(newUser);
      if (isAuth) saveUserData(newUser, shelf); else persistState(newUser, shelf);
      setCurrentView(AppView.FACE_SCANNER);
  };

  const handleFaceScanComplete = (metrics: SkinMetrics, image: string) => {
      trackEvent('FACE_SCAN_COMPLETE', { score: metrics.overallScore });
      if (!userProfile) return;
      if (userProfile.isAnonymous) {
          setPendingScan({ metrics, image });
          openAuth('SAVE_RESULTS');
          return;
      }
      
      const updatedUser: UserProfile = {
          ...userProfile, 
          hasScannedFace: true, 
          biometrics: metrics, 
          faceImage: image,
          scanHistory: [...(userProfile.scanHistory || []), metrics],
          simulatedSkinImage: null,
          usage: userProfile.usage || { buyingAssistantViews: 0, manualScans: 0, routineGenerations: 0, simulatorViews: 0 },
          lastUpdated: Date.now()
      };
      
      // CRITICAL: Update state and storage IMMEDIATELY so the dashboard shows new results instantly
      setUserProfile(updatedUser);
      saveUserData(updatedUser, shelf); 
      setCurrentView(AppView.DASHBOARD);
      
      setTimeout(() => setActiveGuide('SCAN'), 5000);

      // --- TRIGGER SHELF AUDIT ---
      // We wait a moment for UX smoothness, then call our shared audit function
      setTimeout(() => {
          runSmartAudit(updatedUser, shelf);
      }, 2000);
  };

  const handleAddToShelf = () => {
      if (!userProfile || !analyzedProduct) return;
      trackEvent('ADD_TO_SHELF', { type: analyzedProduct.type });
      const newShelf = [...shelf, analyzedProduct];
      persistState(userProfile, newShelf);
      setAnalyzedProduct(null);
      setCurrentView(AppView.SMART_SHELF);
  };

  const handleDiscardProduct = () => {
      if (analyzedProduct) trackEvent('DISCARD_PRODUCT', { reason: 'User choice' });
      setAnalyzedProduct(null);
      setCurrentView(AppView.SMART_SHELF); 
  };

  const handleRemoveProduct = (id: string) => {
      if (!userProfile) return;
      trackEvent('REMOVE_PRODUCT');
      const newShelf = shelf.filter(p => p.id !== id);
      persistState(userProfile, newShelf);
  };

  const handleUpdateProduct = (updated: Product) => {
       if (!userProfile) return;
       const newShelf = shelf.map(p => p.id === updated.id ? updated : p);
       persistState(userProfile, newShelf);
  }

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
      // 1. Detect if biometrics changed (Deletion/Edit/Scan)
      const oldTs = userProfile?.biometrics?.timestamp;
      const newTs = updatedProfile.biometrics?.timestamp;
      const hasBiometricsChanged = oldTs !== newTs;
      const hasShelf = shelf.length > 0;

      // 2. Update Local State & Storage Immediately
      setUserProfile(updatedProfile);
      saveUserData(updatedProfile, shelf);

      // 3. Handle Shelf Audit Sync if needed
      if (hasBiometricsChanged && hasShelf) {
          // If all scans deleted -> Wipe audit flags locally
          if (!updatedProfile.hasScannedFace) {
               const wipedShelf = shelf.map(p => ({
                   ...p,
                   risks: p.risks?.filter(r => r.ingredient !== 'AI AUDIT') || []
               }));
               setShelf(wipedShelf);
               saveUserData(updatedProfile, wipedShelf);
               setNotification({ type: 'GENERIC', title: 'Data Cleared', description: 'Shelf audit data reset.' });
          } else {
               // If reverted to previous scan -> Re-run audit against that scan
               runSmartAudit(updatedProfile, shelf); 
          }
      }
  };

  const handleResetApp = () => {
      trackEvent('RESET_APP');
      clearLocalData();
      setUserProfile(null);
      setShelf([]);
      setCurrentView(AppView.LANDING);
  }

  const handleCodeUnlock = () => {
      if (!userProfile) return;
      trackEvent('CODE_REDEEMED');
      const updatedUser = { ...userProfile, isPremium: true };
      persistState(updatedUser, shelf);
      setShowPremiumModal(false);
      setNotification({ type: 'GENERIC', title: 'Premium Unlocked!', description: 'Access code redeemed successfully.', actionLabel: 'Awesome', onAction: () => {} });
  };

  const handleMockLogin = () => {
      trackEvent('LOGIN_SUCCESS');
      if (userProfile) {
          let updatedUser = { ...userProfile, isAnonymous: false };
          if (pendingScan) {
              updatedUser = { ...updatedUser, hasScannedFace: true, biometrics: pendingScan.metrics, faceImage: pendingScan.image, scanHistory: [...(updatedUser.scanHistory || []), pendingScan.metrics] };
              setPendingScan(null); 
              setCurrentView(AppView.DASHBOARD); 
              setTimeout(() => setActiveGuide('SCAN'), 5000);
          }
          persistState(updatedUser, shelf);
      }
      setShowSaveModal(false);
      setNotification({ type: 'GENERIC', title: 'Account Synced', description: 'Your data is now saved to the cloud.', actionLabel: 'OK', onAction: () => {} });
  };

  // --- GESTURE NAVIGATION ---
  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartX.current = e.targetTouches[0].clientX;
      touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStartX.current || !touchStartY.current) return;
      
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      
      const diffX = touchStartX.current - touchEndX;
      const diffY = touchStartY.current - touchEndY;

      // Reset
      touchStartX.current = null;
      touchStartY.current = null;

      // Thresholds: Min distance 50px, and horizontal dominance (to differentiate from scroll)
      if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
          const direction = diffX > 0 ? 'next' : 'prev'; // Left swipe (diffX > 0) -> Next
          
          // Navigation Order (Skipping SCAN_ACTION as it's an action/modal)
          const tabs = [AppView.DASHBOARD, AppView.SMART_SHELF, AppView.AI_ASSISTANT, AppView.PROFILE_SETUP];
          const currentIndex = tabs.indexOf(currentView);
          
          if (currentIndex === -1) return; // Not on a main navigation tab

          if (direction === 'next' && currentIndex < tabs.length - 1) {
              setCurrentView(tabs[currentIndex + 1]);
          } else if (direction === 'prev' && currentIndex > 0) {
              setCurrentView(tabs[currentIndex - 1]);
          }
      }
  };

  if (isAdminMode) return <AdminDashboard onExit={() => { setIsAdminMode(false); window.history.replaceState({}, document.title, window.location.pathname); }} />;

  // Determine if BottomNav should be visible
  const shouldShowNav = userProfile && 
                        userProfile.hasScannedFace && 
                        [AppView.DASHBOARD, AppView.SMART_SHELF, AppView.PROFILE_SETUP, AppView.ROUTINE_BUILDER].includes(currentView) &&
                        !analyzedProduct; 

  const renderView = () => {
      if (!userProfile && ![AppView.LANDING, AppView.ONBOARDING].includes(currentView)) {
          return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
      }

      switch (currentView) {
          case AppView.LANDING: return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
          case AppView.ONBOARDING: return <Onboarding onComplete={handleOnboardingComplete} onSignIn={() => openAuth('GENERIC')} initialName={prefillName} />;
          case AppView.FACE_SCANNER: return <FaceScanner onScanComplete={handleFaceScanComplete} scanHistory={userProfile?.scanHistory} onCancel={userProfile?.hasScannedFace ? () => setCurrentView(AppView.DASHBOARD) : undefined} referenceImage={userProfile?.faceImage} shelf={shelf} />;
          case AppView.DASHBOARD:
              if (userProfile && !userProfile.hasScannedFace) return <FaceScanner onScanComplete={handleFaceScanComplete} scanHistory={userProfile?.scanHistory} shelf={shelf} />;
              return userProfile ? (
                  <SkinAnalysisReport 
                      userProfile={userProfile} 
                      shelf={shelf} 
                      onRescan={() => {
                          // Freemium Limit for Face Scan: 3
                          if (!userProfile.isPremium && (userProfile.scanHistory?.length || 0) >= LIMIT_SCANS) {
                              handleUnlockPremium();
                          } else {
                              setCurrentView(AppView.FACE_SCANNER);
                          }
                      }} 
                      onConsultAI={(q) => { setAiQuery(q); setCurrentView(AppView.AI_ASSISTANT); }} 
                      onViewProgress={() => setCurrentView(AppView.PROFILE_SETUP)} 
                      onOpenRoutineBuilder={() => setCurrentView(AppView.ROUTINE_BUILDER)} 
                      onLoginRequired={(reason) => openAuth(reason as AuthTrigger)} 
                      onUnlockPremium={handleUnlockPremium}
                      onOpenSimulator={() => setCurrentView(AppView.SKIN_SIMULATOR)}
                      onScanProduct={() => { 
                          if (userProfile && !userProfile.isPremium && (userProfile.usage?.manualScans || 0) >= LIMIT_SCANS) { 
                              handleUnlockPremium(); 
                          } else { 
                              setCurrentView(AppView.PRODUCT_SCANNER); 
                          } 
                      }}
                  />
              ) : null;
          case AppView.SKIN_SIMULATOR:
              return userProfile ? (
                  <SkinSimulator 
                      user={userProfile}
                      onBack={() => setCurrentView(AppView.DASHBOARD)}
                      location={userLocation}
                      onUpdateUser={handleProfileUpdate}
                      usageCount={userProfile.usage?.simulatorViews || 0}
                      onIncrementUsage={() => incrementUsage('simulatorViews')}
                      isPremium={!!userProfile.isPremium}
                      onUnlockPremium={handleUnlockPremium}
                  />
              ) : null;
          case AppView.SMART_SHELF:
              return userProfile ? (
                  <SmartShelf 
                      products={shelf} 
                      userProfile={userProfile} 
                      onRemoveProduct={handleRemoveProduct} 
                      onUpdateProduct={handleUpdateProduct} 
                      onScanNew={() => { setActiveGuide(null); if (!userProfile.isPremium && (userProfile.usage?.manualScans || 0) >= LIMIT_SCANS) { handleUnlockPremium(); } else { setCurrentView(AppView.PRODUCT_SCANNER); } }} 
                      onMoveToShelf={handleMoveToShelf} 
                      onRemoveFromWishlist={handleRemoveFromWishlist}
                      onOpenRoutineBuilder={() => setCurrentView(AppView.ROUTINE_BUILDER)}
                      auditReport={auditReport}
                      onClearAudit={() => setAuditReport(null)}
                      onFindAlternative={handleFindAlternative}
                  />
              ) : null;
          case AppView.PRODUCT_SCANNER:
              return userProfile ? (
                  <ProductScanner 
                     userProfile={userProfile}
                     shelf={shelf}
                     onStartAnalysis={(base64) => {
                         handleBackgroundAnalysis('IMAGE', base64);
                     }}
                     onCancel={() => { 
                         if (userProfile.hasScannedFace) setCurrentView(AppView.SMART_SHELF); 
                         else setCurrentView(AppView.DASHBOARD); 
                     }}
                     onSwitchToSearch={() => setCurrentView(AppView.PRODUCT_SEARCH)}
                     usageCount={userProfile.usage?.manualScans || 0}
                     limit={LIMIT_SCANS}
                     isPremium={!!userProfile.isPremium}
                     onUnlockPremium={handleUnlockPremium}
                  />
              ) : null;
          case AppView.PRODUCT_SEARCH:
              return userProfile ? (
                  <ProductSearch 
                     userProfile={userProfile}
                     shelf={shelf}
                     onStartAnalysis={(name, brand) => {
                         handleBackgroundAnalysis('SEARCH', name, brand);
                     }}
                     onCancel={() => setCurrentView(AppView.SMART_SHELF)}
                     usageCount={userProfile.usage?.manualScans || 0}
                     limit={LIMIT_SCANS}
                     isPremium={!!userProfile.isPremium}
                     onUnlockPremium={handleUnlockPremium}
                  />
              ) : null;
          case AppView.BUYING_ASSISTANT:
              return userProfile && analyzedProduct ? (
                  <BuyingAssistant 
                      product={analyzedProduct} 
                      user={userProfile} 
                      shelf={shelf} 
                      onAddToShelf={handleAddToShelf} 
                      onDiscard={handleDiscardProduct} 
                      onUnlockPremium={handleUnlockPremium} 
                      usageCount={userProfile.usage?.buyingAssistantViews || 0} 
                      onIncrementUsage={() => incrementUsage('buyingAssistantViews')} 
                      onFindAlternative={handleFindAlternative}
                  />
              ) : null;
          case AppView.PROFILE_SETUP:
              return userProfile ? (
                  <ProfileSetup 
                      user={userProfile} 
                      shelf={shelf} 
                      onComplete={handleProfileUpdate} 
                      onBack={() => setCurrentView(AppView.DASHBOARD)} 
                      onReset={handleResetApp} 
                      onLoginRequired={(trigger) => openAuth(trigger as AuthTrigger)}
                      installPrompt={installPrompt}
                  />
              ) : null;
          case AppView.ROUTINE_BUILDER:
              return userProfile ? (
                  <PremiumRoutineBuilder 
                      user={userProfile} 
                      onBack={() => setCurrentView(AppView.DASHBOARD)} 
                      onUnlockPremium={handleUnlockPremium} 
                      usageCount={userProfile.usage?.routineGenerations || 0} 
                      onIncrementUsage={() => incrementUsage('routineGenerations')}
                      
                      onProductSelect={(prod) => {
                          handleBackgroundAnalysis('SEARCH', prod.name, prod.brand);
                      }}
                      onGenerateBackground={(category, price, allergies, goals) => {
                          handleBackgroundRoutine(category, price, allergies, goals);
                      }}
                      savedResults={routineResults}
                      onSaveResults={setRoutineResults}
                      onAddToWishlist={handleAddToWishlist}
                      initialCategory={targetRoutineCategory}
                  />
              ) : null;
          case AppView.AI_ASSISTANT:
              return userProfile ? (
                  <AIAssistant 
                      user={userProfile} 
                      shelf={shelf} 
                      triggerQuery={aiQuery} 
                      onUnlockPremium={handleUnlockPremium}
                      location={userLocation} 
                      onClose={() => setCurrentView(AppView.DASHBOARD)}
                  />
              ) : null;
          default: return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
      }
  };

  return (
    <div 
        className="bg-zinc-50 min-h-screen font-sans"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
    >
      {isGlobalLoading && (
          <SplashScreen message={loadingMessage || "Syncing Profile..."} />
      )}
      {renderView()}
      
      {/* Global Bottom Navigation (Overlay) */}
      {shouldShowNav && (
          <BottomNavigation 
              currentView={currentView}
              onNavigate={setCurrentView}
              onScan={() => {
                  if (userProfile && !userProfile.isPremium && (userProfile.usage?.manualScans || 0) >= LIMIT_SCANS) {
                      handleUnlockPremium();
                  } else {
                      setCurrentView(AppView.PRODUCT_SCANNER);
                  }
              }}
          />
      )}

      {showSwipeInstruction && <SwipeInstructionOverlay onDismiss={dismissSwipeInstruction} />}

      {backgroundTask && <BackgroundTaskBar label={backgroundTask.label} />}
      {showSaveModal && <SaveProfileModal onSave={() => {}} onClose={() => setShowSaveModal(false)} onMockLogin={handleMockLogin} mode={saveModalTrigger === 'GENERIC' ? 'LOGIN' : 'SAVE'} trigger={saveModalTrigger} />}
      {showPremiumModal && <BetaOfferModal onClose={() => setShowPremiumModal(false)} onConfirm={() => startCheckout()} onCodeSuccess={handleCodeUnlock} />}
      {notification && <SmartNotification {...notification} onClose={() => setNotification(null)} />}
      {activeGuide && <GuideOverlay step={activeGuide} onDismiss={() => setActiveGuide(null)} onNext={() => setActiveGuide(null)} />}
    </div>
  );
};

export default App;
