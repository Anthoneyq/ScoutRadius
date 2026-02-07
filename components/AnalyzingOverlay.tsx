'use client';

interface AnalyzingOverlayProps {
  isLoading: boolean;
  searchParams?: {
    sports?: string[];
    schoolTypes?: string[];
    location?: string;
  };
}

export default function AnalyzingOverlay({ isLoading, searchParams }: AnalyzingOverlayProps) {
  if (!isLoading) return null;

  const sports = searchParams?.sports || [];
  const schoolTypes = searchParams?.schoolTypes || [];
  const location = searchParams?.location || '';

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
    <div className="absolute inset-0 z-50 bg-luxury-dark/95 backdrop-blur-md flex items-center justify-center">
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
                <div className="text-sm font-light text-label text-secondary mb-1">Generating drive-time area</div>
                <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                  <div className="h-full bg-[#fbbf24]/40 rounded-full animate-pulse" style={{ width: '60%' }}></div>
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
                      ? 'Searching all sports clubs & teams'
                      : sports.length === 1 
                        ? `Searching ${formatSportName(sports[0])} clubs`
                        : `Searching ${sports.length} sports: ${sports.slice(0, 2).map(formatSportName).join(', ')}${sports.length > 2 ? '...' : ''}`
                    }
                  </div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div className="h-full bg-[#10b981]/40 rounded-full animate-pulse" style={{ width: '75%' }}></div>
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
                      ? `Searching ${formatSchoolType(schoolTypes[0])}`
                      : `Searching ${schoolTypes.length} school types`
                    }
                  </div>
                  <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3b82f6]/40 rounded-full animate-pulse" style={{ width: '50%' }}></div>
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
                <div className="text-sm font-light text-label text-secondary mb-1">Analyzing results & calculating intelligence</div>
                <div className="h-1.5 bg-[#334155]/30 rounded-full overflow-hidden">
                  <div className="h-full bg-[#fbbf24]/40 rounded-full animate-pulse" style={{ width: '90%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton Results Preview */}
        <div className="card-luxury rounded-lg p-5">
          <div className="text-xs font-light text-label text-tertiary mb-4 uppercase tracking-wider">Preview Results</div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-[#334155]/50"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[#334155]/30 rounded-md" style={{ width: `${60 + i * 10}%` }}></div>
                  <div className="h-2 bg-[#334155]/20 rounded-md" style={{ width: `${40 + i * 5}%` }}></div>
                </div>
                <div className="w-12 h-6 bg-[#334155]/20 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
