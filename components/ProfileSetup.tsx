
import React, { useState } from 'react';
import { UserProfile, Product, SkinType } from '../types';
import { signOut, auth } from '../services/firebase';
import { 
  ArrowLeft, LogOut, Trash2, Save, User, 
  Download, Activity, Baby, Feather, ShieldAlert, 
  Pill, Smartphone, Settings, Crown 
} from 'lucide-react';

interface ProfileSetupProps {
  user: UserProfile;
  shelf: Product[];
  onComplete: (updatedProfile: UserProfile) => void;
  onBack: () => void;
  onReset: () => void;
  onLoginRequired: (trigger: string) => void;
  installPrompt: any;
}

const ProfileSetup: React.FC<ProfileSetupProps> = ({ 
  user, 
  shelf, 
  onComplete, 
  onBack, 
  onReset, 
  onLoginRequired, 
  installPrompt 
}) => {
  const [name, setName] = useState(user.name);
  const [age, setAge] = useState(user.age.toString());
  const [skinType, setSkinType] = useState<SkinType>(user.skinType);
  
  // Preferences
  const [isPregnant, setIsPregnant] = useState(user.preferences?.isPregnant || false);
  const [hasSensitiveSkin, setHasSensitiveSkin] = useState(user.preferences?.sensitivity === 'VERY_SENSITIVE');
  const [hasEczema, setHasEczema] = useState(user.preferences?.hasEczema || false);
  const [onMedication, setOnMedication] = useState(user.preferences?.onMedication || false);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    const updatedUser: UserProfile = {
      ...user,
      name,
      age: parseInt(age) || user.age,
      skinType,
      preferences: {
        ...user.preferences!,
        isPregnant,
        hasEczema,
        onMedication,
        sensitivity: hasSensitiveSkin ? 'VERY_SENSITIVE' : 'MILD'
      }
    };
    onComplete(updatedUser);
    setTimeout(() => {
      setIsSaving(false);
      onBack();
    }, 500);
  };

  const handleSignOut = async () => {
    await signOut();
    // Assuming App.tsx handles auth state change and redirects/reloads
    onBack(); 
    window.location.reload();
  };

  const handleInstall = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans pb-32 animate-in slide-in-from-right-8 duration-500">
      
      {/* Header */}
      <div className="bg-zinc-900 pt-12 pb-8 px-6 rounded-b-[2.5rem] relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="flex justify-between items-start mb-6 relative z-10">
              <button onClick={onBack} className="p-2 -ml-2 text-white hover:scale-105 transition-all drop-shadow-md">
                  <ArrowLeft size={24} />
              </button>
              {auth && auth.currentUser && (
                  <button 
                    onClick={handleSignOut}
                    className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/20 transition-colors border border-white/10 flex items-center gap-2"
                  >
                      <LogOut size={12} /> Sign Out
                  </button>
              )}
          </div>

          <div className="relative z-10 text-white">
              <h1 className="text-3xl font-black tracking-tight mb-2">Profile & Settings</h1>
              <p className="text-zinc-400 text-sm font-medium">Manage your personal skin profile.</p>
          </div>
      </div>

      <div className="px-6 -mt-6 relative z-20 space-y-6">
          
          {/* User Details Card */}
          <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-zinc-200/50 border border-zinc-100">
              <div className="flex items-center gap-2 mb-6 text-zinc-400">
                  <User size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Personal Details</span>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Name</label>
                      <input 
                          type="text" 
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-bold text-zinc-900 focus:outline-none focus:border-teal-500 transition-colors"
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Age</label>
                          <input 
                              type="number" 
                              value={age}
                              onChange={(e) => setAge(e.target.value)}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-bold text-zinc-900 focus:outline-none focus:border-teal-500 transition-colors"
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Skin Type</label>
                          <select 
                              value={skinType}
                              onChange={(e) => setSkinType(e.target.value as SkinType)}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-bold text-zinc-900 focus:outline-none focus:border-teal-500 transition-colors appearance-none"
                          >
                              {Object.values(SkinType).map(t => (
                                  <option key={t} value={t}>{t}</option>
                              ))}
                          </select>
                      </div>
                  </div>
              </div>
          </div>

          {/* Safety Settings */}
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-zinc-100">
              <div className="flex items-center gap-2 mb-6 text-zinc-400">
                  <ShieldAlert size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">Safety Filters</span>
              </div>
              
              <div className="space-y-3">
                  <ToggleOption 
                      label="Pregnancy / Nursing" 
                      active={isPregnant} 
                      onToggle={() => setIsPregnant(!isPregnant)} 
                      icon={Baby}
                  />
                  <ToggleOption 
                      label="Sensitive Skin" 
                      active={hasSensitiveSkin} 
                      onToggle={() => setHasSensitiveSkin(!hasSensitiveSkin)} 
                      icon={Feather}
                  />
                  <ToggleOption 
                      label="Eczema / Rosacea" 
                      active={hasEczema} 
                      onToggle={() => setHasEczema(!hasEczema)} 
                      icon={Activity}
                  />
                   <ToggleOption 
                      label="Prescription Meds" 
                      active={onMedication} 
                      onToggle={() => setOnMedication(!onMedication)} 
                      icon={Pill}
                  />
              </div>
          </div>

          {/* Account Actions */}
          <div className="space-y-3">
              <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95"
              >
                  {isSaving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
              </button>

              {installPrompt && (
                  <button 
                      onClick={handleInstall}
                      className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2 active:scale-95"
                  >
                      <Download size={16} /> Install App
                  </button>
              )}
              
              {(!auth?.currentUser) && (
                  <button 
                      onClick={() => onLoginRequired('GENERIC')}
                      className="w-full py-4 bg-white text-zinc-900 border border-zinc-200 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                  >
                      <User size={16} /> Sign In / Cloud Sync
                  </button>
              )}

              <button 
                  onClick={onReset}
                  className="w-full py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 mt-8"
              >
                  <Trash2 size={16} /> Reset App Data
              </button>
              
              <div className="text-center pt-4 pb-8">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Version 2.5.0 (Beta)</p>
              </div>
          </div>
      </div>
    </div>
  );
};

const ToggleOption = ({ label, active, onToggle, icon: Icon }: any) => (
    <button 
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${active ? 'bg-teal-50 border-teal-200' : 'bg-zinc-50 border-zinc-100'}`}
    >
        <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${active ? 'bg-teal-100 text-teal-600' : 'bg-zinc-200 text-zinc-400'}`}>
                <Icon size={14} />
            </div>
            <span className={`text-xs font-bold ${active ? 'text-teal-900' : 'text-zinc-500'}`}>{label}</span>
        </div>
        <div className={`w-10 h-6 rounded-full relative transition-colors ${active ? 'bg-teal-500' : 'bg-zinc-300'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${active ? 'left-5' : 'left-1'}`}></div>
        </div>
    </button>
);

export default ProfileSetup;
