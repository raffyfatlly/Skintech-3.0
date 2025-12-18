
import React, { useState } from 'react';
import { X, ShieldCheck, Cloud, UserCheck, Mail, Lock, ArrowRight, AlertTriangle, Loader, Check, Fingerprint, History, Sparkles, ScanBarcode, LineChart, Crown } from 'lucide-react';
import { signInWithGoogle, registerWithEmail, loginWithEmail } from '../services/firebase';

export type AuthTrigger = 'SCAN_PRODUCT' | 'RESCAN_FACE' | 'VIEW_PROGRESS' | 'GENERIC' | 'SAVE_RESULTS' | 'UNLOCK_DEAL';

interface SaveProfileModalProps {
  onSave: () => void;
  onClose: () => void;
  onMockLogin?: () => void;
  mode: 'LOGIN' | 'SAVE';
  trigger?: AuthTrigger;
}

// Google Logo Component
const GoogleLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const SaveProfileModal: React.FC<SaveProfileModalProps> = ({ onSave, onClose, onMockLogin, mode, trigger = 'GENERIC' }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Toggle between "Save Profile" (Signup) and "Login" states inside the modal
  const [isLoginView, setIsLoginView] = useState(mode === 'LOGIN');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
        await signInWithGoogle();
        setTimeout(() => onClose(), 500); 
    } catch (e: any) {
        handleAuthError(e);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
          if (isLoginView) {
              await loginWithEmail(email, password);
          } else {
              if (password !== confirmPassword) {
                  throw new Error("Passwords do not match.");
              }
              // Generate display name from email (part before @, capitalized)
              const namePart = email.split('@')[0];
              const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
              
              await registerWithEmail(displayName, email, password);
          }
          setTimeout(() => onClose(), 500);
      } catch (e: any) {
          handleAuthError(e);
      }
  };

  const handleAuthError = (e: any) => {
    console.error(e);
    const msg = (e.message || "").toLowerCase();
    const code = e.code || "";

    // AUTO-FALLBACK FOR PREVIEW ENVIRONMENTS
    if (msg.includes("unauthorized-domain") || msg.includes("domain not authorized") || code === "auth/unauthorized-domain") {
            console.warn("Preview environment detected (Domain unauthorized). Enabling Preview Mode.");
            if (onMockLogin) {
                onMockLogin(); 
                return;
            }
    }

    if (code === "auth/email-already-in-use") {
        setError("Email already exists. Try logging in.");
    } else if (code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setError("Invalid email or password.");
    } else if (code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
    } else if (msg.includes("firebase not configured")) {
            setError("Database not connected. Check services/firebase.ts config.");
    } else if (msg.includes("google sign-in is not enabled")) {
            setError("Please enable Google Sign-In in your Firebase Console.");
    } else {
            setError(e.message || "Authentication failed.");
    }
    setLoading(false);
  };

  const Feature = ({ icon: Icon, text }: { icon: any, text: string }) => (
      <div className="flex items-center gap-2 text-zinc-600">
          <div className="w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100/50">
              <Icon size={10} strokeWidth={3} />
          </div>
          <span className="text-xs font-bold tracking-tight">{text}</span>
      </div>
  );

  // --- CONTEXTUAL CONTENT LOGIC ---
  const getContextContent = () => {
      if (isLoginView) {
          return {
              title: "Welcome Back",
              desc: "Log in to access your dashboard & history.",
              icon: UserCheck
          };
      }

      switch (trigger) {
          case 'SCAN_PRODUCT':
              return {
                  title: "Unlock Smart Scanner",
                  desc: "Create a free account to analyze ingredients and save matches to your shelf.",
                  icon: ScanBarcode
              };
          case 'RESCAN_FACE':
              return {
                  title: "Track Skin Health",
                  desc: "Create a free account to save your baseline and measure how your metrics improve over time.",
                  icon: Sparkles
              };
          case 'VIEW_PROGRESS':
              return {
                  title: "Unlock Trends",
                  desc: "Create an account to visualize your skin health journey and see what's working.",
                  icon: LineChart
              };
          case 'SAVE_RESULTS':
              return {
                  title: "Save Your Results",
                  desc: "Don't lose this analysis. Create an account to access it later.",
                  icon: ShieldCheck
              };
          case 'UNLOCK_DEAL':
              return {
                  title: "Claim Exclusive Offer",
                  desc: "Create a free account to unlock premium features and secure your lifetime access.",
                  icon: Crown
              };
          default:
              return {
                  title: "Save Your Skin DNA",
                  desc: "Create a free account to unlock progress tracking and cloud sync.",
                  icon: Fingerprint
              };
      }
  };

  const content = getContextContent();
  const IconComponent = content.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-[22rem] bg-white rounded-[2rem] p-6 relative animate-in zoom-in-95 shadow-2xl border border-white/50 max-h-[90vh] overflow-y-auto no-scrollbar">
        
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50 rounded-full -mr-20 -mt-20 blur-3xl opacity-50 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-50 rounded-full -ml-16 -mb-16 blur-2xl opacity-50 pointer-events-none"></div>

        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/80 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-white transition-all z-50 shadow-sm border border-zinc-100">
          <X size={18} />
        </button>

        <div className="relative z-10">
            {/* Header - Compacted */}
            <div className="text-center mb-5 mt-2">
                {/* UPDATED ICON STYLE: Mint Teal Icon on Light Background */}
                <div className="w-14 h-14 bg-teal-50 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-lg shadow-teal-500/10 rotate-3 transform border border-teal-100">
                     <IconComponent className="text-teal-500" size={28} />
                </div>
                <h2 className="text-xl font-black text-zinc-900 tracking-tight mb-1">
                    {content.title}
                </h2>
                <p className="text-xs font-medium text-zinc-500 leading-relaxed max-w-[240px] mx-auto">
                    {content.desc}
                </p>
            </div>

            {/* Benefits List (Only on Signup) - Updated Text */}
            {!isLoginView && (
                <div className="bg-zinc-50/80 rounded-xl p-3 mb-4 border border-zinc-100/80 space-y-2">
                    <Feature icon={Cloud} text="Cloud Sync Across Devices" />
                    <Feature icon={History} text="Track Skin Goal Progress" />
                    <Feature icon={Sparkles} text="Unlock Rescan & Product Search" />
                </div>
            )}

            {error && (
                <div className="mb-4 bg-rose-50 p-3 rounded-xl flex gap-3 items-start text-left border border-rose-100 animate-in slide-in-from-top-2">
                    <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-700 font-medium leading-snug">{error}</p>
                </div>
            )}

            {/* Google Sign In - Prominent but Clean - Compacted */}
            <button 
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-white border border-zinc-200 text-zinc-700 font-bold text-xs hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-sm mb-4 group"
            >
                {loading ? <Loader size={16} className="animate-spin text-zinc-400" /> : (
                    <>
                        <div className="w-4 h-4 flex items-center justify-center"><GoogleLogo /></div>
                        <span>Continue with Google</span>
                    </>
                )}
            </button>

            <div className="relative flex py-1 items-center mb-4">
                <div className="flex-grow border-t border-zinc-100"></div>
                <span className="flex-shrink-0 mx-3 text-zinc-400 text-[9px] font-bold uppercase tracking-widest">Or use email</span>
                <div className="flex-grow border-t border-zinc-100"></div>
            </div>

            {/* Email Form - Compacted */}
            <form onSubmit={handleEmailAuth} className="space-y-2.5">
                <div className="space-y-2.5">
                    <input 
                        type="email" 
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all"
                        required
                    />
                    <input 
                        type="password" 
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all"
                        required
                        minLength={6}
                    />
                    {!isLoginView && (
                         <input 
                            type="password" 
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all"
                            required
                            minLength={6}
                        />
                    )}
                </div>

                <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-teal-500 text-white font-bold text-xs uppercase tracking-widest hover:bg-teal-600 shadow-lg shadow-teal-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"
                >
                    {loading ? <Loader size={16} className="animate-spin text-white/50" /> : (
                        <>
                            <Mail size={16} className="text-white" strokeWidth={2.5} />
                            {isLoginView ? "Sign In with Email" : "Create Account"}
                        </>
                    )}
                </button>
            </form>
            
            <div className="mt-5 text-center">
                <button 
                    onClick={() => {
                        setIsLoginView(!isLoginView);
                        setError(null);
                        setConfirmPassword('');
                        setPassword('');
                    }} 
                    disabled={loading} 
                    className="text-[11px] text-zinc-500 hover:text-zinc-800 transition-colors font-medium group"
                >
                    {isLoginView ? (
                        <>New here? <span className="font-bold text-teal-600 underline decoration-teal-200 group-hover:decoration-teal-500 underline-offset-2 transition-all">Create Account</span></>
                    ) : (
                        <>Already a member? <span className="font-bold text-teal-600 underline decoration-teal-200 group-hover:decoration-teal-500 underline-offset-2 transition-all">Sign In</span></>
                    )}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SaveProfileModal;
