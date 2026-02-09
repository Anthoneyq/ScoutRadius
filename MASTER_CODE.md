# ScoutRadius - Master Code Documentation

**Last Updated:** February 5, 2026  
**Framework:** Next.js 14 (App Router) + TypeScript  
**Deployment:** Vercel

---

## Table of Contents

1. [Core Application Files](#core-application-files)
2. [API Routes](#api-routes)
3. [Components](#components)
4. [Library/Utilities](#libraryutilities)
5. [Configuration](#configuration)

---

## Core Application Files

### `app/page.tsx`

Main application page component that orchestrates state, search, map, and table.

```typescript
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

type AnalysisStage = 
  | "idle" 
  | "isochrone" 
  | "entityFetch" 
  | "sportValidation" 
  | "schoolValidation" 
  | "ranking" 
  | "complete";

export default function Home() {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState<any>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>("idle");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Record<string, string>>({});
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [filterSheetState, setFilterSheetState] = useState<SheetState>('collapsed');
  const [resultsSheetState, setResultsSheetState] = useState<SheetState>('collapsed');
  const [mobileViewMode, setMobileViewMode] = useState<'filters' | 'results'>('filters');
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
        tagsRef.current = parsedTags;
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
    if (notesString === notesRef.current) return;
    
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
    if (tagsString === tagsRef.current) return;
    
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
    setAnalysisStage("isochrone");
    setOrigin(searchOrigin);
    setSelectedPlaceId(null);
    
    setCurrentSearchParams({
      sports,
      schoolTypes,
      location: locationInput,
    });
    setCurrentSports(sports);
    setCurrentSchoolTypes(schoolTypes || []);

    try {
      // Stage 1: Generate isochrone
      const isochroneResponse = await fetch(
        `/api/isochrone?lng=${searchOrigin.lng}&lat=${searchOrigin.lat}&minutes=${driveTime}`
      );
      let isochroneData = null;
      if (isochroneResponse.ok) {
        isochroneData = await isochroneResponse.json();
        setIsochroneGeoJSON(isochroneData);
      }
      
      setAnalysisStage("entityFetch");

      // Stage 2: Search for places
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin: searchOrigin,
          sports,
          driveTimeMinutes: driveTime,
          isochroneGeoJSON: isochroneData,
          schoolTypes: schoolTypes || [],
        }),
      });

      if (!searchResponse.ok) {
        setAnalysisStage("idle");
        let errorMessage = 'Search failed';
        try {
          const responseText = await searchResponse.text();
          try {
            const error = JSON.parse(responseText);
            errorMessage = error.error || errorMessage;
            console.error('Search API error:', error);
          } catch {
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
        setAnalysisStage("idle");
        console.error('Failed to parse search response:', parseError);
        alert('Invalid response from server. Please try again.');
        setPlaces([]);
        return;
      }
      
      const foundPlaces = Array.isArray(searchData.places) ? searchData.places : [];
      
      // Stages 3-5: Validation and ranking (all happen server-side)
      if (sports.length > 0) {
        setAnalysisStage("sportValidation");
      }
      if (schoolTypes && schoolTypes.length > 0) {
        setAnalysisStage("schoolValidation");
      }
      setAnalysisStage("ranking");
      
      if (searchData.debug) {
        console.log('Search debug info:', searchData.debug);
        if (foundPlaces.length === 0 && searchData.debug.totalResultsFound > 0) {
          console.warn(`Found ${searchData.debug.totalResultsFound} results but all were filtered out. Check polygon filtering.`);
        }
      }
      
      setPlaces(foundPlaces);
      setAnalysisStage("complete");
      
      if (foundPlaces.length > 0) {
        setMobileViewMode('results');
        setResultsSheetState('half');
        setFilterSheetState('collapsed');
      }
      
      if (foundPlaces.length === 0) {
        if (searchData.debug?.bypassedFiltering) {
          console.warn('Filtering removed all places - raw results returned for debugging');
        } else if (searchData.debug?.totalResultsFound === 0) {
          console.warn('Google Places API returned 0 results - check API key and enabled APIs');
        }
      }
    } catch (error) {
      setAnalysisStage("idle");
      console.error('Search error:', error);
      alert(error instanceof Error ? error.message : 'Failed to search places');
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setAnalysisStage("idle");
      }, 300);
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
    if (!Array.isArray(places)) return;
    
    const exportData = places.map(place => {
      const displayName = typeof place.name === 'string' ? place.name : '';
      
      const addressParts = place.address.split(',').map(s => s.trim());
      let city = '';
      let state = '';
      let zip = '';
      
      if (addressParts.length >= 2) {
        city = addressParts[addressParts.length - 2] || '';
        const lastPart = addressParts[addressParts.length - 1] || '';
        const stateZipMatch = lastPart.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
        if (stateZipMatch) {
          state = stateZipMatch[1] || '';
          zip = stateZipMatch[2] || '';
        } else {
          state = lastPart;
        }
      }
      
      const publicPrivate = place.entityType === 'Public School' 
        ? 'Public' 
        : place.entityType === 'Private School' 
          ? 'Private' 
          : 'N/A';
      
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
        analysisStage={analysisStage}
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
              <div className="h-full flex flex-col">
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
                  <div className="w-12"></div>
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
              <div className="h-full flex flex-col">
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

      {/* DESKTOP TOP CONTROL BAR — visible on desktop (≥ 1024px) */}
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

      {/* USAGE DISPLAY */}
      <UsageDisplay />

      {/* LEFT STATS CARDS — desktop only */}
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

      {/* DESKTOP RIGHT RESULTS PANEL */}
      <div className="hidden lg:block absolute right-5 top-44 bottom-5 z-20 w-[420px] pointer-events-none">
        <div className="h-full pointer-events-auto flex flex-col bg-luxury-card backdrop-blur-md border border-[#334155]/30 rounded-lg overflow-hidden">
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
```

### `app/layout.tsx`

Root layout with ClerkProvider and metadata.

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ScoutRadius - Sports Club Finder',
  description: 'Find sports clubs within your drive time radius',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  if (!publishableKey || publishableKey.trim() === '') {
    return (
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    );
  }
  
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

---

## API Routes

### `app/api/search/route.ts`

Main search API route that handles Google Places search, filtering, validation, and ranking.

**Key Features:**
- Google Places API (New) integration
- Strict filtering logic (entity types, sports)
- OSM validation
- AI classification (with paywall)
- Retail store exclusion
- Drive-time calculation via Mapbox Directions

**Note:** This file is ~1200 lines. See full implementation in repository.

**Main Function:**
```typescript
export async function POST(request: NextRequest) {
  // Auth check (optional)
  // Parse request body
  // Search for places by sport keywords
  // Search for schools if school types selected
  // Apply strict filtering
  // Calculate drive times
  // Return filtered results
}
```

### `app/api/isochrone/route.ts`

Generates drive-time isochrone polygons using Mapbox Isochrone API.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { generateIsochrone } from '@/lib/mapbox';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lng = parseFloat(searchParams.get('lng') || '');
  const lat = parseFloat(searchParams.get('lat') || '');
  const minutes = parseInt(searchParams.get('minutes') || '15');

  if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
    return NextResponse.json(
      { error: 'Missing or invalid lng/lat parameters' },
      { status: 400 }
    );
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: 'MAPBOX_ACCESS_TOKEN not configured' },
      { status: 500 }
    );
  }

  try {
    const isochrone = await generateIsochrone(lng, lat, minutes, accessToken);
    return NextResponse.json(isochrone);
  } catch (error) {
    console.error('Isochrone API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate isochrone' },
      { status: 500 }
    );
  }
}
```

---

## Components

### `components/MapView.tsx`

Mapbox GL JS map component with markers, popups, and isochrone rendering.

**Key Features:**
- Single map instance (created once)
- Marker positioning fixes (prevents drift on zoom)
- Luxury styling (dark theme, gold accents)
- Click handlers for place selection
- Hover effects

**Note:** Full implementation ~490 lines. See repository for complete code.

### `components/ResultsTable.tsx`

Ranked results table component with sorting, filtering, and export.

**Key Features:**
- Sortable columns (drive time, distance, rating)
- Age group filtering
- Sport filtering
- Search query filtering
- Notes/tags editing
- CSV export
- Mobile-responsive stats display
- Scroll-to-selected-item functionality

**Note:** Full implementation ~510 lines. See repository for complete code.

### `components/Controls.tsx`

Desktop filter controls component.

**Key Features:**
- Location input (address or coordinates)
- Drive time selector (5-60 minutes)
- Sport multi-select dropdown
- Entity type filter (Public School, Private School, Club)
- School level filters (Elementary, Middle, Jr High, High School)
- Age group filter
- Analyze Area button

**Note:** Full implementation ~465 lines. See repository for complete code.

### `components/AnalyzingOverlay.tsx`

Event-driven loading overlay with progress bars.

**Key Features:**
- Stage-based progress (isochrone, entityFetch, sportValidation, schoolValidation, ranking)
- No timer-based animation (event-driven)
- Hides immediately when complete
- Dynamic messages based on search params

```typescript
'use client';

