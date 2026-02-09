'use client';

import { useState, useEffect, useRef } from 'react';

type AnalysisStage = 
  | "idle" 
  | "isochrone" 
  | "entityFetch" 
  | "ranking" 
  | "complete";

interface AnalyzingOverlayProps {
  analysisStage: AnalysisStage;
  searchParams?: {
    sports?: string[];
    schoolTypes?: string[];
    location?: string;
  };
}

const STAGE_ORDER: AnalysisStage[] = [
  "idle",
  "isochrone",
  "entityFetch",
  "ranking",
  "complete",
];

export default function AnalyzingOverlay({ analysisStage, searchParams }: AnalyzingOverlayProps) {
  const sports = searchParams?.sports || [];
  const schoolTypes = searchParams?.schoolTypes || [];
  const location = searchParams?.location || '';
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  // Hide overlay when idle or complete
  if (analysisStage === "idle" || analysisStage === "complete") {
    return null;
  }

  // Animate progress bar smoothly
  useEffect(() => {
    const currentIndex = STAGE_ORDER.indexOf(analysisStage);
    const totalStages = STAGE_ORDER.length - 2; // Exclude idle and complete
    
    // Calculate base progress based on stage
    const baseProgress = (currentIndex / totalStages) * 100;
    
    // Animate from current progress to target
    const targetProgress = Math.min(baseProgress + 30, 95); // Don't go to 100% until complete
    const duration = 2000; // 2 seconds per stage
    const startTime = Date.now();
    const startProgress = progressRef.current;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progressRatio = Math.min(elapsed / duration, 1);
      
      // Ease out animation
      const eased = 1 - Math.pow(1 - progressRatio, 3);
      const currentProgress = startProgress + (targetProgress - startProgress) * eased;
      
      progressRef.current = currentProgress;
      setProgress(currentProgress);

      if (progressRatio < 1) {
        requestAnimationFrame(animate);
      }
    };

    const interval = setInterval(animate, 16); // ~60fps
    
    return () => clearInterval(interval);
  }, [analysisStage]);

  // Format sport names for display
  const formatSportName = (sport: string) => {
    return sport
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Format school type names for display
  const formatSchoolType = (type: string) => {
    const labels: Record<string, string> = {
      'private': 'Private Schools',
      'public': 'Public Schools',
      'elementary': 'Elementary Schools',
      'middle': 'Middle Schools',
      'juniorHigh': 'Junior High Schools',
      'highSchool': 'High Schools',
    };
    return labels[type] || type;
  };

  const hasSports = sports.length > 0;
  const hasSchools = schoolTypes.length > 0;
  const isSearchingAll = !hasSports && !hasSchools; // Default search (all sports)

  // Helper function to determine bar state
  const getBarState = (stage: AnalysisStage) => {
    const currentIndex = STAGE_ORDER.indexOf(analysisStage);
    const stageIndex = STAGE_ORDER.indexOf(stage);
    
    if (stageIndex < currentIndex) {
      return 'complete'; // Stage is complete
    } else if (stageIndex === currentIndex) {
      return 'active'; // Stage is currently active
    } else {
      return 'inactive'; // Stage hasn't started yet
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-luxury-dark/95 backdrop-blur-md flex items-center justify-center">
      <div className="w-full max-w-2xl px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-12 h-12 border-2 border-[#fbbf24]/30 rounded-full"></div>
              <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-t-[#fbbf24] rounded-full animate-spin"></div>
            </div>
            <h2 className="text-xl font-light text-label text-primary tracking-wider">ANALYZING AREA</h2>
          </div>
          {location && (
            <p className="text-sm text-tertiary font-light mb-4">{location}</p>
          )}
          
          {/* Overall Progress Bar */}
          <div className="mt-4 mb-2">
            <div className="h-2 bg-[#334155]/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#fbbf24] via-[#10b981] to-[#fbbf24] rounded-full transition-all duration-300 ease-out"
                style={{ 
                  width: `${Math.min(progress, 95)}%`,
                  backgroundSize: '200% 100%',
                  animation: progress > 0 && progress < 95 ? 'shimmer 2s infinite' : 'none'
                }}
              ></div>
            </div>
            <div className="text-xs text-tertiary font-light mt-2">
              {Math.round(progress)}% complete
            </div>
          </div>
        </div>

        {/* Analysis Steps */}
        <div className="space-y-4 mb-8">
          {/* Step 1: Generating Drive-Time Area (isochrone) */}
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${
                getBarState("isochrone") === 'active' 
                  ? 'bg-[#fbbf24] animate-pulse' 
                  : getBarState("isochrone") === 'complete'
                    ? 'bg-[#fbbf24]'
                    : 'bg-[#334155]/50'
              }`}></div>
              <div className="flex-1">
                <div className="text-sm font-light text-label text-secondary mb-1">Mapping reachable training area</div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        getBarState("isochrone") === 'active'
                          ? 'bg-[#fbbf24]'
                          : getBarState("isochrone") === 'complete'
                            ? 'bg-[#fbbf24]'
                            : 'bg-transparent'
                      }`}
                      style={{ 
                        width: getBarState("isochrone") === 'complete' 
                          ? '100%' 
                          : getBarState("isochrone") === 'active'
                            ? `${Math.min(progress, 33)}%`
                            : '0%'
                      }}
                    ></div>
                  </div>
              </div>
            </div>
          </div>

          {/* Step 2: Searching & Validating (entityFetch) - covers all server-side work */}
          {(hasSports || isSearchingAll || hasSchools) && (
            <div className="card-luxury rounded-lg px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  getBarState("entityFetch") === 'active' 
                    ? 'bg-[#10b981] animate-pulse' 
                    : getBarState("entityFetch") === 'complete'
                      ? 'bg-[#10b981]'
                      : 'bg-[#334155]/50'
                }`}></div>
                <div className="flex-1">
                  <div className="text-sm font-light text-label text-secondary mb-1">
                    {isSearchingAll 
                      ? 'Scanning relevant programs'
                      : hasSports && hasSchools
                        ? `Scanning ${sports.length} sports & validating schools`
                        : hasSports
                          ? sports.length === 1 
                            ? `Scanning ${formatSportName(sports[0])} programs`
                            : `Scanning ${sports.length} sports: ${sports.slice(0, 2).map(formatSportName).join(', ')}${sports.length > 2 ? '...' : ''}`
                          : hasSchools
                            ? `Validating ${schoolTypes.length === 1 ? formatSchoolType(schoolTypes[0]) : `${schoolTypes.length} school types`}`
                            : 'Scanning relevant programs'
                    }
                  </div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        getBarState("entityFetch") === 'active'
                          ? 'bg-[#10b981]'
                          : getBarState("entityFetch") === 'complete'
                            ? 'bg-[#10b981]'
                            : 'bg-transparent'
                      }`}
                      style={{ 
                        width: getBarState("entityFetch") === 'complete' 
                          ? '100%' 
                          : getBarState("entityFetch") === 'active'
                            ? `${Math.min(Math.max(progress - 33, 0), 66)}%`
                            : '0%'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Ranking Results (ranking) - only shown when entityFetch is complete */}
          {getBarState("entityFetch") === 'complete' && (
            <div className="card-luxury rounded-lg px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  getBarState("ranking") === 'active' 
                    ? 'bg-[#fbbf24] animate-pulse' 
                    : getBarState("ranking") === 'complete'
                      ? 'bg-[#fbbf24]'
                      : 'bg-[#334155]/50'
                }`}></div>
                <div className="flex-1">
                  <div className="text-sm font-light text-label text-secondary mb-1">Ranking best opportunities</div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        getBarState("ranking") === 'active'
                          ? 'bg-[#fbbf24]'
                          : getBarState("ranking") === 'complete'
                            ? 'bg-[#fbbf24]'
                            : 'bg-transparent'
                      }`}
                      style={{ 
                        width: getBarState("ranking") === 'complete' 
                          ? '100%' 
                          : getBarState("ranking") === 'active'
                            ? `${Math.min(Math.max(progress - 66, 0), 95)}%`
                            : '0%'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Loading Message */}
        <div className="card-luxury rounded-lg p-5 text-center">
          <div className="text-sm font-light text-label text-tertiary">Results loading...</div>
        </div>
      </div>
    </div>
  );
}
