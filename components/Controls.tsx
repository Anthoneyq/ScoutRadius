'use client';

import { useState } from 'react';

interface ControlsProps {
  onSearch: (origin: { lat: number; lng: number }, driveTime: number, sports: string[]) => void;
  isLoading: boolean;
  onlyClubs: boolean;
  onOnlyClubsChange: (onlyClubs: boolean) => void;
  selectedAgeGroups: string[];
  onAgeGroupsChange: (ageGroups: string[]) => void;
}

const SPORTS = [
  { id: 'volleyball', label: 'Volleyball' },
  { id: 'track and field', label: 'Track & Field' },
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
    onlyClubs = false,
    onOnlyClubsChange = () => {},
    selectedAgeGroups = [],
    onAgeGroupsChange = () => {},
  } = props || {};
  const [locationInput, setLocationInput] = useState('');
  const [driveTime, setDriveTime] = useState(30); // Default to 30 minutes
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [showSportsDropdown, setShowSportsDropdown] = useState(false);
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

    onSearch(origin, driveTime, selectedSports);
  };

  const isSearchDisabled = isLoading || !locationInput.trim() || selectedSports.length === 0;

  return (
    <div className="p-6 bg-white border-b shadow-sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Starting Location
          </label>
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder="Address or lat,lng (e.g., 37.7749,-122.4194)"
            className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearchDisabled) {
                handleSearch();
              }
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Drive Time
          </label>
          <select
            value={driveTime}
            onChange={(e) => setDriveTime(Number(e.target.value))}
            disabled={isLoading}
            className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const minutes = (i + 1) * 5;
              return (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              );
            })}
          </select>
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sports
          </label>
          <button
            type="button"
            onClick={() => setShowSportsDropdown(!showSportsDropdown)}
            disabled={isLoading}
            className="w-full px-4 py-2 border rounded-md text-left bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between disabled:bg-gray-50 disabled:cursor-not-allowed"
          >
            <span className={selectedSports.length === 0 ? 'text-gray-500' : ''}>
              {getSportsDisplayText()}
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${showSportsDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showSportsDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSportsDropdown(false)}
              />
              <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {SPORTS.map((sport) => (
                    <label
                      key={sport.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSports.includes(sport.id)}
                        onChange={() => toggleSport(sport.id)}
                        disabled={isLoading}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{sport.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyClubs}
                onChange={(e) => onOnlyClubsChange(e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Only clubs / teams
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              {onlyClubs 
                ? 'Showing only competitive clubs and teams' 
                : 'Showing all venues, ranked by club confidence'}
            </p>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Age Groups
            </label>
            <button
              type="button"
              onClick={() => setShowAgeGroupsDropdown(!showAgeGroupsDropdown)}
              disabled={isLoading}
              className="w-full px-4 py-2 border rounded-md text-left bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between disabled:bg-gray-50 disabled:cursor-not-allowed"
            >
              <span className={selectedAgeGroups.length === 0 ? 'text-gray-500' : ''}>
                {getAgeGroupsDisplayText()}
              </span>
              <svg
                className={`w-4 h-4 transition-transform ${showAgeGroupsDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showAgeGroupsDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowAgeGroupsDropdown(false)}
                />
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {AGE_GROUPS.map((ageGroup) => (
                      <label
                        key={ageGroup.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgeGroups.includes(ageGroup.id)}
                          onChange={() => toggleAgeGroup(ageGroup.id)}
                          disabled={isLoading}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{ageGroup.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={isSearchDisabled}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Searching...' : 'Search Sports Clubs'}
        </button>
      </div>
    </div>
  );
}