type AnalysisStage = 
  | "idle" 
  | "isochrone" 
  | "entityFetch" 
  | "sportValidation" 
  | "schoolValidation" 
  | "ranking" 
  | "complete";

interface AnalyzingOverlayProps {
  analysisStage: AnalysisStage;
  searchParams?: {
    sports?: string[];
    schoolTypes?: string[];
    location?: string;
  };
}

const STAGE_ORDER: AnalysisStage[] = [
  "idle",
  "isochrone",
  "entityFetch",
  "sportValidation",
  "schoolValidation",
  "ranking",
  "complete",
];

export default function AnalyzingOverlay({ analysisStage, searchParams }: AnalyzingOverlayProps) {
  // Hide overlay when idle or complete
  if (analysisStage === "idle" || analysisStage === "complete") {
    return null;
  }

  // Helper function to determine bar state
  const getBarState = (stage: AnalysisStage) => {
    const currentIndex = STAGE_ORDER.indexOf(analysisStage);
    const stageIndex = STAGE_ORDER.indexOf(stage);
    
    if (stageIndex < currentIndex) {
      return 'complete';
    } else if (stageIndex === currentIndex) {
      return 'active';
    } else {
      return 'inactive';
    }
  };

  // Render progress bars based on stage
  // ... (see repository for full implementation)
}
```

### `components/BottomSheet.tsx`

Reusable draggable bottom sheet component for mobile.

**Key Features:**
- Three states: collapsed, half, full
- Drag gestures (pointer events)
- Snap points
- Map interaction when collapsed

**Note:** Full implementation ~155 lines. See repository for complete code.

### `components/MobileFilters.tsx`

Mobile filter UI component (used in bottom sheet).

**Key Features:**
- Same filters as desktop Controls
- Optimized for mobile touch
- iOS zoom prevention (font-size: 16px)

**Note:** Full implementation ~390 lines. See repository for complete code.

---

## Library/Utilities

### `lib/googlePlaces.ts`

Google Places API client and place conversion utilities.

**Key Exports:**
- `Place` interface
- `EntityType` type
- `searchPlaces()` function
- `convertGooglePlace()` function
- `getClubConfidence()` function
- `getAgeGroupScores()` function
- `getPrimaryAgeGroup()` function
- `deduplicatePlaces()` function

**Note:** Full implementation ~460 lines. See repository for complete code.

### `lib/csv.ts`

CSV export utilities.

```typescript
export interface ExportRow {
  'Entity Name': string;
  'Entity Type': string;
  'Public / Private': string;
  'Sports Offered': string;
  'Address': string;
  'City': string;
  'State': string;
  'ZIP': string;
  'Website': string;
  'Phone': string;
  'Distance (miles)': number | string;
  'Drive Time (minutes)': number | string;
  'Confidence Score': number | string;
  'Notes': string;
  'Tags': string;
}

