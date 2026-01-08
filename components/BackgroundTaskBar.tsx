
import React, { useState, useRef, useEffect } from 'react';
import { Loader, GripHorizontal } from 'lucide-react';

interface BackgroundTaskBarProps {
  label: string;
}

const BackgroundTaskBar: React.FC<BackgroundTaskBarProps> = ({ label }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 }); // Offset from bottom-right
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialPos = useRef({ x: 0, y: 0 });

  const handleStart = (clientX: number, clientY: number) => {
      setIsDragging(true);
      dragStart.current = { x: clientX, y: clientY };
      initialPos.current = { ...position };
  };

  const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const dx = dragStart.current.x - clientX; // Inverted because we position from right
      const dy = dragStart.current.y - clientY; // Inverted because we position from bottom
      
      setPosition({
          x: initialPos.current.x + dx,
          y: initialPos.current.y + dy
      });
  };

  const handleEnd = () => {
      setIsDragging(false);
  };

  // Global event listeners for smooth dragging outside the element
  useEffect(() => {
      const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
      const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
      const onEnd = () => handleEnd();

      if (isDragging) {
          window.addEventListener('touchmove', onTouchMove);
          window.addEventListener('touchend', onEnd);
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onEnd);
      }
      return () => {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onEnd);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onEnd);
      };
  }, [isDragging]);

  return (
    <div 
        className="fixed z-[90] animate-in slide-in-from-right-8 fade-in duration-500 cursor-grab active:cursor-grabbing touch-none"
        style={{ 
            bottom: `${128 + position.y}px`, 
            right: `${16 + position.x}px`,
            transition: isDragging ? 'none' : 'bottom 0.3s ease-out, right 0.3s ease-out' // Smooth snap if needed later
        }}
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <div className="bg-zinc-900/95 backdrop-blur-md text-white pl-2 pr-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 border border-zinc-800/50 ring-1 ring-white/10 max-w-[220px]">
        
        {/* Grip Handle */}
        <div className="text-zinc-600 px-1 border-r border-white/10 mr-1">
            <GripHorizontal size={14} />
        </div>

        <div className="relative shrink-0">
            <div className="absolute inset-0 bg-teal-500 rounded-full blur-[2px] animate-pulse"></div>
            <Loader size={16} className="animate-spin text-teal-200 relative z-10" />
        </div>
        <span className="text-[10px] font-bold text-white tracking-wide truncate select-none">
            {label}
        </span>
      </div>
    </div>
  );
};

export default BackgroundTaskBar;
