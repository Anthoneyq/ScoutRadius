'use client';

import { useState, useEffect } from 'react';

interface AnalyzingOverlayProps {
  isLoading: boolean;
  searchParams?: {
    sports?: string[];
    schoolTypes?: string[];
    location?: string;
  };
}

export default function AnalyzingOverlay({ isLoading, searchParams }: AnalyzingOverlayProps) {
  const [progress, setProgress] = useState({
    area: 0,
    search: 0,
    analysis: 0,
  });

  const sports = searchParams?.sports || [];
  const schoolTypes = searchParams?.schoolTypes || [];
  const location = searchParams?.location || '';

  // Timer-based progress animation - faster and more realistic
  useEffect(() => {
    if (!isLoading) {
      // Reset progress when loading stops
      setProgress({ area: 0, search: 0, analysis: 0 });
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        // Area generation: faster progress (reaches 100% in ~2-3 seconds)
        const areaIncrement = 1.2 + Math.random() * 0.4;
        const newArea = Math.min(prev.area + areaIncrement, 100);

        // Search: starts after area reaches 25%, fast progress (reaches 100% quickly after starting)
        const searchIncrement = prev.area > 25 
          ? 1.5 + Math.random() * 0.5 
          : 0;
        const newSearch = Math.min(prev.search + searchIncrement, 100);

        // Analysis: starts after search reaches 50%, fast progress
        const analysisIncrement = prev.search > 50
          ? 1.3 + Math.random() * 0.4
          : 0;
        const newAnalysis = Math.min(prev.analysis + analysisIncrement, 100);

        return {
          area: newArea,
          search: newSearch,
          analysis: newAnalysis,
        };
      });
    }, 80); // Update every 80ms for faster, smoother motion

    return () => clearInterval(interval);
  }, [isLoading]);

  // Ensure all bars complete when loading finishes
  useEffect(() => {
    if (!isLoading) {
      // Complete all bars immediately when loading finishes
      const completeBars = setInterval(() => {
        setProgress(prev => {
          const allDone = prev.area >= 100 && prev.search >= 100 && prev.analysis >= 100;
          if (allDone) {
            clearInterval(completeBars);
            return prev;
          }
          return {
            area: Math.min(prev.area + 5, 100),
            search: Math.min(prev.search + 5, 100),
            analysis: Math.min(prev.analysis + 5, 100),
          };
        });
      }, 50); // Fast completion animation
      
      return () => clearInterval(completeBars);
    }
  }, [isLoading]);

  // Keep overlay visible while loading or until all bars complete
  const allComplete = progress.area >= 100 && progress.search >= 100 && progress.analysis >= 100;
  if (!isLoading && allComplete) {
    // Hide after completion
    return null;
  }

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
            <p className="text-sm text-tertiary font-light">{location}</p>
          )}
        </div>

        {/* Analysis Steps */}
        <div className="space-y-4 mb-8">
          {/* Step 1: Generating Drive-Time Area */}
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24] animate-pulse"></div>
              <div className="flex-1">
                <div className="text-sm font-light text-label text-secondary mb-1">Mapping reachable training area</div>
                <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#fbbf24]/40 rounded-full transition-all duration-[600ms] ease-out"
                    style={{ width: `${progress.area}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Searching Sports Clubs */}
          {(hasSports || isSearchingAll) && (
            <div className="card-luxury rounded-lg px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></div>
                <div className="flex-1">
                  <div className="text-sm font-light text-label text-secondary mb-1">
                    {isSearchingAll 
                      ? 'Scanning relevant programs'
                      : sports.length === 1 
                        ? `Scanning ${formatSportName(sports[0])} programs`
                        : `Scanning ${sports.length} sports: ${sports.slice(0, 2).map(formatSportName).join(', ')}${sports.length > 2 ? '...' : ''}`
                    }
                  </div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#10b981]/40 rounded-full transition-all duration-[600ms] ease-out"
                      style={{ width: `${progress.search}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Searching Schools */}
          {hasSchools && (
            <div className="card-luxury rounded-lg px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse"></div>
                <div className="flex-1">
                  <div className="text-sm font-light text-label text-secondary mb-1">
                    {schoolTypes.length === 1 
                      ? `Validating ${formatSchoolType(schoolTypes[0])}`
                      : `Validating ${schoolTypes.length} school types`
                    }
                  </div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#3b82f6]/40 rounded-full transition-all duration-[600ms] ease-out"
                      style={{ width: `${progress.search}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Analyzing Results */}
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24] animate-pulse"></div>
              <div className="flex-1">
                <div className="text-sm font-light text-label text-secondary mb-1">Ranking best opportunities</div>
                <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#fbbf24]/40 rounded-full transition-all duration-[600ms] ease-out"
                    style={{ width: `${progress.analysis}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results Loading Message */}
        <div className="card-luxury rounded-lg p-5 text-center">
          <div className="text-sm font-light text-label text-tertiary">Results loading...</div>
        </div>
      </div>
    </div>
  );
}