export function arrayToCSV(data: ExportRow[]): string {
  // Converts array to CSV string
}

export function downloadCSV(csvContent: string, filename: string = 'export.csv'): void {
  // Triggers browser download
}
```

### `lib/paywall.ts`

Usage limits and paywall logic.

```typescript
export const USAGE_LIMITS: UsageLimits = {
  free: {
    aiClassificationsPerMonth: 10,
    searchesPerMonth: 50,
  },
  pro: {
    aiClassificationsPerMonth: 1000,
    searchesPerMonth: 10000,
  },
};

export function canUseAI(userUsage: UserUsage | null): boolean {
  // Check if user can use AI classification
}

export function canSearch(userUsage: UserUsage | null): boolean {
  // Check if user can perform search
}
```

### `lib/mapbox.ts`

Mapbox utilities (isochrone generation, directions).

**Note:** See repository for full implementation.

### `lib/db.ts`

Neon database client and queries for usage tracking.

**Note:** See repository for full implementation.

### `lib/aiClassifier.ts`

OpenAI classification utility (gpt-4o-mini).

**Note:** See repository for full implementation.

### `lib/osmLookup.ts`

OpenStreetMap validation utilities.

**Note:** See repository for full implementation.

### `lib/retailExclusions.ts`

Retail store exclusion filters.

**Note:** See repository for full implementation.

---

## Configuration

### `middleware.ts`

Clerk authentication middleware.

```typescript
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const clerkSecretKey = process.env.CLERK_SECRET_KEY;

