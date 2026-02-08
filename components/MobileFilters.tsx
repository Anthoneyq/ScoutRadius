'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface MobileFiltersProps {
  onSearch: (origin: { lat: number; lng: number }, driveTime: number, sports: string[], schoolTypes?: string[]) => void;
  isLoading: boolean;
  selectedAgeGroups: string[];
  onAgeGroupsChange: (ageGroups: string[]) => void;
  locationInput: string;
  onLocationInputChange: (value: string) => void;
  onSearchTriggered?: () => void; // Callback to collapse sheet after search
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

const SCHOOL_TYPES = [
  { id: 'private', label: 'Private School' },
  { id: 'public', label: 'Public School' },
  { id: 'elementary', label: 'Elementary School' },
  { id: 'middle', label: 'Middle School' },
  { id: 'juniorHigh', label: 'Junior High' },
  { id: 'highSchool', label: 'High School' },
];

export default function MobileFilters({
  onSearch,
  isLoading,
  selectedAgeGroups,
  onAgeGroupsChange,
  locationInput,
  onLocationInputChange,
  onSearchTriggered,
}: MobileFiltersProps) {
  const [driveTime, setDriveTime] = useState(30);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedSchoolTypes, setSelectedSchoolTypes] = useState<string[]>([]);
  const [showSportsDropdown, setShowSportsDropdown] = useState(false);
  const [showSchoolTypesDropdown, setShowSchoolTypesDropdown] = useState(false);
  const [showAgeGroupsDropdown, setShowAgeGroupsDropdown] = useState(false);

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

  const getSchoolTypesDisplayText = () => {
    if (selectedSchoolTypes.length === 0) return 'School Type';
    if (selectedSchoolTypes.length === 1) {
      return SCHOOL_TYPES.find(s => s.id === selectedSchoolTypes[0])?.label || selectedSchoolTypes[0];
    }
    return `${selectedSchoolTypes.length} types`;
  };

  const toggleSchoolType = (schoolTypeId: string) => {
    setSelectedSchoolTypes(prev =>
      prev.includes(schoolTypeId)
        ? prev.filter(s => s !== schoolTypeId)
        : [...prev, schoolTypeId]
    );
  };

  const toggleAgeGroup = (ageGroupId: string) => {
    onAgeGroupsChange(
      selectedAgeGroups.includes(ageGroupId)
        ? selectedAgeGroups.filter(id => id !== ageGroupId)
        : [...selectedAgeGroups, ageGroupId]
    );
  };

  const handleSearch = async () => {
    if (!locationInput.trim()) {
      alert('Please enter a location');
      return;
    }

    // If no sports selected, search for all sports by default
    const sportsToSearch = selectedSports.length > 0 ? selectedSports : SPORTS.map(s => s.id);

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

    onSearch(origin, driveTime, sportsToSearch, selectedSchoolTypes.length > 0 ? selectedSchoolTypes : undefined);
    onSearchTriggered?.(); // Collapse sheet after search
  };

  const isSearchDisabled = isLoading || !locationInput.trim();

  return (
    <div className="space-y-4">

      {/* Starting Location */}
      <div>
        <label className="block text-xs font-light text-label text-tertiary mb-2">
          STARTING LOCATION
        </label>
        <input
          type="text"
          value={locationInput}
          onChange={(e) => onLocationInputChange(e.target.value)}
          placeholder="Address or coordinates"
          className="w-full px-4 py-3 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-primary placeholder:text-tertiary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 text-base font-light transition-luxury backdrop-blur-sm"
          style={{ fontSize: '16px' }}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isSearchDisabled) {
              handleSearch();
            }
          }}
        />
      </div>

      {/* Drive Time */}
      <div>
        <label className="block text-xs font-light text-label text-tertiary mb-2">
          DRIVE TIME
        </label>
        <select
          value={driveTime}
          onChange={(e) => setDriveTime(Number(e.target.value))}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-primary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 text-base font-light transition-luxury backdrop-blur-sm"
          style={{ fontSize: '16px' }}
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

      {/* Sport */}
      <div>
        <label className="block text-xs font-light text-label text-tertiary mb-2">
          SPORT
        </label>
        <div className="relative">
          <button
            onClick={() => setShowSportsDropdown(!showSportsDropdown)}
            className="w-full px-4 py-3 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-left text-primary text-base font-light focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-luxury backdrop-blur-sm"
            disabled={isLoading}
          >
            <span className={selectedSports.length === 0 ? 'text-tertiary' : ''}>
              {getSportsDisplayText()}
            </span>
            <svg
              className={`w-4 h-4 text-tertiary transition-transform ${showSportsDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSportsDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-luxury-card border border-[#334155]/40 rounded-md shadow-2xl max-h-60 overflow-y-auto backdrop-blur-md">
              <div className="p-2 space-y-1">
                {SPORTS.map((sport) => (
                  <label
                    key={sport.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1e293b]/50 cursor-pointer rounded-md transition-luxury"
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
          )}
        </div>
      </div>

      {/* School Type */}
      <div>
        <label className="block text-xs font-light text-label text-tertiary mb-2">
          SCHOOL TYPE
        </label>
        <div className="relative">
          <button
            onClick={() => setShowSchoolTypesDropdown(!showSchoolTypesDropdown)}
            className={`w-full px-4 py-3 bg-[#0f172a]/50 border rounded-md text-left text-primary text-base font-light focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-luxury backdrop-blur-sm ${
              selectedSchoolTypes.length > 0 
                ? 'border-[#fbbf24]/40 bg-[#fbbf24]/10' 
                : 'border-[#334155]/30'
            }`}
            disabled={isLoading}
          >
            <span className={selectedSchoolTypes.length === 0 ? 'text-tertiary' : ''}>
              {getSchoolTypesDisplayText()}
            </span>
            <svg
              className={`w-4 h-4 text-tertiary transition-transform ${showSchoolTypesDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showSchoolTypesDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-luxury-card border border-[#334155]/40 rounded-md shadow-2xl max-h-60 overflow-y-auto backdrop-blur-md">
              <div className="p-2 space-y-1">
                {SCHOOL_TYPES.map((schoolType) => (
                  <label
                    key={schoolType.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1e293b]/50 cursor-pointer rounded-md transition-luxury"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSchoolTypes.includes(schoolType.id)}
                      onChange={() => toggleSchoolType(schoolType.id)}
                      disabled={isLoading}
                      className="w-4 h-4 accent-[#fbbf24] border-[#334155] rounded bg-[#0f172a]/50 focus:ring-[#fbbf24]/30 transition-luxury"
                    />
                    <span className="text-sm text-secondary font-light">{schoolType.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Age Groups */}
      <div>
        <label className="block text-xs font-light text-label text-tertiary mb-2">
          AGE GROUPS
        </label>
        <div className="relative">
          <button
            onClick={() => setShowAgeGroupsDropdown(!showAgeGroupsDropdown)}
            className="w-full px-4 py-3 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-left text-primary text-base font-light focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed transition-luxury backdrop-blur-sm"
            disabled={isLoading}
          >
            <span className={selectedAgeGroups.length === 0 ? 'text-tertiary' : ''}>
              {getAgeGroupsDisplayText()}
            </span>
            <svg
              className={`w-4 h-4 text-tertiary transition-transform ${showAgeGroupsDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAgeGroupsDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-luxury-card border border-[#334155]/40 rounded-md shadow-2xl max-h-60 overflow-y-auto backdrop-blur-md">
              <div className="p-2 space-y-1">
                {AGE_GROUPS.map((ageGroup) => (
                  <label
                    key={ageGroup.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1e293b]/50 cursor-pointer rounded-md transition-luxury"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgeGroups.includes(ageGroup.id)}
                      onChange={() => toggleAgeGroup(ageGroup.id)}
                      disabled={isLoading}
                      className="w-4 h-4 accent-[#fbbf24] border-[#334155] rounded bg-[#0f172a]/50 focus:ring-[#fbbf24]/30 transition-luxury"
                    />
                    <span className="text-sm text-secondary font-light">{ageGroup.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analyze Area Button */}
      <button
        onClick={handleSearch}
        disabled={isSearchDisabled}
        className="w-full px-8 py-4 bg-gradient-to-r from-[#fbbf24]/20 to-[#f59e0b]/20 hover:from-[#fbbf24]/30 hover:to-[#f59e0b]/30 text-primary rounded-md font-light disabled:opacity-40 disabled:cursor-not-allowed transition-luxury text-base text-label border-2 border-[#fbbf24]/40 hover:border-[#fbbf24]/60 backdrop-blur-sm hover:shadow-[0_0_24px_rgba(251,191,36,0.25)] shadow-[0_0_12px_rgba(251,191,36,0.15)] accent-gold font-medium mt-6"
      >
        {isLoading ? 'ANALYZING...' : 'ANALYZE AREA'}
      </button>
    </div>
  );
}
