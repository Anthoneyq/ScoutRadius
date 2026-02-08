'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import MapView from '@/components/MapView';
import ResultsTable from '@/components/ResultsTable';
import Controls from '@/components/Controls';
import AnalyzingOverlay from '@/components/AnalyzingOverlay';
import BottomSheet, { SheetState } from '@/components/BottomSheet';
import MobileFilters from '@/components/MobileFilters';
import { arrayToCSV, downloadCSV } from '@/lib/csv';
import { Place } from '@/lib/googlePlaces';

// Dynamically import Clerk-dependent components to avoid build errors
const UsageDisplay = dynamic(() => import('@/components/UsageDisplay'), { ssr: false });
const AuthButton = dynamic(() => import('@/components/AuthButton'), { ssr: false });

const STORAGE_KEY_NOTES = 'scout-radius-notes';
const STORAGE_KEY_TAGS = 'scout-radius-tags';

export default function Home() {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState<any>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Record<string, string>>({});
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  // Removed unused sidebar state variables (replaced by bottom sheet)
  const [locationInput, setLocationInput] = useState(''); // Shared location input state
  const [isMounted, setIsMounted] = useState(false); // Prevent hydration issues
  const [filterSheetState, setFilterSheetState] = useState<SheetState>('collapsed'); // Mobile filter bottom sheet state
  const [resultsSheetState, setResultsSheetState] = useState<SheetState>('collapsed'); // Mobile results bottom sheet state
  const [mobileViewMode, setMobileViewMode] = useState<'filters' | 'results'>('filters'); // MVP Option A: Toggle between Filters and Results
  const [currentSearchParams, setCurrentSearchParams] = useState<{
    sports?: string[];
    schoolTypes?: string[];
    location?: string;
  } | null>(null);
  
  // Track if we're loading from localStorage to prevent save loops
  const isInitialLoadRef = useRef(true);
  const notesRef = useRef<string>('');
  const tagsRef = useRef<string>('');

  // Set mounted state to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load notes and tags from localStorage on mount
  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem(STORAGE_KEY_NOTES);
      const savedTags = localStorage.getItem(STORAGE_KEY_TAGS);
      
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes);
        setNotes(parsedNotes);
        notesRef.current = savedNotes;
      }
      if (savedTags) {
        const parsedTags = JSON.parse(savedTags);
        setTags(parsedTags);
        tagsRef.current = savedTags;
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    } finally {
      isInitialLoadRef.current = false;
    }
  }, []);

  // Save notes to localStorage only when values actually change
  useEffect(() => {
    if (isInitialLoadRef.current) return;
    
    const notesString = JSON.stringify(notes);
    if (notesString === notesRef.current) return; // No change
    
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, notesString);
      notesRef.current = notesString;
    } catch (error) {
      console.error('Error saving notes to localStorage:', error);
    }
  }, [notes]);

  // Save tags to localStorage only when values actually change
  useEffect(() => {
    if (isInitialLoadRef.current) return;
    
    const tagsString = JSON.stringify(tags);
    if (tagsString === tagsRef.current) return; // No change
    
    try {
      localStorage.setItem(STORAGE_KEY_TAGS, tagsString);
      tagsRef.current = tagsString;
    } catch (error) {
      console.error('Error saving tags to localStorage:', error);
    }
  }, [tags]);

  const [currentSports, setCurrentSports] = useState<string[]>([]);
  const [currentSchoolTypes, setCurrentSchoolTypes] = useState<string[]>([]);

  const handleSearch = async (
    searchOrigin: { lat: number; lng: number },
    driveTime: number,
    sports: string[],
    schoolTypes?: string[]
  ) => {
    setIsLoading(true);
    setOrigin(searchOrigin);
    setSelectedPlaceId(null);
    
    // Store search parameters for the analyzing overlay and ResultsTable
    setCurrentSearchParams({
      sports,
      schoolTypes,
      location: locationInput,
    });
    setCurrentSports(sports);
    setCurrentSchoolTypes(schoolTypes || []);

    try {
      // Generate isochrone first
      const isochroneResponse = await fetch(
        `/api/isochrone?lng=${searchOrigin.lng}&lat=${searchOrigin.lat}&minutes=${driveTime}`
      );
      let isochroneData = null;
      if (isochroneResponse.ok) {
        isochroneData = await isochroneResponse.json();
        setIsochroneGeoJSON(isochroneData);
      }

      // Search for places (pass isochrone for filtering)
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin: searchOrigin,
          sports,
          driveTimeMinutes: driveTime,
          isochroneGeoJSON: isochroneData, // Pass the fetched isochrone for polygon filtering
          schoolTypes: schoolTypes || [],
        }),
      });

      if (!searchResponse.ok) {
        let errorMessage = 'Search failed';
        try {
          // Read response as text first, then try to parse as JSON
          const responseText = await searchResponse.text();
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.error || errorMessage;
            console.error('Search API error:', error);
          } catch {
            // Not JSON, use text as error message
            console.error('Search API error (non-JSON):', responseText);
            errorMessage = `Server error (${searchResponse.status}): ${responseText.substring(0, 100)}`;
          }
        } catch (textError) {
          console.error('Search API error (could not read):', textError);
          errorMessage = `Server error (${searchResponse.status})`;
        }
        alert(`Search failed: ${errorMessage}`);
        setPlaces([]);
        return;
      }

      let searchData;
      try {
        searchData = await searchResponse.json();
      } catch (parseError) {
        console.error('Failed to parse search response:', parseError);
        alert('Invalid response from server. Please try again.');
        setPlaces([]);
        return;
      }
      // Safety guard: ensure places is an array
      const foundPlaces = Array.isArray(searchData.places) ? searchData.places : [];
      
      if (searchData.debug) {
        console.log('Search debug info:', searchData.debug);
        if (foundPlaces.length === 0 && searchData.debug.totalResultsFound > 0) {
          console.warn(`Found ${searchData.debug.totalResultsFound} results but all were filtered out. Check polygon filtering.`);
        }
      }
      
      setPlaces(foundPlaces);
      
      // MVP Option A: Switch to Results view on mobile after search completes
      if (foundPlaces.length > 0) {
        setMobileViewMode('results');
        setResultsSheetState('half');
        setFilterSheetState('collapsed');
      }
      
      // Log helpful debug info if no results
      if (foundPlaces.length === 0) {
        if (searchData.debug?.bypassedFiltering) {
          console.warn('Filtering removed all places - raw results returned for debugging');
        } else if (searchData.debug?.totalResultsFound === 0) {
          console.warn('Google Places API returned 0 results - check API key and enabled APIs');
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      alert(error instanceof Error ? error.message : 'Failed to search places');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceClick = useCallback((placeId: string) => {
    setSelectedPlaceId(prev => prev === placeId ? null : placeId);
  }, []);

  const handleNotesChange = useCallback((placeId: string, newNotes: string) => {
    setNotes(prev => ({
      ...prev,
      [placeId]: newNotes,
    }));
  }, []);

  const handleTagsChange = useCallback((placeId: string, newTags: string) => {
    setTags(prev => ({
      ...prev,
      [placeId]: newTags,
    }));
  }, []);

  const handleExport = useCallback(() => {
    // Safety guard: ensure places is an array
    if (!Array.isArray(places)) return;
    
    const exportData = places.map(place => {
      // Ensure name is a string (should already be converted from displayName.text)
      const displayName = typeof place.name === 'string' ? place.name : '';
      
      // MVP: Parse address into City, State, ZIP
      // Address format is typically: "Street Address, City, State ZIP"
      const addressParts = place.address.split(',').map(s => s.trim());
      let city = '';
      let state = '';
      let zip = '';
      
      if (addressParts.length >= 2) {
        city = addressParts[addressParts.length - 2] || '';
        const lastPart = addressParts[addressParts.length - 1] || '';
        // Extract state and ZIP (format: "State ZIP" or "State")
        const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
        if (stateZipMatch) {
          state = stateZipMatch[1] || '';
          zip = stateZipMatch[2] || '';
        } else {
          // Fallback: treat entire last part as state/zip
          state = lastPart;
        }
      }
      
      // MVP: Determine Public/Private from entityType
      const publicPrivate = place.entityType === 'Public School' 
        ? 'Public' 
        : place.entityType === 'Private School' 
          ? 'Private' 
          : 'N/A';
      
      // MVP: Sports offered (comma-separated)
      const sportsOffered = place.sports && place.sports.length > 0
        ? place.sports.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')
        : place.sport || '';
      
      return {
        'Entity Name': displayName,
        'Entity Type': place.entityType || 'Club',
        'Public / Private': publicPrivate,
        'Sports Offered': sportsOffered,
        'Address': place.address,
        'City': city,
        'State': state,
        'ZIP': zip,
        'Website': place.website || '',
        'Phone': place.phone || '',
        'Distance (miles)': place.distance ? place.distance.toFixed(2) : '',
        'Drive Time (minutes)': place.driveTime ?? '',
        'Confidence Score': place.clubScore ? place.clubScore.toFixed(1) : '',
        'Notes': notes[place.place_id] || '',
        'Tags': tags[place.place_id] || '',
      };
    });

    const csv = arrayToCSV(exportData);
    const filename = `sports-clubs-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  }, [places, notes, tags]);

  // Calculate summary stats
  const totalClubs = places.length;
  const highConfidenceClubs = places.filter(p => (p.clubScore ?? 0) >= 4).length;
  const avgDriveTime = places.length > 0
    ? Math.round(places.reduce((sum, p) => sum + (p.driveTime ?? 0), 0) / places.length)
    : 0;
  const avgDistance = places.length > 0
    ? places.reduce((sum, p) => sum + (p.distance ?? 0), 0) / places.length
    : 0;
  const youthFocused = places.filter(p => (p.ageGroups?.youth ?? 0) >= 2).length;
  const youthFocusedPercent = totalClubs > 0 ? Math.round((youthFocused / totalClubs) * 100) : 0;
  const mixedRecreational = places.filter(p => (p.clubScore ?? 0) < 3).length;
  const mixedRecreationalPercent = totalClubs > 0 ? Math.round((mixedRecreational / totalClubs) * 100) : 100;
  const privateSchools = places.filter(p => p.isSchool && p.schoolTypes?.includes('private')).length;
  const publicSchools = places.filter(p => p.isSchool && p.schoolTypes?.includes('public')).length;


  // Touch handlers and transforms now handled by BottomSheet component

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-luxury-dark text-primary">
      {/* MAP — root layer, full screen, fixed position */}
      <div className="fixed inset-0 z-0">
        <MapView
          origin={origin}
          places={places}
          isochroneGeoJSON={isochroneGeoJSON}
          selectedPlaceId={selectedPlaceId}
          onPlaceClick={handlePlaceClick}
        />
      </div>

      {/* ANALYZING OVERLAY — shows when searching */}
      <AnalyzingOverlay 
        isLoading={isLoading} 
        searchParams={currentSearchParams || undefined}
      />

      {/* MOBILE TOP SEARCH BAR — Apple Maps style (< 1024px) */}
      {isMounted && (
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-luxury-card/95 backdrop-blur-md border-b border-[#334155]/30">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#fbbf24]/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#fbbf24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onFocus={() => setFilterSheetState('half')}
                placeholder="Search location..."
                className="flex-1 px-4 py-2.5 bg-[#0f172a]/50 border border-[#334155]/30 rounded-full text-primary placeholder:text-tertiary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 text-base font-light transition-luxury backdrop-blur-sm"
                style={{ fontSize: '16px' }}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM SHEET — Apple Maps style (< 1024px) */}
      {/* MVP Option A: Toggle between Filters and Results views */}
      {isMounted && (
        <div className="lg:hidden">
          <BottomSheet
            state={mobileViewMode === 'results' ? resultsSheetState : filterSheetState}
            onStateChange={mobileViewMode === 'results' ? setResultsSheetState : setFilterSheetState}
            collapsedHeight="64px"
            halfHeight={mobileViewMode === 'results' ? "50vh" : "45vh"}
            fullHeight="85vh"
          >
            {mobileViewMode === 'results' && places.length > 0 ? (
              // Results View (after search)
              <div className="h-full flex flex-col">
                {/* Toggle Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]/30 flex-shrink-0">
                  <button
                    onClick={() => {
                      setMobileViewMode('filters');
                      setResultsSheetState('collapsed');
                      setFilterSheetState('half');
                    }}
                    className="text-xs font-light text-label text-tertiary hover:text-secondary transition-luxury"
                  >
                    ← Filters
                  </button>
                  <h2 className="text-xs font-light text-label text-tertiary">RESULTS</h2>
                  <div className="w-12"></div> {/* Spacer */}
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ResultsTable
                    places={places}
                    selectedPlaceId={selectedPlaceId}
                    onPlaceClick={handlePlaceClick}
                    notes={notes}
                    tags={tags}
                    onNotesChange={handleNotesChange}
                    onTagsChange={handleTagsChange}
                    onExport={handleExport}
                    selectedAgeGroups={selectedAgeGroups}
                    totalClubs={totalClubs}
                    highConfidenceClubs={highConfidenceClubs}
                    avgDriveTime={avgDriveTime}
                    avgDistance={avgDistance}
                    youthFocusedPercent={youthFocusedPercent}
                    mixedRecreationalPercent={mixedRecreationalPercent}
                    schoolTypes={currentSchoolTypes}
                    selectedSports={currentSports}
                  />
                </div>
              </div>
            ) : (
              // Filters View (before search or when toggled back)
              <div className="h-full flex flex-col">
                {/* Toggle Header (only show if results exist) */}
                {places.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]/30 flex-shrink-0">
                    <h2 className="text-xs font-light text-label text-tertiary">FILTERS</h2>
                    <button
                      onClick={() => {
                        setMobileViewMode('results');
                        setFilterSheetState('collapsed');
                        setResultsSheetState('half');
                      }}
                      className="text-xs font-light text-label text-tertiary hover:text-secondary transition-luxury"
                    >
                      Results →
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  <MobileFilters
                    onSearch={handleSearch}
                    isLoading={isLoading}
                    selectedAgeGroups={selectedAgeGroups}
                    onAgeGroupsChange={setSelectedAgeGroups}
                    locationInput={locationInput}
                    onLocationInputChange={setLocationInput}
                    onSearchTriggered={() => {
                      setMobileViewMode('results');
                      setFilterSheetState('collapsed');
                      setResultsSheetState('half');
                    }}
                  />
                </div>
              </div>
            )}
          </BottomSheet>
        </div>
      )}

      {/* DESKTOP TOP CONTROL BAR — visible on desktop (≥ 1024px) and tablet (768-1023px) */}
      <div className="hidden lg:block absolute top-0 left-0 right-0 z-30 bg-luxury-card backdrop-blur-md border-b border-[#334155]/30">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-light text-label text-secondary tracking-wider">SCOUTRADIUS</h1>
            <AuthButton />
          </div>
          <Controls
            onSearch={handleSearch}
            isLoading={isLoading}
            selectedAgeGroups={selectedAgeGroups}
            onAgeGroupsChange={setSelectedAgeGroups}
            locationInput={locationInput}
            onLocationInputChange={setLocationInput}
          />
        </div>
      </div>

      {/* USAGE DISPLAY — luxury overlay */}
      <UsageDisplay />

      {/* LEFT STATS CARDS — luxury overlay, floating (visible on desktop ≥ 1024px and tablet 768-1023px) */}
      <div className="hidden lg:block absolute left-5 top-44 z-20 space-y-3 pointer-events-none">
        <div className="pointer-events-auto">
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="text-2xl font-light text-numeric text-primary">{totalClubs}</div>
            <div className="text-[10px] text-label text-tertiary mt-1">TOTAL LOCATIONS</div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="text-2xl font-light text-numeric accent-emerald">{highConfidenceClubs}</div>
            <div className="text-[10px] text-label text-tertiary mt-1">CLUB COUNT</div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="text-2xl font-light text-numeric accent-gold">{avgDriveTime || '—'}</div>
            <div className="text-[10px] text-label text-tertiary mt-1">AVG DRIVE TIME</div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="text-2xl font-light text-numeric text-primary">{avgDistance ? avgDistance.toFixed(1) : '—'}</div>
            <div className="text-[10px] text-label text-tertiary mt-1">AVG DISTANCE (MI)</div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="text-2xl font-light text-numeric accent-gold">{privateSchools}</div>
            <div className="text-[10px] text-label text-tertiary mt-1">PRIVATE SCHOOLS</div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <div className="card-luxury rounded-lg px-5 py-4">
            <div className="text-2xl font-light text-numeric accent-emerald">{publicSchools}</div>
            <div className="text-[10px] text-label text-tertiary mt-1">PUBLIC SCHOOLS</div>
          </div>
        </div>
      </div>

      {/* DESKTOP RIGHT RESULTS PANEL — visible on desktop (≥ 1024px) and tablet (768-1023px) */}
      <div className="hidden lg:block absolute right-5 top-44 bottom-5 z-20 w-[420px] pointer-events-none">
        <div className="h-full pointer-events-auto flex flex-col bg-luxury-card backdrop-blur-md border border-[#334155]/30 rounded-lg overflow-hidden">
          {/* ALWAYS MOUNTED — never conditionally rendered */}
          <ResultsTable
            places={places}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={handlePlaceClick}
            notes={notes}
            tags={tags}
            onNotesChange={handleNotesChange}
            onTagsChange={handleTagsChange}
            onExport={handleExport}
            selectedAgeGroups={selectedAgeGroups}
            totalClubs={totalClubs}
            highConfidenceClubs={highConfidenceClubs}
            avgDriveTime={avgDriveTime}
            avgDistance={avgDistance}
            youthFocusedPercent={youthFocusedPercent}
            mixedRecreationalPercent={mixedRecreationalPercent}
            schoolTypes={currentSchoolTypes}
            selectedSports={currentSports}
          />
        </div>
      </div>
    </div>
  );
}
