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
      const foundPlaces = searchData.places || [];
      
      if (searchData.debug) {
        console.log('Search debug info:', searchData.debug);
        if (foundPlaces.length === 0 && searchData.debug.totalResultsFound > 0) {
          console.warn(`Found ${searchData.debug.totalResultsFound} results but all were filtered out. Check polygon filtering.`);
        }
      }
      
      setPlaces(foundPlaces);
      
      if (foundPlaces.length === 0) {
        alert('No places found. Check browser console for details. Make sure Google Maps API key is configured.');
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
    const exportData = places.map(place => ({
      'Club Name': place.name,
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
    }));

    const csv = arrayToCSV(exportData);
    const filename = `sports-clubs-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  }, [places, notes, tags]);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-blue-600 text-white px-6 py-4 shadow-md">
        <h1 className="text-2xl font-bold">ScoutRadius</h1>
        <p className="text-sm text-blue-100">Find sports clubs within drive time</p>
      </header>

      <Controls onSearch={handleSearch} isLoading={isLoading} />

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r h-full">
          <MapView
            origin={origin}
            places={places}
            isochroneGeoJSON={isochroneGeoJSON}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={handlePlaceClick}
          />
        </div>

        <div className="w-1/2 overflow-hidden">
          <ResultsTable
            places={places}
            selectedPlaceId={selectedPlaceId}
            onPlaceClick={handlePlaceClick}
            notes={notes}
            tags={tags}
            onNotesChange={handleNotesChange}
            onTagsChange={handleTagsChange}
            onExport={handleExport}
          />
        </div>
      </div>
    </div>
  );
}
