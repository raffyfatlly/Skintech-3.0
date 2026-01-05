
import React, { useState, useEffect, useRef } from 'react';
import { Home, LayoutGrid, ScanBarcode, Sparkles, User } from 'lucide-react';
import { AppView } from '../types';

interface BottomNavigationProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onScan: () => void;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ currentView, onNavigate, onScan }) => {
  const [isVisible, setIsVisible] = useState(false);
  const lastScrollY = useRef(0);

  // Determine Theme based on View
  // Dashboard is Dark (Immersive). All others are Light (Clinical/Clean).
  const isLightTheme = [
      AppView.SMART_SHELF, 
      AppView.PROFILE_SETUP, 
      AppView.ROUTINE_BUILDER, 
      AppView.AI_ASSISTANT,
      AppView.PRODUCT_SEARCH,
      AppView.BUYING_ASSISTANT
  ].includes(currentView);

  useEffect(() => {
    // 1. Special Case: Chat Assistant
    // The chat page uses Flexbox layout where window scroll is irrelevant/zero.
    // Always show nav to ensure accessibility.
    if (currentView === AppView.AI_ASSISTANT) {
        setIsVisible(true);
        return;
    }

    const handleScroll = () => {
      // Robust scroll detection for different browsers/structures
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      const threshold = 10; 

      // 2. Dashboard Immersive Logic (Only for Dashboard)
      // Hide nav at the very top (Hero section) to show full image.
      if (currentView === AppView.DASHBOARD) {
          if (currentScrollY < 100) {
            setIsVisible(false);
            lastScrollY.current = currentScrollY;
            return;
          }
      } else {
          // 3. Other Pages (Shelf, Profile, etc.)
          // Standard behavior: Visible at top, auto-hide on scroll down.
          if (currentScrollY < 50) {
              setIsVisible(true);
              lastScrollY.current = currentScrollY;
              // Don't return, let the directional logic below run in case of rapid updates
          }
      }

      // 4. Directional Scroll Logic
      const diff = Math.abs(currentScrollY - lastScrollY.current);
      const isScrollingUp = currentScrollY < lastScrollY.current;

      // Only toggle state if movement is significant
      if (diff > threshold) {
        if (isScrollingUp) {
            setIsVisible(true);
        } else {
            setIsVisible(false); // Hide when scrolling down
        }
      }

      lastScrollY.current = currentScrollY;
    };

    // Attach to window immediately
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check on mount/view change
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentView]); 

  const navItems = [
    { 
      id: AppView.DASHBOARD, 
      label: 'Home', 
      icon: Home 
    },
    { 
      id: AppView.SMART_SHELF, 
      label: 'Routine', 
      icon: LayoutGrid 
    },
    // Center Action
    { 
      id: 'SCAN_ACTION', 
      label: 'Scan', 
      icon: ScanBarcode 
    },
    { 
      id: AppView.AI_ASSISTANT, 
      label: 'Ask AI', 
      icon: Sparkles 
    },
    { 
      id: AppView.PROFILE_SETUP, 
      label: 'Profile', 
      icon: User 
    }
  ];

  const containerClasses = isLightTheme 
      ? "bg-white/90 backdrop-blur-xl border-t border-zinc-200/50 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]"
      : "bg-black/40 backdrop-blur-2xl border-t border-white/10 shadow-2xl";

  const scanButtonClasses = isLightTheme
      ? "bg-zinc-900 text-white shadow-xl shadow-zinc-900/20 border border-zinc-800"
      : "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] border border-white/50 ring-4 ring-black/20";

  return (
    <div 
        className={`fixed bottom-0 left-0 right-0 z-[100] transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) ${isVisible ? 'translate-y-0' : 'translate-y-[120%]'}`}
    >
      {/* Dynamic Navigation Bar */}
      <div className={`${containerClasses} pb-safe pt-3 px-6 transition-colors duration-500`}>
        <div className="flex items-center justify-between max-w-md mx-auto">
          
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const isCenter = item.id === 'SCAN_ACTION';

            // Center SCAN Button (Floating Shutter Style)
            if (isCenter) {
              return (
                <button
                  key={item.id}
                  onClick={onScan}
                  className="flex flex-col items-center justify-center gap-1 group -mt-10 relative z-10" 
                >
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center group-active:scale-95 transition-all ${scanButtonClasses}`}>
                    <ScanBarcode size={24} strokeWidth={1.5} />
                  </div>
                </button>
              );
            }

            // Standard Icons
            let iconColorClass = "";
            if (isLightTheme) {
                iconColorClass = isActive ? "text-teal-600 fill-teal-600/10" : "text-zinc-400 group-hover:text-zinc-600";
            } else {
                iconColorClass = isActive ? "text-teal-400 fill-teal-400/20" : "text-white/60 group-hover:text-white";
            }

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as AppView)}
                className="flex flex-col items-center justify-center w-12 h-12 gap-1 active:scale-95 transition-transform group"
              >
                <item.icon 
                  size={24} 
                  className={`transition-colors duration-300 ${iconColorClass}`} 
                  strokeWidth={1.5}
                />
              </button>
            );
          })}

        </div>
      </div>
    </div>
  );
};

export default BottomNavigation;
