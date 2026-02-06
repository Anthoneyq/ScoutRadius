'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ControlsProps {
  onSearch: (origin: { lat: number; lng: number }, driveTime: number, sports: string[], includeSchools?: boolean) => void;
  isLoading: boolean;
  selectedAgeGroups: string[];
  onAgeGroupsChange: (ageGroups: string[]) => void;
}

const SPORTS = [
  { id: 'volleyball', label: 'Volleyball' },
  { id: 'track and field', label: 'Track & Field' },
  { id: 'cross country', label: 'Cross Country' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'softball', label: 'Softball' },
];

const AGE_GROUPS = [
  { id: 'youth', label: 'Youth' },
  { id: 'highSchool', label: 'High School' },
  { id: 'elite', label: 'Elite' },
  { id: 'adult', label: 'Adult' },
];

export default function Controls(props: ControlsProps) {
  const {
    onSearch = () => {},
    isLoading = false,
    selectedAgeGroups = [],
    onAgeGroupsChange = () => {},
  } = props || {};
  const [locationInput, setLocationInput] = useState('');
  const [driveTime, setDriveTime] = useState(30); // Default to 30 minutes
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [includeSchools, setIncludeSchools] = useState(false);
  const [showSportsDropdown, setShowSportsDropdown] = useState(false);
  const [showAgeGroupsDropdown, setShowAgeGroupsDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const sportsButtonRef = useRef<HTMLButtonElement>(null);

  const toggleSport = (sportId: string) => {
    setSelectedSports(prev =>
      prev.includes(sportId)
        ? prev.filter(s => s !== sportId)
        : [...prev, sportId]
    );
  };

  const getSportsDisplayText = () => {
    if (selectedSports.length === 0) return 'Select sports...';
    if (selectedSports.length === 1) {
      return SPORTS.find(s => s.id === selectedSports[0])?.label || selectedSports[0];
    }
    return `${selectedSports.length} sports selected`;
  };

  const getAgeGroupsDisplayText = () => {
    if (selectedAgeGroups.length === 0) return 'All age groups';
    if (selectedAgeGroups.length === 1) {
      return AGE_GROUPS.find(a => a.id === selectedAgeGroups[0])?.label || selectedAgeGroups[0];
    }
    return `${selectedAgeGroups.length} age groups`;
  };

  const toggleAgeGroup = (ageGroupId: string) => {
    onAgeGroupsChange(
      selectedAgeGroups.includes(ageGroupId)
        ? selectedAgeGroups.filter(id => id !== ageGroupId)
        : [...selectedAgeGroups, ageGroupId]
    );
  };

  // Calculate dropdown position when it opens or window resizes
  const calculateDropdownPosition = useCallback(() => {
    if (!showSportsDropdown || !sportsButtonRef.current) {
      setDropdownPosition(null);
      return;
    }
    
    const rect = sportsButtonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 192; // max-h-48 = 192px
    
    // Calculate position
    let top = rect.bottom + 6; // 6px = mt-1.5 equivalent
    let left = rect.left;
    let width = rect.width;
    
    // Adjust if dropdown would go off bottom of screen (show above instead)
    if (top + dropdownHeight > viewportHeight && rect.top > dropdownHeight) {
      top = rect.top - dropdownHeight - 6;
    }
    
    // Ensure dropdown doesn't go off right edge of screen
    if (left + width > viewportWidth - 16) {
      left = viewportWidth - width - 16; // 16px padding from edge
    }
    
    // Ensure dropdown doesn't go off left edge of screen
    if (left < 16) {
      left = 16; // 16px padding from edge
      width = Math.min(width, viewportWidth - 32); // Adjust width if needed
    }
    
    setDropdownPosition({
      top,
      left,
      width,
    });
  }, [showSportsDropdown]);

  useEffect(() => {
    calculateDropdownPosition();
    
    // Recalculate on window resize (important for mobile rotation)
    if (showSportsDropdown) {
      window.addEventListener('resize', calculateDropdownPosition);
      window.addEventListener('scroll', calculateDropdownPosition, true);
      
      return () => {
        window.removeEventListener('resize', calculateDropdownPosition);
        window.removeEventListener('scroll', calculateDropdownPosition, true);
      };
    }
  }, [showSportsDropdown, calculateDropdownPosition]);

  const handleSearch = async () => {
    if (!locationInput.trim()) {
      alert('Please enter a location');
      return;
    }

    if (selectedSports.length === 0) {
      alert('Please select at least one sport');
      return;
    }

    // Parse location input (could be address or lat,lng)
    let origin: { lat: number; lng: number };

    if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(locationInput.trim())) {
      // It's lat,lng
      const [lat, lng] = locationInput.split(',').map(Number);
      if (isNaN(lat) || isNaN(lng)) {
        alert('Invalid coordinates. Use format: lat,lng (e.g., 37.7749,-122.4194)');
        return;
      }
      origin = { lat, lng };
    } else {
      // It's an address - geocode it
      try {
        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!mapboxToken || mapboxToken === 'pk.your_mapbox_token_here') {
          alert('Mapbox token not configured. Please add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to .env.local');
          return;
        }
        const geocodeResponse = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationInput)}.json?access_token=${mapboxToken}&limit=1`
        );
        const geocodeData = await geocodeResponse.json();
        
        if (geocodeData.features && geocodeData.features.length > 0) {
          const [lng, lat] = geocodeData.features[0].center;
          origin = { lat, lng };
        } else {
          alert('Could not find location. Please try a different address or use lat,lng format.');
          return;
        }
      } catch (error) {
        console.error('Geocoding error:', error);
        alert('Error geocoding address. Please try again.');
        return;
      }
    }

    onSearch(origin, driveTime, selectedSports, includeSchools);
  };

  const isSearchDisabled = isLoading || !locationInput.trim() || selectedSports.length === 0;

  return (
    <div className="px-6 py-3.5 border-b border-[#334155]/30 bg-luxury-card">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-light text-label text-tertiary mb-2">
            STARTING LOCATION
          </label>
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder="Address or coordinates"
            className="w-full px-3.5 py-2.5 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-primary placeholder:text-tertiary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 text-sm font-light transition-luxury backdrop-blur-sm"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearchDisabled) {
                handleSearch();
              }
            }}
          />
        </div>

        <div className="min-w-[140px]">
          <label className="block text-xs font-light text-label text-tertiary mb-2">
            DRIVE TIME
          </label>
          <select
            value={driveTime}
            onChange={(e) => setDriveTime(Number(e.target.value))}
            disabled={isLoading}
            className="w-full px-3.5 py-2.5 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-primary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 text-sm font-light transition-luxury backdrop-blur-sm"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const minutes = (i + 1) * 5;
              return (
                <option key={minutes} value={minutes} className="bg-[#0f172a]">
                  {minutes} MIN
                </option>
              );
            })}
          </select>
        </div>

        <div className="relative min-w-[160px]">
          <label className="block text-xs font-light text-label text-tertiary mb-2">
            SPORT
          </label>
          <button
            ref={sportsButtonRef}
            type="button"
            onClick={() => setShowSportsDropdown(!showSportsDropdown)}
            disabled={isLoading}
            className="w-full px-3.5 py-2.5 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-left text-primary text-sm font-light focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-luxury backdrop-blur-sm"
          >
            <span className={selectedSports.length === 0 ? 'text-tertiary' : ''}>
              {getSportsDisplayText()}
            </span>
            <svg
              className={`w-3.5 h-3.5 transition-transform text-tertiary ${showSportsDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showSportsDropdown && dropdownPosition && (
            <>
              <div
                className="fixed inset-0 z-[90]"
                onClick={() => setShowSportsDropdown(false)}
              />
              <div 
                className="fixed z-[100] bg-luxury-card border border-[#334155]/40 rounded-md shadow-2xl max-h-48 overflow-y-auto backdrop-blur-md"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                }}
              >
                <div className="p-2 space-y-1">
                  {SPORTS.map((sport) => (
                    <label
                      key={sport.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#1e293b]/50 cursor-pointer rounded-md transition-luxury"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSports.includes(sport.id)}
                        onChange={() => toggleSport(sport.id)}
                        disabled={isLoading}
                        className="w-4 h-4 accent-[#fbbf24] border-[#334155] rounded bg-[#0f172a]/50 focus:ring-[#fbbf24]/30 transition-luxury"
                      />
                      <span className="text-sm text-secondary font-light">{sport.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-[140px]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSchools}
              onChange={(e) => setIncludeSchools(e.target.checked)}
              disabled={isLoading}
              className="w-4 h-4 accent-[#fbbf24] border-[#334155] rounded bg-[#0f172a]/50 focus:ring-[#fbbf24]/30 transition-luxury"
            />
            <span className="text-xs font-light text-label text-tertiary">Include Schools</span>
          </label>
        </div>

        <button
          onClick={handleSearch}
          disabled={isSearchDisabled}
          className="px-8 py-3 bg-gradient-to-r from-[#fbbf24]/20 to-[#f59e0b]/20 hover:from-[#fbbf24]/30 hover:to-[#f59e0b]/30 text-primary rounded-md font-light disabled:opacity-40 disabled:cursor-not-allowed transition-luxury text-sm text-label border-2 border-[#fbbf24]/40 hover:border-[#fbbf24]/60 backdrop-blur-sm hover:shadow-[0_0_24px_rgba(251,191,36,0.25)] shadow-[0_0_12px_rgba(251,191,36,0.15)] accent-gold font-medium"
        >
          {isLoading ? 'ANALYZING...' : 'ANALYZE AREA'}
        </button>
      </div>
    </div>
  );
}
