'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Place } from '@/lib/googlePlaces';

interface ResultsTableProps {
  places: Place[];
  selectedPlaceId: string | null;
  onPlaceClick: (placeId: string) => void;
  notes: Record<string, string>;
  tags: Record<string, string>;
  onNotesChange: (placeId: string, notes: string) => void;
  onTagsChange: (placeId: string, tags: string) => void;
  onExport: () => void;
  selectedAgeGroups: string[]; // Filter by age groups
  totalClubs?: number;
  highConfidenceClubs?: number;
  avgDriveTime?: number;
  avgDistance?: number;
  youthFocusedPercent?: number;
  mixedRecreationalPercent?: number;
  schoolTypes?: string[]; // Selected school types for dynamic header
  selectedSports?: string[]; // Selected sports for dynamic header
}

type SortField = 'name' | 'sport' | 'driveTime' | 'distance' | 'rating' | 'review_count';
type SortDirection = 'asc' | 'desc';

export default function ResultsTable(props: ResultsTableProps) {
  const {
    places = [],
    selectedPlaceId = null,
    onPlaceClick = () => {},
    notes = {},
    tags = {},
    onNotesChange = () => {},
    onTagsChange = () => {},
    onExport = () => {},
    selectedAgeGroups = [],
    totalClubs = 0,
    highConfidenceClubs = 0,
    avgDriveTime = 0,
    avgDistance = 0,
    youthFocusedPercent = 0,
    mixedRecreationalPercent = 0,
    schoolTypes = [],
    selectedSports = [],
  } = props || {};
  const [sortField, setSortField] = useState<SortField>('driveTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterSport, setFilterSport] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const selectedItemRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const sports = useMemo(() => {
    const sportSet = new Set<string>();
    places.forEach(p => {
      if (p.sport) sportSet.add(p.sport);
    });
    return Array.from(sportSet).sort();
  }, [places]);

  const filteredAndSorted = useMemo(() => {
    // Safety guard: ensure places is an array
    if (!Array.isArray(places)) {
      console.warn("ResultsTable: places is not an array", places);
      return [];
    }
    
    let filtered = places.filter(place => {
      // Filter by age groups
      if (selectedAgeGroups.length > 0 && place.ageGroups) {
        const hasMatchingAgeGroup = selectedAgeGroups.some(ageGroupId => {
          const score = place.ageGroups![ageGroupId as keyof typeof place.ageGroups];
          return score >= 2; // Show if score >= 2
        });
        if (!hasMatchingAgeGroup) {
          return false;
        }
      }
      
      if (filterSport !== 'all' && place.sport !== filterSport) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        // Ensure name is a string (should already be converted from displayName.text)
        const name = typeof place.name === 'string' ? place.name : '';
        return (
          name.toLowerCase().includes(query) ||
          place.address.toLowerCase().includes(query) ||
          place.sport?.toLowerCase().includes(query)
        );
      }
      return true;
    });
    
    // Sort: primary by clubScore (descending), secondary by drive time (ascending)
    filtered.sort((a, b) => {
      // Primary sort: clubScore (highest confidence first)
      const scoreA = a.clubScore ?? 0;
      const scoreB = b.clubScore ?? 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Descending
      }
      
      // Secondary sort: drive time (closest first)
      const driveTimeA = a.driveTime ?? Infinity;
      const driveTimeB = b.driveTime ?? Infinity;
      if (driveTimeA !== driveTimeB) {
        return driveTimeA - driveTimeB; // Ascending
      }
      
      // Tertiary sort: by selected field
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (aVal === null || aVal === undefined) aVal = sortDirection === 'asc' ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = sortDirection === 'asc' ? Infinity : -Infinity;

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [places, sortField, sortDirection, filterSport, searchQuery, selectedAgeGroups]);

  // Scroll to selected item when selectedPlaceId changes
  useEffect(() => {
    if (selectedPlaceId && selectedItemRef.current && scrollContainerRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (selectedItemRef.current && scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const element = selectedItemRef.current;
          
          // Calculate scroll position to center the element in view
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const scrollTop = container.scrollTop;
          const elementTop = elementRect.top - containerRect.top + scrollTop;
          const elementHeight = elementRect.height;
          const containerHeight = containerRect.height;
          
          // Center the element in the container
          const targetScroll = elementTop - (containerHeight / 2) + (elementHeight / 2);
          
          container.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth',
          });
        }
      }, 100);
    }
  }, [selectedPlaceId, filteredAndSorted]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // CRITICAL: Always render - never conditionally mount

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header with Export - luxury styling */}
      <div className="px-5 py-3.5 border-b border-[#334155]/30 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xs font-light text-label text-tertiary">RANKED RESULTS</h2>
            {/* Dynamic filter message */}
            {schoolTypes.includes('public') && (
              <p className="text-[10px] text-tertiary font-light mt-0.5">
                {selectedSports.length > 0 
                  ? `Public Schools with ${selectedSports.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} (Confirmed)`
                  : 'Public Schools (All Sports)'
                }
              </p>
            )}
          </div>
          <button
            onClick={onExport}
            className="px-3 py-1.5 text-xs font-light text-label text-tertiary hover:text-secondary transition-luxury hover:opacity-80"
          >
            EXPORT
          </button>
        </div>
        
        {/* Mobile Stats - shown only on mobile, hidden on desktop */}
        <div className="md:hidden grid grid-cols-2 gap-2 mt-2">
          <div className="card-luxury rounded-md px-3 py-2">
            <div className="text-lg font-light text-numeric text-primary">{totalClubs}</div>
            <div className="text-[9px] text-label text-tertiary mt-0.5">TOTAL</div>
          </div>
          <div className="card-luxury rounded-md px-3 py-2">
            <div className="text-lg font-light text-numeric accent-emerald">{highConfidenceClubs}</div>
            <div className="text-[9px] text-label text-tertiary mt-0.5">CLUBS</div>
          </div>
          <div className="card-luxury rounded-md px-3 py-2">
            <div className="text-lg font-light text-numeric accent-gold">{avgDriveTime || '—'}</div>
            <div className="text-[9px] text-label text-tertiary mt-0.5">AVG TIME</div>
          </div>
          <div className="card-luxury rounded-md px-3 py-2">
            <div className="text-lg font-light text-numeric text-primary">{avgDistance ? avgDistance.toFixed(1) : '—'}</div>
            <div className="text-[9px] text-label text-tertiary mt-0.5">AVG DIST</div>
          </div>
        </div>
      </div>
      
      {/* Search/Filter - luxury inputs */}
      <div className="px-5 py-3 border-b border-[#334155]/30 space-y-2.5">
        <input
          type="text"
          placeholder="Filter ranking..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3.5 py-2 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-sm text-primary placeholder:text-tertiary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 font-light transition-luxury backdrop-blur-sm"
        />
        {sports.length > 0 && (
          <select
            value={filterSport}
            onChange={(e) => setFilterSport(e.target.value)}
            className="w-full px-3.5 py-2 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-sm text-primary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 font-light transition-luxury backdrop-blur-sm"
          >
            <option value="all">All Sports</option>
            {sports.map(sport => (
              <option key={sport} value={sport} className="bg-[#0f172a]">{sport}</option>
            ))}
          </select>
        )}
      </div>

      {/* Section 2: Ranked Results - Intelligence Dossier Style */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        {filteredAndSorted.length === 0 ? (
          /* Section 3: Empty State - Never Blank */
          <div className="px-5 py-10">
            <div className="card-luxury rounded-lg px-5 py-8 text-center">
              {schoolTypes.includes('public') && selectedSports.length > 0 ? (
                <>
                  <div className="text-sm font-light text-secondary mb-2.5">
                    No public schools with confirmed {selectedSports.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} programs in this area.
                  </div>
                  <div className="text-xs text-label text-tertiary opacity-70 mt-3">
                    TRY ADJUSTING DRIVE TIME OR REMOVING SPORT FILTER
                  </div>
                </>
              ) : schoolTypes.includes('public') ? (
                <>
                  <div className="text-sm font-light text-secondary mb-2.5">
                    No public schools found in this area.
                  </div>
                  <div className="text-xs text-label text-tertiary opacity-70 mt-3">
                    TRY ADJUSTING DRIVE TIME OR LOCATION
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-light text-secondary mb-2.5">No qualifying clubs under current constraints.</div>
                  <div className="text-xs text-label text-tertiary opacity-70 mt-3">
                    ADJUST DRIVE TIME OR TOGGLE PRIORITY
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-[1px]">
            {filteredAndSorted.map((place, index) => {
              // Safety guard: ensure name is a string
              const displayName = typeof place.name === 'string' ? place.name : '';
              const clubScore = place.clubScore ?? 0;
              const isSelected = selectedPlaceId === place.place_id;
              
              // Luxury confidence tier system
              // Elite (80-100): Gold with ★ icon
              // Premium (60-79): Emerald with ◆ icon
              // Standard (40-59): Slate with ○ icon
              // Basic (0-39): Subdued slate with · icon
              let confidenceTier: {
                label: string;
                icon: string;
                colorClass: string;
                bgClass: string;
              };
              
              if (clubScore >= 80) {
                confidenceTier = {
                  label: 'Elite',
                  icon: '★',
                  colorClass: 'confidence-elite',
                  bgClass: 'bg-[#fbbf24]/10',
                };
              } else if (clubScore >= 60) {
                confidenceTier = {
                  label: 'Premium',
                  icon: '◆',
                  colorClass: 'confidence-premium',
                  bgClass: 'bg-[#10b981]/10',
                };
              } else if (clubScore >= 40) {
                confidenceTier = {
                  label: 'Standard',
                  icon: '○',
                  colorClass: 'confidence-standard',
                  bgClass: 'bg-[#64748b]/10',
                };
              } else {
                confidenceTier = {
                  label: 'Basic',
                  icon: '·',
                  colorClass: 'confidence-basic',
                  bgClass: 'bg-[#475569]/10',
                };
              }
              
              const confidenceIndicator = (
                <div className={`flex items-center gap-1.5 ${confidenceTier.colorClass}`}>
                  <span className="text-xs font-light">{confidenceTier.icon}</span>
                  <span className="text-[10px] font-light text-label opacity-70">{confidenceTier.label}</span>
                </div>
              );
              
              // Age group badges - luxury styling
              const ageBadges: JSX.Element[] = [];
              if (place.ageGroups) {
                if (place.ageGroups.youth >= 2) {
                  ageBadges.push(<span key="youth" className="text-[10px] px-2 py-0.5 rounded-md bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] font-light text-label">YOUTH</span>);
                }
                if (place.ageGroups.highSchool >= 2) {
                  ageBadges.push(<span key="hs" className="text-[10px] px-2 py-0.5 rounded-md bg-[#64748b]/10 border border-[#64748b]/20 text-[#64748b] font-light text-label">HS</span>);
                }
                if (place.ageGroups.elite >= 2) {
                  ageBadges.push(<span key="elite" className="text-[10px] px-2 py-0.5 rounded-md bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24] font-light text-label">ELITE</span>);
                }
                if (place.ageGroups.adult >= 2) {
                  ageBadges.push(<span key="adult" className="text-[10px] px-2 py-0.5 rounded-md bg-[#94a3b8]/10 border border-[#94a3b8]/20 text-[#94a3b8] font-light text-label">ADULT</span>);
                }
              }
              
              return (
                <div
                  key={place.place_id}
                  ref={(el) => {
                    if (isSelected && el) {
                      selectedItemRef.current = el;
                    }
                  }}
                  onClick={() => onPlaceClick(place.place_id)}
                  className={`px-4 py-3.5 cursor-pointer transition-luxury ${
                    isSelected 
                      ? 'card-luxury border-2 border-[#fbbf24]/60 bg-[#fbbf24]/5 shadow-[0_0_20px_rgba(251,191,36,0.15)]' 
                      : 'hover-luxury hover:bg-luxury-card border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Rank number */}
                    <div className="flex-shrink-0 w-7">
                      <span className="text-xs font-light text-numeric text-tertiary">{index + 1}</span>
                    </div>
                    
                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-light text-primary leading-tight mb-1.5 tracking-tight">{displayName}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            {place.isClub && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#10b981]/15 text-[#10b981] font-light text-label">
                                Club
                              </span>
                            )}
                            {place.isSchool && place.schoolTypes && place.schoolTypes.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#3b82f6]/15 text-[#3b82f6] font-light text-label">
                                {place.schoolTypes.map(type => {
                                  const labels: Record<string, string> = {
                                    'private': 'Private',
                                    'public': 'Public',
                                    'elementary': 'Elementary',
                                    'middle': 'Middle',
                                    'juniorHigh': 'Jr High',
                                    'highSchool': 'High School',
                                  };
                                  return labels[type] || type;
                                }).join(' • ')}
                              </span>
                            )}
                            {/* Confidence tier badge */}
                            <span className={`text-[10px] px-2 py-0.5 rounded-md ${confidenceTier.bgClass} ${confidenceTier.colorClass} font-light text-label`}>
                              {confidenceTier.icon} {confidenceTier.label}
                            </span>
                          </div>
                        </div>
                        
                        {/* Drive time - right aligned, emphasized */}
                        {place.driveTime !== null && place.driveTime !== undefined && (
                          <div className="flex-shrink-0 text-right">
                            <div className="text-lg font-light text-numeric accent-gold">{place.driveTime}</div>
                            <div className="text-[10px] text-label text-tertiary">MIN</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Age badges */}
                      {ageBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {ageBadges}
                        </div>
                      )}
                      
                      {/* Secondary metrics */}
                      <div className="flex items-center gap-3 text-xs text-tertiary font-light">
                        {place.sport && (
                          <span className="uppercase tracking-wider">{place.sport}</span>
                        )}
                        {place.distance !== null && place.distance !== undefined && (
                          <span>{place.distance.toFixed(1)} mi</span>
                        )}
                        {place.rating && (
                          <span>{place.rating.toFixed(1)} ⭐</span>
                        )}
                        {place.review_count && (
                          <span>({place.review_count})</span>
                        )}
                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-tertiary hover:text-secondary transition-colors"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                      
                      {/* Address and phone */}
                      <div className="text-[11px] text-tertiary font-light mt-1">
                        <div className="truncate">{place.address}</div>
                        {place.phone && (
                          <div className="mt-0.5">{place.phone}</div>
                        )}
                      </div>
                      
                      {/* Notes and Tags - editable */}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={notes[place.place_id] || ''}
                          onChange={(e) => onNotesChange(place.place_id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Notes..."
                          className="flex-1 px-2 py-1 bg-[#111827]/40 border border-[#374151]/30 rounded text-[10px] text-secondary placeholder:text-tertiary focus:ring-1 focus:ring-[#6b7280]/20 focus:border-[#6b7280]/30 font-light"
                        />
                        <input
                          type="text"
                          value={tags[place.place_id] || ''}
                          onChange={(e) => onTagsChange(place.place_id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Tags..."
                          className="flex-1 px-2 py-1 bg-[#111827]/40 border border-[#374151]/30 rounded text-[10px] text-secondary placeholder:text-tertiary focus:ring-1 focus:ring-[#6b7280]/20 focus:border-[#6b7280]/30 font-light"
                        />
                      </div>
                    </div>
                    
                    {/* Confidence indicator - right aligned */}
                    <div className="flex-shrink-0 flex items-center">
                      {confidenceIndicator}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
