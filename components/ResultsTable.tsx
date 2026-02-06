'use client';

import { useState, useMemo, useEffect } from 'react';

interface Place {
  place_id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  sport?: string;
  driveTime?: number;
  distance?: number;
  clubScore?: number; // Club confidence score
  isClub?: boolean; // True if clubScore >= 3
  ageGroups?: {
    youth: number;
    highSchool: number;
    adult: number;
    elite: number;
  };
  primaryAgeGroup?: 'youth' | 'highSchool' | 'adult' | 'elite';
}

interface ResultsTableProps {
  places: Place[];
  selectedPlaceId: string | null;
  onPlaceClick: (placeId: string) => void;
  notes: Record<string, string>;
  tags: Record<string, string>;
  onNotesChange: (placeId: string, notes: string) => void;
  onTagsChange: (placeId: string, tags: string) => void;
  onExport: () => void;
  onlyClubs: boolean; // Prioritize clubs when true (re-ranks, doesn't filter)
  showRecreational: boolean; // Show recreational locations when true
  selectedAgeGroups: string[]; // Filter by age groups
  totalClubs?: number;
  highConfidenceClubs?: number;
  avgDriveTime?: number;
  youthFocusedPercent?: number;
  mixedRecreationalPercent?: number;
  onlyClubsActive?: boolean;
  recreationalHidden?: boolean;
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
    onlyClubs = false,
    showRecreational = true,
    selectedAgeGroups = [],
    totalClubs = 0,
    highConfidenceClubs = 0,
    avgDriveTime = 0,
    youthFocusedPercent = 0,
    mixedRecreationalPercent = 0,
    onlyClubsActive = false,
    recreationalHidden = false,
  } = props || {};
  const [sortField, setSortField] = useState<SortField>('driveTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterSport, setFilterSport] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      // Filter by "show recreational" toggle
      // When OFF, only hide places with negative scores (bars, restaurants) or very low scores (0)
      // Keep places with score >= 1 to avoid filtering out legitimate venues
      if (!showRecreational) {
        const score = place.clubScore ?? 0;
        // Only filter out truly recreational venues (score 0 or negative)
        // Score 1+ indicates some club-like characteristics
        if (score < 1) {
          return false;
        }
      }
      
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
    
    // Sort: When "Prioritize Clubs" is ON, clubs float to top
    // Otherwise: primary by clubScore (descending), secondary by drive time (ascending)
    filtered.sort((a, b) => {
      // If "Prioritize Clubs" toggle is ON, clubs always rank higher
      if (onlyClubs) {
        const aIsClub = a.isClub ?? false;
        const bIsClub = b.isClub ?? false;
        if (aIsClub !== bIsClub) {
          return bIsClub ? 1 : -1; // Clubs first
        }
      }
      
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
  }, [places, sortField, sortDirection, filterSport, searchQuery, onlyClubs, showRecreational, selectedAgeGroups]);

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
      {/* Header with Export */}
      <div className="px-4 py-3 border-b border-[#1f2937]/30 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-light text-tertiary uppercase tracking-wider">Ranked Results</h2>
          <button
            onClick={onExport}
            className="px-2.5 py-1 text-xs font-light text-tertiary hover:text-secondary uppercase tracking-wider transition-colors"
          >
            Export
          </button>
        </div>
        
        {/* Status indicators */}
        {(onlyClubsActive || recreationalHidden) && (
          <div className="flex gap-2 mt-2">
            {onlyClubsActive && (
              <div className="text-[10px] text-tertiary uppercase tracking-wider">
                Sorted by Confidence
              </div>
            )}
            {recreationalHidden && (
              <div className="text-[10px] text-tertiary uppercase tracking-wider">
                Recreational Hidden
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Search/Filter */}
      <div className="px-4 py-2.5 border-b border-[#1f2937]/30 space-y-2">
        <input
          type="text"
          placeholder="Filter ranking..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 bg-[#111827]/60 border border-[#374151]/40 rounded-lg text-sm text-primary placeholder:text-tertiary focus:ring-1 focus:ring-[#6b7280]/30 focus:border-[#6b7280]/40 font-light backdrop-blur-sm"
        />
        {sports.length > 0 && (
          <select
            value={filterSport}
            onChange={(e) => setFilterSport(e.target.value)}
            className="w-full px-3 py-1.5 bg-[#111827]/60 border border-[#374151]/40 rounded-lg text-sm text-primary focus:ring-1 focus:ring-[#6b7280]/30 focus:border-[#6b7280]/40 font-light backdrop-blur-sm"
          >
            <option value="all">All Sports</option>
            {sports.map(sport => (
              <option key={sport} value={sport} className="bg-[#111827]">{sport}</option>
            ))}
          </select>
        )}
      </div>

      {/* Section 2: Ranked Results - Intelligence Dossier Style */}
      <div className="flex-1 overflow-auto">
        {filteredAndSorted.length === 0 ? (
          /* Section 3: Empty State - Never Blank */
          <div className="px-4 py-8">
            <div className="card-dark rounded-lg px-4 py-6 text-center">
              <div className="text-sm font-light text-tertiary mb-2">No qualifying clubs under current constraints.</div>
              <div className="text-xs text-tertiary font-light mt-3">
                Adjust drive time or toggle priority
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-[1px]">
            {filteredAndSorted.map((place, index) => {
              // Safety guard: ensure name is a string
              const displayName = typeof place.name === 'string' ? place.name : '';
              const clubScore = place.clubScore ?? 0;
              const isSelected = selectedPlaceId === place.place_id;
              
              // Confidence indicator (dot/bar style)
              let confidenceIndicator: JSX.Element;
              if (clubScore >= 4) {
                confidenceIndicator = <div className="w-1.5 h-1.5 rounded-full bg-[#14b8a6]"></div>;
              } else if (clubScore >= 2) {
                confidenceIndicator = <div className="w-1.5 h-1.5 rounded-full bg-[#64748b]"></div>;
              } else {
                confidenceIndicator = <div className="w-1.5 h-1.5 rounded-full bg-[#475569] opacity-60"></div>;
              }
              
              // Age group badges - subtle, muted
              const ageBadges: JSX.Element[] = [];
              if (place.ageGroups) {
                if (place.ageGroups.youth >= 2) {
                  ageBadges.push(<span key="youth" className="text-[10px] px-1.5 py-0.5 rounded bg-[#14b8a6]/15 text-[#14b8a6] font-light uppercase tracking-wider">Youth</span>);
                }
                if (place.ageGroups.highSchool >= 2) {
                  ageBadges.push(<span key="hs" className="text-[10px] px-1.5 py-0.5 rounded bg-[#64748b]/15 text-[#64748b] font-light uppercase tracking-wider">HS</span>);
                }
                if (place.ageGroups.elite >= 2) {
                  ageBadges.push(<span key="elite" className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] font-light uppercase tracking-wider">Elite</span>);
                }
                if (place.ageGroups.adult >= 2) {
                  ageBadges.push(<span key="adult" className="text-[10px] px-1.5 py-0.5 rounded bg-[#6b7280]/15 text-[#6b7280] font-light uppercase tracking-wider">Adult</span>);
                }
              }
              
              return (
                <div
                  key={place.place_id}
                  onClick={() => onPlaceClick(place.place_id)}
                  className={`px-4 py-3 cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-[#1f2937]/40 border-l-2 border-l-[#f59e0b]' 
                      : 'hover:bg-[#1f2937]/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Rank number */}
                    <div className="flex-shrink-0 w-6">
                      <span className="text-xs font-light text-tertiary">{index + 1}</span>
                    </div>
                    
                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-light text-primary leading-tight mb-1">{displayName}</h3>
                          {place.isClub && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#14b8a6]/15 text-[#14b8a6] font-light uppercase tracking-wider inline-block mb-1">
                              Club
                            </span>
                          )}
                        </div>
                        
                        {/* Drive time - right aligned, emphasized */}
                        {place.driveTime !== null && place.driveTime !== undefined && (
                          <div className="flex-shrink-0 text-right">
                            <div className="text-base font-light text-numeric text-primary">{place.driveTime}</div>
                            <div className="text-[10px] text-tertiary uppercase tracking-wider">min</div>
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
