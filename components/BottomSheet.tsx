'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

export type SheetState = 'collapsed' | 'half' | 'full';

interface BottomSheetProps {
  children: ReactNode;
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  collapsedHeight?: string;
  halfHeight?: string;
  fullHeight?: string;
  zIndex?: number;
}

const SNAP_POINTS = {
  collapsed: '64px',
  half: '45vh',
  full: '85vh',
};

export default function BottomSheet({
  children,
  state,
  onStateChange,
  collapsedHeight = SNAP_POINTS.collapsed,
  halfHeight = SNAP_POINTS.half,
  fullHeight = SNAP_POINTS.full,
  zIndex = 40,
}: BottomSheetProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const getHeight = () => {
    if (isDragging && currentY !== 0) {
      // During drag, calculate height based on drag position
      const windowHeight = window.innerHeight;
      const dragPercent = (currentY / windowHeight) * 100;
      const baseHeight = state === 'collapsed' ? 64 : state === 'half' ? 45 : 85;
      const newHeight = Math.max(64, Math.min(85, baseHeight - dragPercent));
      return `${newHeight}vh`;
    }
    
    switch (state) {
      case 'collapsed':
        return collapsedHeight;
      case 'half':
        return halfHeight;
      case 'full':
        return fullHeight;
      default:
        return collapsedHeight;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow dragging on the handle
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragStartY(e.clientY);
      setCurrentY(0);
      if (sheetRef.current) {
        sheetRef.current.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const deltaY = e.clientY - dragStartY;
    setCurrentY(deltaY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    setIsDragging(false);
    if (sheetRef.current) {
      sheetRef.current.releasePointerCapture(e.pointerId);
    }

    // Calculate snap point based on drag distance
    const windowHeight = window.innerHeight;
    const dragPercent = (currentY / windowHeight) * 100;
    
    // Determine which state to snap to
    let newState: SheetState = state;
    
    if (Math.abs(dragPercent) < 5) {
      // Small movement, stay in current state
      newState = state;
    } else if (dragPercent > 15) {
      // Dragged down significantly
      if (state === 'full') {
        newState = 'half';
      } else if (state === 'half') {
        newState = 'collapsed';
      }
    } else if (dragPercent < -15) {
      // Dragged up significantly
      if (state === 'collapsed') {
        newState = 'half';
      } else if (state === 'half') {
        newState = 'full';
      }
    }
    
    setCurrentY(0);
    onStateChange(newState);
  };

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 bg-luxury-card backdrop-blur-md border-t border-[#334155]/30 rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out"
      style={{
        height: getHeight(),
        transform: isDragging && currentY !== 0 ? `translateY(${currentY}px)` : 'none',
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex,
        ...(state === 'collapsed' ? { pointerEvents: 'none' } : { pointerEvents: 'auto' }), // Allow map interaction when collapsed
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Drag Handle */}
      <div 
        className="drag-handle flex justify-center py-3 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        style={{ pointerEvents: 'auto' }} // Always allow dragging handle
      >
        <div className="w-10 h-1.5 rounded-full bg-[#334155]/50" />
      </div>

      {/* Content */}
      {state !== 'collapsed' && (
        <div className="px-4 pb-6 overflow-y-auto h-[calc(100%-48px)]">
          {children}
        </div>
      )}
      {state === 'collapsed' && (
        <div className="px-4 py-2 text-center">
          <div className="text-xs text-tertiary font-light">Set filters to analyze area</div>
        </div>
      )}
    </div>
  );
}