export default clerkSecretKey
  ? clerkMiddleware()
  : (req: NextRequest) => {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

### `package.json`

Dependencies and scripts.

```json
{
  "name": "scout-radius",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@clerk/nextjs": "^6.37.3",
    "@mapbox/mapbox-gl-geocoder": "^5.0.2",
    "@neondatabase/serverless": "^1.0.2",
    "@stripe/stripe-js": "^8.7.0",
    "@turf/turf": "^7.3.3",
    "mapbox-gl": "^3.0.1",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "stripe": "^20.3.1"
  },
  "devDependencies": {
    "@types/mapbox-gl": "^3.0.0",
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.2.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Environment Variables

Required environment variables (set in `.env.local` or Vercel):

```
# Mapbox
MAPBOX_ACCESS_TOKEN=pk.your_token
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token

# Google Places API (New)
GOOGLE_MAPS_API_KEY=your_key

# Clerk (optional)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Neon Database (optional)
POSTGRES_URL=postgresql://...

# Stripe (optional)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenAI (optional)
OPENAI_API_KEY=sk-proj-...
```

---

## Architecture Summary

**Frontend:**
- Next.js 14 App Router
- TypeScript
- React 18
- Tailwind CSS
- Mapbox GL JS
- Clerk (authentication)
- Stripe (payments)

**Backend:**
- Next.js API Routes
- Google Places API (New)
- Mapbox Isochrone API
- Mapbox Directions API
- OpenAI API (gpt-4o-mini)
- OpenStreetMap Overpass API
- Neon Postgres (usage tracking)

**Storage:**
- LocalStorage (notes/tags)
- Neon Postgres (user usage)

**Deployment:**
- Vercel

---

## Key Design Patterns

1. **Event-Driven Loading:** Progress bars reflect actual async completion, not timers
2. **Strict Filtering:** Entity type filters are hard gates (schools exclude clubs, etc.)
3. **Responsive Layout:** Same data/logic, different containers (desktop vs mobile)
4. **Luxury Design:** Dark theme, gold accents, minimal UI
5. **Fail-Safe Error Handling:** Graceful degradation when APIs fail
6. **Paywall Integration:** Usage limits enforced per user plan

---

**End of Master Code Documentation**

For complete file contents, see the repository at: https://github.com/Anthoneyq/ScoutRadius
