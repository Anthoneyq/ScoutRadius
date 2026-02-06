'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import MapView from '@/components/MapView';
import ResultsTable from '@/components/ResultsTable';
import Controls from '@/components/Controls';
import { arrayToCSV, downloadCSV } from '@/lib/csv';
import { Place } from '@/lib/googlePlaces';

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
  const [onlyClubs, setOnlyClubs] = useState(false);
  const [showRecreational, setShowRecreational] = useState(true); // Show all by default
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  
  // Track if we're loading from localStorage to prevent save loops
  const isInitialLoadRef = useRef(true);
  const notesRef = useRef<string>('');
  const tagsRef = useRef<string>('');

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
    sports: string[]
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
        }),
      });

      if (!searchResponse.ok) {
        const error = await searchResponse.json();
        const errorMessage = error.error || 'Search failed';
        console.error('Search API error:', error);
        alert(`Search failed: ${errorMessage}`);
        setPlaces([]);
        return;
      }

      const searchData = await searchResponse.json();
      // Safety guard: ensure places is an array
      const foundPlaces = Array.isArray(searchData.places) ? searchData.places : [];
      
      if (searchData.debug) {
        console.log('Search debug info:', searchData.debug);
        if (foundPlaces.length === 0 && searchData.debug.totalResultsFound > 0) {
          console.warn(`Found ${searchData.debug.totalResultsFound} results but all were filtered out. Check polygon filtering.`);
        }
      }
      
      setPlaces(foundPlaces);
      
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
  const youthFocused = places.filter(p => (p.ageGroups?.youth ?? 0) >= 2).length;
  const youthFocusedPercent = totalClubs > 0 ? Math.round((youthFocused / totalClubs) * 100) : 0;
  const mixedRecreational = places.filter(p => (p.clubScore ?? 0) < 3).length;
  const mixedRecreationalPercent = totalClubs > 0 ? Math.round((mixedRecreational / totalClubs) * 100) : 0;

  return (
    <div className="h-screen flex flex-col bg-[#0f172a] text-slate-200">
      {/* Minimal header */}
      <header className="px-6 py-3 border-b border-slate-800/50">
        <h1 className="text-xl font-semibold text-slate-100">ScoutRadius</h1>
      </header>

      {/* Controls Panel - Horizontal, Simplified */}
      <Controls 
        onSearch={handleSearch} 
        isLoading={isLoading}
        onlyClubs={onlyClubs}
        onOnlyClubsChange={setOnlyClubs}
        showRecreational={showRecreational}
        onShowRecreationalChange={setShowRecreational}
        selectedAgeGroups={selectedAgeGroups}
        onAgeGroupsChange={setSelectedAgeGroups}
      />

      {/* Scout Summary Header */}
      {totalClubs > 0 && (
        <div className="px-6 py-4 border-b border-slate-800/50">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="card-dark rounded-lg px-4 py-3">
              <div className="text-3xl font-semibold text-numeric text-slate-100">{totalClubs}</div>
              <div className="text-xs text-slate-400 mt-1">Total Clubs</div>
            </div>
            <div className="card-dark rounded-lg px-4 py-3">
              <div className="text-3xl font-semibold text-numeric accent-green">{highConfidenceClubs}</div>
              <div className="text-xs text-slate-400 mt-1">High-Confidence</div>
            </div>
            <div className="card-dark rounded-lg px-4 py-3">
              <div className="text-3xl font-semibold text-numeric text-slate-100">{avgDriveTime}</div>
              <div className="text-xs text-slate-400 mt-1">Avg Drive Time</div>
              <div className="text-xs text-slate-500 mt-0.5">minutes</div>
            </div>
            <div className="card-dark rounded-lg px-4 py-3">
              <div className="text-3xl font-semibold text-numeric text-slate-100">{youthFocusedPercent}%</div>
              <div className="text-xs text-slate-400 mt-1">Youth-Focused</div>
            </div>
            <div className="card-dark rounded-lg px-4 py-3">
              <div className="text-3xl font-semibold text-numeric accent-gray">{mixedRecreationalPercent}%</div>
              <div className="text-xs text-slate-400 mt-1">Mixed / Rec</div>
            </div>
            {onlyClubs && (
              <div className="card-dark rounded-lg px-4 py-3 border-l-2 border-green-500/50">
                <div className="text-sm font-medium text-slate-300">Sorted by</div>
                <div className="text-xs text-slate-400 mt-0.5">Club Confidence</div>
              </div>
            )}
            {!showRecreational && (
              <div className="card-dark rounded-lg px-4 py-3 border-l-2 border-slate-500/50">
                <div className="text-sm font-medium text-slate-300">Recreational</div>
                <div className="text-xs text-slate-400 mt-0.5">Hidden</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content: Map + Table */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map - Increased height, dominates visually */}
        <div className="flex-[1.3] border-r border-slate-800/50 h-full">
          <MapView
            origin={origin}
            places={places}
            isochroneGeoJSON={isochroneGeoJSON}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={handlePlaceClick}
          />
        </div>

        {/* Results Table - Right Panel */}
        <div className="flex-1 overflow-hidden bg-[#0f172a]">
          <ResultsTable
            places={places}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={handlePlaceClick}
            notes={notes}
            tags={tags}
            onNotesChange={handleNotesChange}
            onTagsChange={handleTagsChange}
            onExport={handleExport}
            onlyClubs={onlyClubs}
            showRecreational={showRecreational}
            selectedAgeGroups={selectedAgeGroups}
          />
        </div>
      </div>
    </div>
  );
}
