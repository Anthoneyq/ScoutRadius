'use client';

import { useState, useMemo } from 'react';

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
  onlyClubs: boolean; // Filter to only clubs when true
  selectedAgeGroups: string[]; // Filter by age groups
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
    selectedAgeGroups = [],
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
    if (!Array.isArray(places)) return [];
    
    let filtered = places.filter(place => {
      // Filter by "only clubs" toggle
      if (onlyClubs && !place.isClub) {
        return false;
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
    
    // Sort: primary by clubScore (descending), secondary by drive time (ascending), tertiary by selected field
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
  }, [places, sortField, sortDirection, filterSport, searchQuery, onlyClubs, selectedAgeGroups]);

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

  return (
    <div className="flex flex-col h-full bg-[#0f172a]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800/50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Ranking</h2>
          <button
            onClick={onExport}
            className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors"
          >
            Export CSV
          </button>
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {filteredAndSorted.length} of {places.length} clubs
        </div>
      </div>
      
      {/* Search/Filter */}
      <div className="px-4 py-2 border-b border-slate-800/50 space-y-2">
        <input
          type="text"
          placeholder="Search clubs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 bg-[#1e293b] border border-slate-700/50 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:ring-1 focus:ring-slate-600 focus:border-slate-600"
        />
        {sports.length > 0 && (
          <select
            value={filterSport}
            onChange={(e) => setFilterSport(e.target.value)}
            className="w-full px-3 py-1.5 bg-[#1e293b] border border-slate-700/50 rounded-md text-sm text-slate-100 focus:ring-1 focus:ring-slate-600 focus:border-slate-600"
          >
            <option value="all">All Sports</option>
            {sports.map(sport => (
              <option key={sport} value={sport}>{sport}</option>
            ))}
          </select>
        )}
      </div>

      {/* Ranking List */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-0.5">
          {filteredAndSorted.map((place, index) => {
            // Safety guard: ensure name is a string
            const displayName = typeof place.name === 'string' ? place.name : '';
            const clubScore = place.clubScore ?? 0;
            const isSelected = selectedPlaceId === place.place_id;
            
            // Confidence badge
            let confidenceBadge: JSX.Element;
            if (clubScore >= 4) {
              confidenceBadge = <span className="text-xs font-medium accent-green">Club</span>;
            } else if (clubScore >= 2) {
              confidenceBadge = <span className="text-xs font-medium accent-yellow">Possible</span>;
            } else {
              confidenceBadge = <span className="text-xs font-medium accent-gray">Venue</span>;
            }
            
            // Age group badges
            const ageBadges: JSX.Element[] = [];
            if (place.ageGroups) {
              if (place.ageGroups.youth >= 2) {
                ageBadges.push(<span key="youth" className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Youth</span>);
              }
              if (place.ageGroups.highSchool >= 2) {
                ageBadges.push(<span key="hs" className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">HS</span>);
              }
              if (place.ageGroups.elite >= 2) {
                ageBadges.push(<span key="elite" className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">Elite</span>);
              }
              if (place.ageGroups.adult >= 2) {
                ageBadges.push(<span key="adult" className="text-xs px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400">Adult</span>);
              }
            }
            
            return (
              <div
                key={place.place_id}
                onClick={() => onPlaceClick(place.place_id)}
                className={`px-4 py-3 border-b border-slate-800/30 cursor-pointer transition-colors ${
                  isSelected 
                    ? 'bg-slate-800/50 border-l-2 border-l-green-500' 
                    : 'hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-400 w-6">{index + 1}</span>
                      <h3 className="font-semibold text-slate-100 text-sm truncate">{displayName}</h3>
                      {place.isClub && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">Club</span>
                      )}
                    </div>
                    
                    {/* Age badges */}
                    {ageBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-8 mb-1.5">
                        {ageBadges}
                      </div>
                    )}
                    
                    {/* Key metrics */}
                    <div className="flex items-center gap-4 ml-8 text-xs text-slate-400">
                      {place.driveTime !== null && place.driveTime !== undefined && (
                        <span>
                          <span className="font-semibold text-slate-300">{place.driveTime}</span> min
                        </span>
                      )}
                      {place.distance !== null && place.distance !== undefined && (
                        <span>
                          <span className="font-semibold text-slate-300">{place.distance.toFixed(1)}</span> mi
                        </span>
                      )}
                      {place.rating && (
                        <span>
                          <span className="font-semibold text-slate-300">{place.rating.toFixed(1)}</span> ⭐
                        </span>
                      )}
                      {place.website && (
                        <a
                          href={place.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                    
                    {/* Address */}
                    <div className="text-xs text-slate-500 ml-8 mt-0.5 truncate">
                      {place.address}
                    </div>
                  </div>
                  
                  {/* Confidence badge - right aligned */}
                  <div className="flex-shrink-0">
                    {confidenceBadge}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {filteredAndSorted.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">
            No clubs found. Try adjusting your filters.
          </div>
        )}
      </div>
    </div>
  );
}
