
import React, { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, X, AlertTriangle, Save, ShoppingBag, Loader, CheckCircle2 } from 'lucide-react';

export type NotificationType = 'SHELF_EMPTY' | 'SAVE_PROFILE' | 'GENERIC' | 'TASK_START' | 'TASK_COMPLETE';

interface SmartNotificationProps {
  type: NotificationType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

const SmartNotification: React.FC<SmartNotificationProps> = ({ type, title, description, actionLabel, onAction, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay for entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    
    // Auto-dismiss logic (longer for tasks to ensure visibility)
    let dismissTimer: ReturnType<typeof setTimeout>;
    if (type !== 'TASK_COMPLETE') {
        dismissTimer = setTimeout(() => handleClose(), type === 'TASK_START' ? 6000 : 5000);
    }

    return () => {
        clearTimeout(timer);
        if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 400); // Wait for exit animation
  };

  const getIcon = () => {
    switch(type) {
      case 'SHELF_EMPTY': return <ShoppingBag size={18} className="text-teal-600" />;
      case 'SAVE_PROFILE': return <Save size={18} className="text-indigo-600" />;
      case 'TASK_START': return <Loader size={18} className="text-sky-600 animate-spin" />;
      case 'TASK_COMPLETE': return <CheckCircle2 size={18} className="text-emerald-600" />;
      default: return <Sparkles size={18} className="text-zinc-900" />;
    }
  };

  const getColors = () => {
    switch(type) {
      case 'SHELF_EMPTY': return "bg-teal-50 border-teal-100";
      case 'SAVE_PROFILE': return "bg-indigo-50 border-indigo-100";
      case 'TASK_START': return "bg-sky-50 border-sky-100";
      case 'TASK_COMPLETE': return "bg-emerald-50 border-emerald-100";
      default: return "bg-white border-zinc-200";
    }
  };

  return (
    <div 
      className={`fixed top-28 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none transition-all duration-500 cubic-bezier(0.19, 1, 0.22, 1) ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}
    >
      <div className={`pointer-events-auto w-full max-w-sm rounded-[1.5rem] p-4 flex items-center gap-4 shadow-2xl shadow-zinc-900/10 backdrop-blur-md border ${getColors()} bg-opacity-95`}>
        
        {/* Icon Circle */}
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm border border-zinc-50">
          {getIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wide mb-0.5">{title}</h4>
          <p className="text-xs text-zinc-500 font-medium leading-tight">{description}</p>
        </div>

        {/* Action Button */}
        {actionLabel && onAction && (
            <button 
            onClick={() => { onAction(); handleClose(); }}
            className="shrink-0 h-9 px-4 bg-zinc-900 text-white rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-colors active:scale-95 shadow-md shadow-zinc-900/10"
            >
            {actionLabel}
            </button>
        )}

        {/* Close X */}
        <button 
            onClick={handleClose}
            className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full border border-zinc-100 flex items-center justify-center text-zinc-400 hover:text-rose-500 shadow-sm"
        >
            <X size={12} />
        </button>
      </div>
    </div>
  );
};

export default SmartNotification;
