'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import MapView from '@/components/MapView';
import ResultsTable from '@/components/ResultsTable';
import Controls from '@/components/Controls';
import AnalyzingOverlay from '@/components/AnalyzingOverlay';
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
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar state - starts closed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Mobile sidebar collapsed state (shows icons)
  const [locationInput, setLocationInput] = useState(''); // Shared location input state
  const [isMounted, setIsMounted] = useState(false); // Prevent hydration issues
  const [bottomSheetPosition, setBottomSheetPosition] = useState<'collapsed' | 'expanded' | 'results'>('collapsed'); // Mobile bottom sheet state
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);
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

  const handleSearch = async (
    searchOrigin: { lat: number; lng: number },
    driveTime: number,
    sports: string[],
    schoolTypes?: string[]
  ) => {
    setIsLoading(true);
    setOrigin(searchOrigin);
    setSelectedPlaceId(null);
    
    // Store search parameters for the analyzing overlay
    setCurrentSearchParams({
      sports,
      schoolTypes,
      location: locationInput,
    });

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
      
      // Expand bottom sheet to results view on mobile after search completes
      setBottomSheetPosition('results');
      setSidebarCollapsed(true);
      setSidebarOpen(false);
      
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
      
      return {
        'Club Name': displayName,
        'Sport': place.sport || '',
        'Drive Time (minutes)': place.driveTime ?? '',
        'Distance (miles)': place.distance ? place.distance.toFixed(2) : '',
        'Address': place.address,
        'Phone': place.phone || '',
        'Website': place.website || '',
        'Rating': place.rating ? place.rating.toFixed(1) : '',
        'Review Count': place.review_count?.toString() || '',
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


  // Handle bottom sheet drag
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setDragStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    e.preventDefault();
    e.stopPropagation();
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragStartY;
    setDragCurrentY(deltaY);
  };

  const handleTouchEnd = () => {
    if (dragStartY === null) {
      setDragStartY(null);
      setDragCurrentY(null);
      return;
    }

    const threshold = 50; // Minimum drag distance to trigger state change
    
    if (dragCurrentY !== null) {
      if (dragCurrentY > threshold) {
        // Dragging down - collapse
        if (bottomSheetPosition === 'results') {
          setBottomSheetPosition('expanded');
        } else if (bottomSheetPosition === 'expanded') {
          setBottomSheetPosition('collapsed');
        }
      } else if (dragCurrentY < -threshold) {
        // Dragging up - expand
        if (bottomSheetPosition === 'collapsed') {
          setBottomSheetPosition('expanded');
        } else if (bottomSheetPosition === 'expanded') {
          setBottomSheetPosition('results');
        }
      }
    }

    setDragStartY(null);
    setDragCurrentY(null);
  };

  // Calculate bottom sheet transform
  const getBottomSheetTransform = () => {
    if (dragCurrentY !== null && dragStartY !== null) {
      // During drag, show live position
      const baseTransform = bottomSheetPosition === 'collapsed' ? '45%' : bottomSheetPosition === 'expanded' ? '0' : '20%';
      const baseValue = bottomSheetPosition === 'collapsed' ? 45 : bottomSheetPosition === 'expanded' ? 0 : 20;
      const dragPercent = (dragCurrentY / window.innerHeight) * 100;
      return `${Math.max(0, Math.min(45, baseValue + dragPercent))}%`;
    }
    
    // Static positions
    if (bottomSheetPosition === 'collapsed') return '45%';
    if (bottomSheetPosition === 'expanded') return '0';
    if (bottomSheetPosition === 'results') return '20%';
    return '45%';
  };

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

      {/* MOBILE BOTTOM SHEET — map-first interface */}
      {isMounted && (
        <>
          {/* Bottom Sheet */}
          <div
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-luxury-card backdrop-blur-md border-t border-[#334155]/30 rounded-t-2xl shadow-2xl touch-none"
            style={{
              height: '65vh',
              transform: `translateY(${getBottomSheetTransform()})`,
              transition: dragCurrentY === null ? 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            }}
          >
            {/* Grab Handle - draggable area */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-9 h-1 bg-[#334155]/50 rounded-full"></div>
            </div>

            {/* Sheet Content */}
            <div className="flex flex-col h-[calc(65vh-16px)] overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-[#334155]/30 flex-shrink-0">
                <h1 className="text-sm font-light text-label text-secondary tracking-wider">SCOUTRADIUS</h1>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                {bottomSheetPosition === 'results' && places.length > 0 ? (
                  // Results View (after search) - scrollable
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
                  />
                ) : (
                  // Controls View (pre-search or expanded)
                  <div className="px-4 py-4">
                    <Controls 
                      onSearch={handleSearch} 
                      isLoading={isLoading}
                      selectedAgeGroups={selectedAgeGroups}
                      onAgeGroupsChange={setSelectedAgeGroups}
                      locationInput={locationInput}
                      onLocationInputChange={setLocationInput}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tap area to expand when collapsed - invisible overlay */}
          {bottomSheetPosition === 'collapsed' && (
            <div
              className="md:hidden fixed bottom-0 left-0 right-0 h-[35vh] z-30 pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setBottomSheetPosition('expanded');
              }}
            />
          )}
        </>
      )}

      {/* FLOATING ANALYZE BUTTON — when bottom sheet is collapsed */}
      {isMounted && bottomSheetPosition === 'collapsed' && (
        <div className="md:hidden fixed bottom-24 left-4 right-4 z-50 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Expand sheet to show controls
              setBottomSheetPosition('expanded');
            }}
            className="w-full px-8 py-3 bg-gradient-to-r from-[#fbbf24]/20 to-[#f59e0b]/20 hover:from-[#fbbf24]/30 hover:to-[#f59e0b]/30 text-primary rounded-md font-light disabled:opacity-40 disabled:cursor-not-allowed transition-luxury text-sm text-label border-2 border-[#fbbf24]/40 hover:border-[#fbbf24]/60 backdrop-blur-sm hover:shadow-[0_0_24px_rgba(251,191,36,0.25)] shadow-[0_0_12px_rgba(251,191,36,0.15)] accent-gold font-medium"
            disabled={isLoading}
          >
            {isLoading ? 'ANALYZING...' : 'ANALYZE AREA'}
          </button>
        </div>
      )}

      {/* DESKTOP TOP CONTROL BAR — hidden on mobile */}
      <div className="hidden md:block absolute top-0 left-0 right-0 z-30 bg-luxury-card backdrop-blur-md border-b border-[#334155]/30">
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

      {/* LEFT STATS CARDS — luxury overlay, floating (hidden on mobile) */}
      <div className="hidden md:block absolute left-5 top-44 z-20 space-y-3 pointer-events-none">
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

      {/* DESKTOP RIGHT RESULTS PANEL — hidden on mobile (shown in sidebar instead) */}
      <div className="hidden md:block absolute right-5 top-44 bottom-5 z-20 w-[420px] pointer-events-none">
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
          />
        </div>
      </div>
    </div>
  );
}
