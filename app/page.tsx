'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import MapView from '@/components/MapView';
import ResultsTable from '@/components/ResultsTable';
import Controls from '@/components/Controls';
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
      
      // Collapse sidebar to icon view on mobile after search completes
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


  return (
    <div className="relative h-screen w-screen overflow-hidden bg-luxury-dark text-primary">
      {/* MAP — always bottom layer, full screen */}
      <div className="absolute inset-0 z-0">
        <MapView
          origin={origin}
          places={places}
          isochroneGeoJSON={isochroneGeoJSON}
          selectedPlaceId={selectedPlaceId}
          onPlaceClick={handlePlaceClick}
        />
      </div>

      {/* MOBILE COLLAPSED SIDEBAR — icon bar when collapsed (shows after Analyze) */}
      {isMounted && (
        <div className={`md:hidden fixed left-0 top-14 bottom-0 z-40 w-12 bg-luxury-card backdrop-blur-md border-r border-[#334155]/30 transform transition-transform duration-300 ease-in-out ${
          sidebarCollapsed && !sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="flex flex-col items-center py-4 space-y-3">
          <button
            onClick={() => {
              setSidebarOpen(true);
              setSidebarCollapsed(false);
            }}
            className="p-2 text-primary hover:text-[#fbbf24] transition-luxury"
            aria-label="Open menu"
            title="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => {
              setSidebarOpen(true);
              setSidebarCollapsed(false);
            }}
            className="p-2 text-primary hover:text-[#fbbf24] transition-luxury"
            aria-label="Open results"
            title="Results"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </button>
        </div>
        </div>
      )}

      {/* MOBILE SIDEBAR — slides in from left on mobile (narrower) */}
      {/* Only render sidebar after mount to prevent hydration issues */}
      {isMounted && (
        <div className={`md:hidden fixed top-14 left-0 bottom-0 z-40 w-[75vw] max-w-xs bg-luxury-card backdrop-blur-md border-r border-[#334155]/30 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        {/* Sidebar Header */}
        <div className="sticky top-0 bg-luxury-card border-b border-[#334155]/30 px-4 py-3 flex items-center justify-between z-10">
          <h1 className="text-sm font-light text-label text-secondary tracking-wider">SCOUTRADIUS</h1>
          <button
            onClick={() => {
              setSidebarOpen(false);
              setSidebarCollapsed(true);
            }}
            className="p-1 text-tertiary hover:text-primary transition-luxury"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="px-4 py-4 space-y-4">
          {/* Controls in Sidebar */}
          <Controls 
            onSearch={handleSearch} 
            isLoading={isLoading}
            selectedAgeGroups={selectedAgeGroups}
            onAgeGroupsChange={setSelectedAgeGroups}
            locationInput={locationInput}
            onLocationInputChange={setLocationInput}
          />

          {/* Results Table in Sidebar */}
          <div className="flex flex-col bg-luxury-card border border-[#334155]/30 rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
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
      )}

      {/* MOBILE TOP BAR — hamburger + location input always visible */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-luxury-card backdrop-blur-md border-b border-[#334155]/30 px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => {
            setSidebarOpen(!sidebarOpen);
            setSidebarCollapsed(false);
          }}
          className="p-2 text-primary hover:text-[#fbbf24] transition-luxury flex-shrink-0"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={locationInput}
            placeholder="Starting location..."
            className="w-full px-3 py-2 bg-[#0f172a]/50 border border-[#334155]/30 rounded-md text-sm text-primary placeholder:text-tertiary focus:ring-1 focus:ring-[#fbbf24]/20 focus:border-[#fbbf24]/30 font-light transition-luxury"
            onClick={() => {
              if (!sidebarOpen) {
                setSidebarOpen(true);
                setSidebarCollapsed(false);
              }
            }}
            readOnly
            aria-label="Starting location"
          />
        </div>
      </div>

      {/* MOBILE SIDEBAR BACKDROP — closes sidebar when clicked */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => {
            setSidebarOpen(false);
            setSidebarCollapsed(true);
          }}
        />
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
