
import React, { useState, useEffect, useRef } from 'react';
import { 
  AppView, 
  UserProfile, 
  Product, 
  SkinMetrics, 
  SkinType, 
  UsageStats,
  RecommendedProduct
} from './types';
import { loadUserData, saveUserData, syncLocalToCloud, clearLocalData } from './services/storageService';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { startCheckout } from './services/stripeService';
import { trackEvent } from './services/analyticsService';
import { analyzeProductFromSearch, analyzeProductImage, generateTargetedRecommendations } from './services/geminiService'; // Import analyzer

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
import BuyingAssistant from './components/BuyingAssistant';
import PremiumRoutineBuilder from './components/PremiumRoutineBuilder';
import SaveProfileModal, { AuthTrigger } from './components/SaveProfileModal';
import SmartNotification, { NotificationType } from './components/SmartNotification';
import BetaOfferModal from './components/BetaOfferModal';
import GuideOverlay from './components/GuideOverlay';
import AdminDashboard from './components/AdminDashboard';
import BackgroundTaskBar from './components/BackgroundTaskBar';

import { ScanFace, LayoutGrid, User, Search, Home, Loader, ScanBarcode, Lock, Sparkles, Microscope, RefreshCw } from 'lucide-react';

const LIMIT_SCANS = 3;

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LANDING);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [shelf, setShelf] = useState<Product[]>([]);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const viewRef = useRef<AppView>(AppView.LANDING);
  const [analyzedProduct, setAnalyzedProduct] = useState<Product | null>(null);
  const [prefillName, setPrefillName] = useState<string>('');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalTrigger, setSaveModalTrigger] = useState<AuthTrigger>('GENERIC');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [pendingScan, setPendingScan] = useState<{metrics: SkinMetrics, image: string} | null>(null);
  const [activeGuide, setActiveGuide] = useState<'SCAN' | null>(null);
  const [backgroundTask, setBackgroundTask] = useState<{ label: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  // Notification State
  const [notification, setNotification] = useState<{ type: NotificationType, title: string, description: string, actionLabel?: string, onAction?: () => void } | null>(null);
  
  const [aiQuery, setAiQuery] = useState<string | null>(null);
  
  // Persisted Routine Results State
  const [routineResults, setRoutineResults] = useState<RecommendedProduct[]>([]);

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
      setUserProfile(newUser);
      setShelf(newShelf);
      saveUserData(newUser, newShelf);
  };

  const incrementUsage = (type: keyof UsageStats) => {
      if (!userProfile) return;
      
      const currentUsage = userProfile.usage || { buyingAssistantViews: 0, manualScans: 0, routineGenerations: 0 };
      const newUsage = { ...currentUsage, [type]: currentUsage[type] + 1 };
      const updatedUser = { ...userProfile, usage: newUsage };
      persistState(updatedUser, shelf);
  };

  // --- WISH LIST LOGIC ---
  const handleAddToWishlist = (product: Product) => {
      if (!userProfile) return;
      const currentWishlist = userProfile.wishlist || [];
      // Prevent duplicates
      if (currentWishlist.some(p => p.name === product.name)) {
          setNotification({ type: 'GENERIC', title: 'Already Saved', description: 'This product is already in your wishlist.', onClose: () => setNotification(null) });
          return;
      }
      const newWishlist = [...currentWishlist, product];
      const updatedUser = { ...userProfile, wishlist: newWishlist };
      persistState(updatedUser, shelf);
      setNotification({ type: 'GENERIC', title: 'Saved!', description: 'Product added to wishlist.', onClose: () => setNotification(null) });
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
      setNotification({ type: 'TASK_COMPLETE', title: 'Added to Routine', description: `${product.name} moved to shelf.`, onClose: () => setNotification(null) });
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
                  userProfile.biometrics,
                  undefined, 
                  productBrand,
                  shelfIngredients
              );
          } else {
              product = await analyzeProductImage(
                  payload, 
                  userProfile.biometrics, 
                  shelfIngredients
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
                  },
                  onClose: () => setNotification(null)
              });
          }

      } catch (err) {
          console.error("Background Analysis Error", err);
          
          setNotification({
              type: 'GENERIC',
              title: 'Analysis Failed',
              description: 'We encountered an issue connecting to the AI service. Please try again.',
              actionLabel: 'OK',
              onAction: () => {},
              onClose: () => setNotification(null)
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
          const data = await generateTargetedRecommendations(userProfile, category, maxPrice, allergies, goals);
          
          setRoutineResults(data);
          
          if (viewRef.current !== originatingView) {
              setNotification({
                  type: 'TASK_COMPLETE',
                  title: 'Routine Ready',
                  description: `Found ${data.length} matches for ${category}.`,
                  actionLabel: 'View',
                  onAction: () => setCurrentView(AppView.ROUTINE_BUILDER),
                  onClose: () => setNotification(null)
              });
          }

      } catch (e) {
          console.error("Routine Error", e);
          setNotification({
              type: 'GENERIC',
              title: 'Search Failed',
              description: 'Could not generate recommendations. Try simpler filters.',
              actionLabel: 'OK',
              onAction: () => {},
              onClose: () => setNotification(null)
          });
          if (viewRef.current === AppView.ROUTINE_BUILDER) {
               setRoutineResults([]);
          }
      } finally {
          setBackgroundTask(null);
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
             setNotification({ type: 'GENERIC', title: 'Premium Unlocked!', description: 'You now have unlimited access.', actionLabel: 'Great', onAction: () => {}, onClose: () => setNotification(null) });
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
                     setNotification({ type: 'GENERIC', title: 'Premium Unlocked!', description: 'Your account has been upgraded.', actionLabel: 'Awesome', onAction: () => {}, onClose: () => setNotification(null) });
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
            } catch (e) { console.error(e); } finally { setTimeout(() => setIsGlobalLoading(false), 500); setLoadingMessage(null); }
        }
    }) : () => {};
    return () => unsubscribe();
  }, []);

  const handleOnboardingComplete = (data: { name: string; age: number; skinType: SkinType }) => {
      trackEvent('ONBOARDING_COMPLETE');
      const isAuth = !!auth?.currentUser;
      const newUser: UserProfile = {
          name: data.name, age: data.age, skinType: data.skinType, hasScannedFace: false, biometrics: {} as any, 
          isAnonymous: !isAuth, isPremium: false,
          usage: { buyingAssistantViews: 0, manualScans: 0, routineGenerations: 0 }
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
          ...userProfile, hasScannedFace: true, biometrics: metrics, faceImage: image,
          scanHistory: [...(userProfile.scanHistory || []), metrics],
          usage: userProfile.usage || { buyingAssistantViews: 0, manualScans: 0, routineGenerations: 0 }
      };
      persistState(updatedUser, shelf);
      setCurrentView(AppView.DASHBOARD);
      setTimeout(() => setActiveGuide('SCAN'), 5000);
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
      persistState(updatedProfile, shelf);
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
      setNotification({ type: 'GENERIC', title: 'Premium Unlocked!', description: 'Access code redeemed successfully.', actionLabel: 'Awesome', onAction: () => {}, onClose: () => setNotification(null) });
  };

  const renderNavBar = () => {
      if (isGlobalLoading || isAdminMode) return null;
      if ([AppView.LANDING, AppView.ONBOARDING, AppView.FACE_SCANNER, AppView.PRODUCT_SCANNER, AppView.PRODUCT_SEARCH, AppView.BUYING_ASSISTANT, AppView.ROUTINE_BUILDER].includes(currentView)) return null;

      const navItemClass = (view: AppView) => 
        `flex flex-col items-center gap-1 p-2 rounded-2xl transition-all duration-300 ${currentView === view ? 'text-teal-600 bg-teal-50 scale-105' : 'text-zinc-400 hover:text-zinc-600'}`;

      const handleNavClick = (view: AppView) => {
          if (view === AppView.PRODUCT_SCANNER && userProfile?.isAnonymous) {
              openAuth('SCAN_PRODUCT');
              return;
          }
          if (view === AppView.PRODUCT_SEARCH || view === AppView.PRODUCT_SCANNER) {
              if (!userProfile?.isPremium) {
                  const used = userProfile?.usage?.manualScans || 0;
                  if (used >= LIMIT_SCANS) {
                      handleUnlockPremium();
                      return;
                  }
              }
          }
          setCurrentView(view);
      };

      const navZIndex = activeGuide ? 'z-[60]' : 'z-30';

      return (
          <div className={`fixed bottom-6 left-6 right-6 h-20 bg-white/90 backdrop-blur-xl border border-zinc-200/50 rounded-[2rem] shadow-2xl flex items-center justify-around max-w-md mx-auto animate-in slide-in-from-bottom-24 duration-700 ${navZIndex}`}>
              <button onClick={() => handleNavClick(AppView.DASHBOARD)} className={navItemClass(AppView.DASHBOARD)}>
                  <Home size={22} strokeWidth={currentView === AppView.DASHBOARD ? 2.5 : 2} />
              </button>
              <button onClick={() => handleNavClick(AppView.SMART_SHELF)} className={navItemClass(AppView.SMART_SHELF)}>
                  <LayoutGrid size={22} strokeWidth={currentView === AppView.SMART_SHELF ? 2.5 : 2} />
              </button>
              <div className="relative -top-8">
                  <button 
                    onClick={() => { setActiveGuide(null); handleNavClick(AppView.PRODUCT_SCANNER); }}
                    className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-teal-600/30 hover:scale-110 transition-transform active:scale-95 relative"
                  >
                      <ScanBarcode size={24} />
                      {!userProfile?.isPremium && (
                          <div className="absolute -bottom-2 bg-amber-400 text-amber-900 text-[9px] font-bold px-2 py-0.5 rounded-full border border-white">
                              {(userProfile?.usage?.manualScans || 0)}/{LIMIT_SCANS}
                          </div>
                      )}
                  </button>
              </div>
              <button onClick={() => handleNavClick(AppView.PRODUCT_SEARCH)} className={navItemClass(AppView.PRODUCT_SEARCH)}>
                  <Search size={22} strokeWidth={currentView === AppView.PRODUCT_SEARCH ? 2.5 : 2} />
              </button>
              <button onClick={() => handleNavClick(AppView.PROFILE_SETUP)} className={navItemClass(AppView.PROFILE_SETUP)}>
                  <User size={22} strokeWidth={currentView === AppView.PROFILE_SETUP ? 2.5 : 2} />
              </button>
          </div>
      );
  };

  if (isAdminMode) return <AdminDashboard onExit={() => { setIsAdminMode(false); window.history.replaceState({}, document.title, window.location.pathname); }} />;

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
              return userProfile ? <SkinAnalysisReport userProfile={userProfile} shelf={shelf} onRescan={() => setCurrentView(AppView.FACE_SCANNER)} onConsultAI={(q) => { setAiQuery(q); setShowAIAssistant(true); }} onViewProgress={() => setCurrentView(AppView.PROFILE_SETUP)} onOpenRoutineBuilder={() => setCurrentView(AppView.ROUTINE_BUILDER)} onLoginRequired={(reason) => openAuth(reason as AuthTrigger)} onUnlockPremium={handleUnlockPremium} /> : null;
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
              return userProfile && analyzedProduct ? <BuyingAssistant product={analyzedProduct} user={userProfile} shelf={shelf} onAddToShelf={handleAddToShelf} onDiscard={handleDiscardProduct} onUnlockPremium={handleUnlockPremium} usageCount={userProfile.usage?.buyingAssistantViews || 0} onIncrementUsage={() => incrementUsage('buyingAssistantViews')} /> : null;
          case AppView.PROFILE_SETUP:
              return userProfile ? <ProfileSetup user={userProfile} shelf={shelf} onComplete={handleProfileUpdate} onBack={() => setCurrentView(AppView.DASHBOARD)} onReset={handleResetApp} onLoginRequired={(trigger) => openAuth(trigger as AuthTrigger)} installPrompt={installPrompt} /> : null;
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
                  />
              ) : null;
          default: return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
      }
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
          setUserProfile(updatedUser);
          persistState(updatedUser, shelf);
      }
      setShowSaveModal(false);
      setNotification({ type: 'GENERIC', title: 'Account Synced', description: 'Your data is now saved to the cloud.', actionLabel: 'OK', onAction: () => {}, onClose: () => setNotification(null) });
  };

  return (
    <div className="bg-zinc-50 min-h-screen font-sans">
      {isGlobalLoading && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center max-w-xs w-full text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 via-emerald-500 to-teal-600 animate-[shimmer_2s_infinite]" style={{ backgroundSize: '200% 100%' }}></div>
                      
                      <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mb-6 relative shadow-inner">
                          <div className="absolute inset-0 border-4 border-zinc-100 rounded-full"></div>
                          <div className="absolute inset-0 border-4 border-t-teal-500 border-r-teal-500/30 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                          <RefreshCw size={28} className="text-teal-600" />
                      </div>
                      
                      <h3 className="text-xl font-black text-zinc-900 mb-2 tracking-tight">
                          {loadingMessage || "Syncing Profile..."}
                      </h3>
                      
                      <p className="text-xs text-zinc-500 font-medium leading-relaxed max-w-[200px]">
                          Updating your secure dashboard...
                      </p>
                  </div>
          </div>
      )}
      {renderView()}
      {renderNavBar()}
      {backgroundTask && <BackgroundTaskBar label={backgroundTask.label} />}
      {userProfile && <AIAssistant user={userProfile} shelf={shelf} isOpen={showAIAssistant} onOpen={() => setShowAIAssistant(true)} onClose={() => setShowAIAssistant(false)} triggerQuery={aiQuery} onUnlockPremium={handleUnlockPremium} />}
      {showSaveModal && <SaveProfileModal onSave={() => {}} onClose={() => setShowSaveModal(false)} onMockLogin={handleMockLogin} mode={saveModalTrigger === 'GENERIC' ? 'LOGIN' : 'SAVE'} trigger={saveModalTrigger} />}
      {showPremiumModal && <BetaOfferModal onClose={() => setShowPremiumModal(false)} onConfirm={() => startCheckout()} onCodeSuccess={handleCodeUnlock} />}
      {notification && <SmartNotification {...notification} onClose={() => setNotification(null)} />}
      {activeGuide && <GuideOverlay step={activeGuide} onDismiss={() => setActiveGuide(null)} onNext={() => setActiveGuide(null)} />}
    </div>
  );
};

export default App;
