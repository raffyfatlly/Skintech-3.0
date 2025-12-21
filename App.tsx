
import React, { useState, useEffect, useRef } from 'react';
import { 
  AppView, 
  UserProfile, 
  Product, 
  SkinMetrics, 
  SkinType 
} from './types';
import { loadUserData, saveUserData, syncLocalToCloud, clearLocalData } from './services/storageService';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { startCheckout } from './services/stripeService';

// Components
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import FaceScanner from './components/FaceScanner';
import SkinAnalysisReport from './components/SkinAnalysisReport';
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

// Icons
import { ScanFace, LayoutGrid, User, Search, Home, Loader, ScanBarcode } from 'lucide-react';

const App: React.FC = () => {
  // --- STATE ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.LANDING);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [shelf, setShelf] = useState<Product[]>([]);
  
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const viewRef = useRef<AppView>(AppView.LANDING);

  const [analyzedProduct, setAnalyzedProduct] = useState<Product | null>(null);
  const [prefillName, setPrefillName] = useState<string>('');
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  
  // Auth & Premium Modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalTrigger, setSaveModalTrigger] = useState<AuthTrigger>('GENERIC');
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // New: Scanner Guide Bubble State
  const [activeGuide, setActiveGuide] = useState<'SCAN' | null>(null);

  const [notification, setNotification] = useState<{ type: NotificationType, title: string, description: string, actionLabel: string, onAction: () => void } | null>(null);
  const [aiQuery, setAiQuery] = useState<string | null>(null);

  useEffect(() => { viewRef.current = currentView; }, [currentView]);

  const openAuth = (trigger: AuthTrigger) => {
      setSaveModalTrigger(trigger);
      setShowSaveModal(true);
  };

  const handleUnlockPremium = () => {
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

  useEffect(() => {
    const init = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const isPaymentSuccess = urlParams.get('payment') === 'success';

      const data = await loadUserData();
      let currentUser = data.user;

      // Handle Anonymous Payment Success here
      if (isPaymentSuccess && currentUser) {
          console.log("Payment detected (Local Init)");
          currentUser = { ...currentUser, isPremium: true };
          // We don't clear URL here to allow auth state listener to also see it if needed
          saveUserData(currentUser, data.shelf);
          
          if (!auth?.currentUser) {
             setNotification({
                type: 'GENERIC',
                title: 'Premium Unlocked!',
                description: 'You now have unlimited access.',
                actionLabel: 'Great',
                onAction: () => {}
             });
             window.history.replaceState({}, document.title, window.location.pathname);
          }
      }

      if (currentUser) {
        setUserProfile(currentUser);
        setShelf(data.shelf);
        if (currentUser.hasScannedFace) {
            setCurrentView(AppView.DASHBOARD);
        } else {
            setCurrentView(AppView.FACE_SCANNER);
        }
      } else {
        setCurrentView(AppView.LANDING);
      }
    };
    init();

    const unsubscribe = auth ? onAuthStateChanged(auth, async (user) => {
        if (user) {
            const isLoginFlow = viewRef.current === AppView.LANDING || viewRef.current === AppView.ONBOARDING;
            if (isLoginFlow) setIsGlobalLoading(true);

            try {
                // 1. Sync any local data (including anonymous payments) to cloud
                await syncLocalToCloud();
                
                // 2. Load fresh data
                const data = await loadUserData();
                let currentUser = data.user;

                // 3. CRITICAL: Handle Payment Success Check for Cloud Account
                // If the user just returned from Stripe, ensure we mark them as premium
                // even if the cloud data hasn't updated yet.
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('payment') === 'success' && currentUser) {
                     console.log("Payment detected (Auth Listener)");
                     currentUser = { ...currentUser, isPremium: true };
                     
                     // Force save to cloud immediately
                     await saveUserData(currentUser, data.shelf);
                     
                     setNotification({
                        type: 'GENERIC',
                        title: 'Premium Unlocked!',
                        description: 'Your account has been upgraded.',
                        actionLabel: 'Awesome',
                        onAction: () => {}
                     });
                     
                     // Clear URL to prevent re-triggering
                     window.history.replaceState({}, document.title, window.location.pathname);
                }

                if (currentUser) {
                    setUserProfile(currentUser);
                    setShelf(data.shelf);
                    if (isLoginFlow) {
                        setCurrentView(currentUser.hasScannedFace ? AppView.DASHBOARD : AppView.FACE_SCANNER);
                    }
                } else if (isLoginFlow) {
                    if (user.displayName) setPrefillName(user.displayName);
                    setCurrentView(AppView.ONBOARDING);
                }
            } catch (e) {
                console.error("Auth Sync Error", e);
            } finally {
                setTimeout(() => {
                    setIsGlobalLoading(false);
                    setShowSaveModal(false); 
                }, 500);
            }
        }
    }) : () => {};

    return () => unsubscribe();
  }, []);

  const handleOnboardingComplete = (data: { name: string; age: number; skinType: SkinType }) => {
      const isAuth = !!auth?.currentUser;
      const newUser: UserProfile = {
          name: data.name,
          age: data.age,
          skinType: data.skinType,
          hasScannedFace: false,
          biometrics: {} as any, 
          isAnonymous: !isAuth,
          isPremium: false 
      };
      setUserProfile(newUser);
      if (isAuth) saveUserData(newUser, shelf);
      else persistState(newUser, shelf);
      setCurrentView(AppView.FACE_SCANNER);
  };

  const handleFaceScanComplete = (metrics: SkinMetrics, image: string) => {
      if (!userProfile) return;

      const updatedUser: UserProfile = {
          ...userProfile,
          hasScannedFace: true,
          biometrics: metrics,
          faceImage: image,
          scanHistory: [...(userProfile.scanHistory || []), metrics]
      };

      persistState(updatedUser, shelf);
      setCurrentView(AppView.DASHBOARD);
      
      // Trigger Guide Bubble after scan
      setTimeout(() => {
          setActiveGuide('SCAN');
      }, 5000);
  };

  const handleProductFound = (product: Product) => {
      setAnalyzedProduct(product);
      setCurrentView(AppView.BUYING_ASSISTANT);
  };

  const handleAddToShelf = () => {
      if (!userProfile || !analyzedProduct) return;
      const newShelf = [...shelf, analyzedProduct];
      persistState(userProfile, newShelf);
      setAnalyzedProduct(null);
      setCurrentView(AppView.SMART_SHELF);
  };

  const handleDiscardProduct = () => {
      setAnalyzedProduct(null);
      setCurrentView(AppView.SMART_SHELF); 
  };

  const handleRemoveProduct = (id: string) => {
      if (!userProfile) return;
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
      clearLocalData();
      setUserProfile(null);
      setShelf([]);
      setCurrentView(AppView.LANDING);
  }

  const handleCodeUnlock = () => {
      if (!userProfile) return;
      const updatedUser = { ...userProfile, isPremium: true };
      persistState(updatedUser, shelf);
      setShowPremiumModal(false);
      setNotification({
          type: 'GENERIC',
          title: 'Premium Unlocked!',
          description: 'Access code redeemed successfully.',
          actionLabel: 'Awesome',
          onAction: () => {}
      });
  };

  const renderNavBar = () => {
      if (isGlobalLoading) return null;
      if ([AppView.LANDING, AppView.ONBOARDING, AppView.FACE_SCANNER, AppView.PRODUCT_SCANNER, AppView.PRODUCT_SEARCH, AppView.BUYING_ASSISTANT, AppView.ROUTINE_BUILDER].includes(currentView)) return null;

      const navItemClass = (view: AppView) => 
        `flex flex-col items-center gap-1 p-2 rounded-2xl transition-all duration-300 ${currentView === view ? 'text-teal-600 bg-teal-50 scale-105' : 'text-zinc-400 hover:text-zinc-600'}`;

      const handleNavClick = (view: AppView) => {
          if ((view === AppView.PRODUCT_SEARCH || view === AppView.PRODUCT_SCANNER) && userProfile?.isAnonymous) {
              openAuth('SCAN_PRODUCT');
              return;
          }
          setCurrentView(view);
      };

      // Elevate z-index if guide is active to show button above backdrop
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
                    onClick={() => {
                        setActiveGuide(null);
                        handleNavClick(AppView.PRODUCT_SCANNER);
                    }}
                    className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-teal-600/30 hover:scale-110 transition-transform active:scale-95"
                  >
                      <ScanBarcode size={24} />
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

  const renderView = () => {
      if (!userProfile && ![AppView.LANDING, AppView.ONBOARDING].includes(currentView)) {
          return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
      }

      switch (currentView) {
          case AppView.LANDING:
              return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
          case AppView.ONBOARDING:
              return <Onboarding onComplete={handleOnboardingComplete} onSignIn={() => openAuth('GENERIC')} initialName={prefillName} />;
          case AppView.FACE_SCANNER:
              return (
                  <FaceScanner 
                    onScanComplete={handleFaceScanComplete} 
                    scanHistory={userProfile?.scanHistory}
                    onCancel={userProfile?.hasScannedFace ? () => setCurrentView(AppView.DASHBOARD) : undefined} 
                    referenceImage={userProfile?.faceImage}
                  />
              );
          case AppView.DASHBOARD:
              // Safety: If user has no scanned face (e.g. deleted all scans), force FaceScanner
              if (userProfile && !userProfile.hasScannedFace) {
                  return (
                      <FaceScanner 
                        onScanComplete={handleFaceScanComplete} 
                        scanHistory={userProfile?.scanHistory}
                        // No cancel button allowed if forced
                      />
                  );
              }
              return userProfile ? (
                  <SkinAnalysisReport 
                    userProfile={userProfile} 
                    shelf={shelf} 
                    onRescan={() => setCurrentView(AppView.FACE_SCANNER)}
                    onConsultAI={(q) => { setAiQuery(q); setShowAIAssistant(true); }}
                    onViewProgress={() => setCurrentView(AppView.PROFILE_SETUP)}
                    onOpenRoutineBuilder={() => setCurrentView(AppView.ROUTINE_BUILDER)}
                    onLoginRequired={(reason) => openAuth(reason as AuthTrigger)}
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
                    onScanNew={() => {
                        setActiveGuide(null);
                        setCurrentView(AppView.PRODUCT_SCANNER);
                    }}
                  />
              ) : null;
          case AppView.PRODUCT_SCANNER:
              return userProfile ? (
                  <ProductScanner 
                     userProfile={userProfile}
                     shelf={shelf}
                     onProductFound={handleProductFound}
                     onCancel={() => {
                         if (userProfile.hasScannedFace) setCurrentView(AppView.SMART_SHELF);
                         else setCurrentView(AppView.DASHBOARD);
                     }}
                  />
              ) : null;
          case AppView.PRODUCT_SEARCH:
              return userProfile ? (
                  <ProductSearch 
                     userProfile={userProfile}
                     shelf={shelf}
                     onProductFound={handleProductFound}
                     onCancel={() => setCurrentView(AppView.SMART_SHELF)}
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
                  />
              ) : null;
          case AppView.ROUTINE_BUILDER:
              return userProfile ? (
                  <PremiumRoutineBuilder 
                      user={userProfile}
                      onBack={() => setCurrentView(AppView.DASHBOARD)}
                      onUnlockPremium={handleUnlockPremium}
                  />
              ) : null;
          default:
              return <LandingPage onGetStarted={() => setCurrentView(AppView.ONBOARDING)} onLogin={() => openAuth('GENERIC')} />;
      }
  };

  // --- MOCK LOGIN CALLBACK ---
  // When user successfully auths in modal, update state immediately to prevent "Anonymous" flicker
  const handleMockLogin = () => {
      if (userProfile) {
          setUserProfile({ ...userProfile, isAnonymous: false });
      }
      setShowSaveModal(false);
      setNotification({
          type: 'GENERIC',
          title: 'Account Synced',
          description: 'Your data is now saved to the cloud.',
          actionLabel: 'OK',
          onAction: () => {}
      });
  };

  return (
    <div className="bg-zinc-50 min-h-screen font-sans">
      {/* GLOBAL LOADING OVERLAY */}
      {isGlobalLoading && (
          <div className="fixed inset-0 z-[60] bg-white flex items-center justify-center">
              <div className="flex flex-col items-center">
                  <Loader size={32} className="text-teal-500 animate-spin mb-4" />
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest animate-pulse">Syncing Profile...</p>
              </div>
          </div>
      )}

      {renderView()}
      
      {renderNavBar()}

      {/* MODALS */}
      {userProfile && (
          <AIAssistant 
             user={userProfile}
             shelf={shelf}
             isOpen={showAIAssistant}
             onOpen={() => setShowAIAssistant(true)}
             onClose={() => setShowAIAssistant(false)}
             triggerQuery={aiQuery}
          />
      )}

      {showSaveModal && (
          <SaveProfileModal 
              onSave={() => {}} 
              onClose={() => setShowSaveModal(false)}
              onMockLogin={handleMockLogin}
              mode={saveModalTrigger === 'GENERIC' ? 'LOGIN' : 'SAVE'}
              trigger={saveModalTrigger}
          />
      )}

      {showPremiumModal && (
          <BetaOfferModal 
              onClose={() => setShowPremiumModal(false)}
              onConfirm={() => startCheckout()}
              onCodeSuccess={handleCodeUnlock}
          />
      )}

      {notification && (
          <SmartNotification 
              {...notification}
              onClose={() => setNotification(null)}
          />
      )}

      {/* Guide Overlay - Only show for Scan Step if active */}
      {activeGuide && (
          <GuideOverlay 
              step={activeGuide} 
              onDismiss={() => setActiveGuide(null)}
              onNext={() => setActiveGuide(null)}
          />
      )}
    </div>
  );
};

export default App;
