
import React from 'react';
import { Loader } from 'lucide-react';

interface BackgroundTaskBarProps {
  label: string;
}

const BackgroundTaskBar: React.FC<BackgroundTaskBarProps> = ({ label }) => {
  return (
    <div className="fixed bottom-32 right-4 z-[90] animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="bg-zinc-900/95 backdrop-blur-md text-white pl-3 pr-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 border border-zinc-800/50 ring-1 ring-white/10 max-w-[200px]">
        <div className="relative shrink-0">
            <div className="absolute inset-0 bg-teal-500 rounded-full blur-[2px] animate-pulse"></div>
            <Loader size={16} className="animate-spin text-teal-200 relative z-10" />
        </div>
        <span className="text-[10px] font-bold text-white tracking-wide truncate">
            {label}
        </span>
      </div>
    </div>
  );
};

export default BackgroundTaskBar;
