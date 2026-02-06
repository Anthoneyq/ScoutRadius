'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Place {
  place_id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  sport?: string;
  driveTime?: number;
  distance?: number;
  clubScore?: number;
  isClub?: boolean;
}

interface MapViewProps {
  origin: { lat: number; lng: number } | null;
  places: Place[];
  isochroneGeoJSON: any;
  selectedPlaceId: string | null;
  onPlaceClick: (placeId: string) => void;
}

export default function MapView(props: MapViewProps) {
  const {
    origin = null,
    places = [],
    isochroneGeoJSON = null,
    selectedPlaceId = null,
    onPlaceClick = () => {},
  } = props || {};
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const onPlaceClickRef = useRef(onPlaceClick);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Keep callback ref updated without causing re-renders
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
  }, [onPlaceClick]);

  // 1️⃣ CREATE MAP ONCE - no dependencies on props
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
    if (!accessToken || accessToken === 'pk.your_mapbox_token_here') {
      console.error('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN not found or not configured');
      setMapError('Mapbox token not configured. Please add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to .env.local');
      return;
    }

    mapboxgl.accessToken = accessToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11', // Dark theme map
      center: [-122.4194, 37.7749], // Default center, will update via flyTo
      zoom: 10,
    });

    map.current.on('load', () => {
      setIsLoaded(true);
      setMapError(null);
    });

    map.current.on('error', (e) => {
      console.error('Mapbox error:', e);
      setMapError('Failed to load map. Check your Mapbox token.');
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);


  // Update map center when origin changes
  useEffect(() => {
    if (!map.current || !isLoaded || !origin) return;

    map.current.flyTo({
      center: [origin.lng, origin.lat],
      zoom: 11,
    });

    // Remove existing origin marker
    if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }

    // Add origin marker
    const el = document.createElement('div');
    el.className = 'origin-marker';
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#6366f1'; // Indigo for origin
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.3), 0 2px 4px rgba(0,0,0,0.4)';
    el.style.cursor = 'pointer';

    originMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([origin.lng, origin.lat])
      .addTo(map.current);
  }, [origin, isLoaded]);

  // Update isochrone polygon
  useEffect(() => {
    if (!map.current || !isLoaded || !isochroneGeoJSON) return;

    const source = map.current.getSource('isochrone') as mapboxgl.GeoJSONSource;
    
    if (source) {
      source.setData(isochroneGeoJSON);
    } else {
      map.current.addSource('isochrone', {
        type: 'geojson',
        data: isochroneGeoJSON,
      });

      map.current.addLayer({
        id: 'isochrone-fill',
        type: 'fill',
        source: 'isochrone',
        paint: {
          'fill-color': '#eab308', // Yellow for drive-time polygon
          'fill-opacity': 0.15, // More subtle
        },
      });

      map.current.addLayer({
        id: 'isochrone-outline',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#eab308',
          'line-width': 2,
          'line-opacity': 0.6,
        },
      });
    }
  }, [isochroneGeoJSON, isLoaded]);

  // Update place markers - DO NOT include onPlaceClick in deps
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    // Remove markers for places that no longer exist
    const currentPlaceIds = new Set(places.map(p => p.place_id));
    markersRef.current.forEach((marker, placeId) => {
      if (!currentPlaceIds.has(placeId)) {
        marker.remove();
        markersRef.current.delete(placeId);
      }
    });

    // Add/update markers for current places
    places.forEach(place => {
      const existingMarker = markersRef.current.get(place.place_id);
      const isSelected = place.place_id === selectedPlaceId;

      if (existingMarker) {
        // Update existing marker
        existingMarker.setLngLat([place.location.lng, place.location.lat]);
        
        // Update marker appearance for selection and confidence
        const el = existingMarker.getElement();
        if (el) {
          const clubScore = place.clubScore ?? 0;
          let markerColor: string;
          let markerSize: number;
          
          if (clubScore >= 4) {
            markerColor = '#22c55e'; // Green
            markerSize = isSelected ? 20 : 14;
          } else if (clubScore >= 2) {
            markerColor = '#eab308'; // Yellow
            markerSize = isSelected ? 18 : 12;
          } else {
            markerColor = '#94a3b8'; // Gray
            markerSize = isSelected ? 16 : 10;
          }
          
          el.style.width = `${markerSize}px`;
          el.style.height = `${markerSize}px`;
          el.style.backgroundColor = markerColor;
          el.style.zIndex = isSelected ? '1000' : '1';
          el.style.border = isSelected ? '3px solid white' : '2px solid rgba(255,255,255,0.8)';
          el.style.boxShadow = isSelected 
            ? '0 0 0 4px rgba(34, 197, 94, 0.3), 0 2px 8px rgba(0,0,0,0.4)' 
            : '0 2px 4px rgba(0,0,0,0.3)';
        }
      } else {
        // Create new marker with confidence-based color
        const clubScore = place.clubScore ?? 0;
        let markerColor: string;
        let markerSize: number;
        
        if (clubScore >= 4) {
          markerColor = '#22c55e'; // Green - high confidence
          markerSize = isSelected ? 20 : 14;
        } else if (clubScore >= 2) {
          markerColor = '#eab308'; // Yellow - mixed
          markerSize = isSelected ? 18 : 12;
        } else {
          markerColor = '#94a3b8'; // Gray - uncertain/recreational
          markerSize = isSelected ? 16 : 10;
        }
        
        const el = document.createElement('div');
        el.className = 'place-marker';
        el.style.width = `${markerSize}px`;
        el.style.height = `${markerSize}px`;
        el.style.borderRadius = '50%';
        el.style.backgroundColor = markerColor;
        el.style.border = isSelected ? '3px solid white' : '2px solid rgba(255,255,255,0.8)';
        el.style.boxShadow = isSelected 
          ? '0 0 0 4px rgba(34, 197, 94, 0.3), 0 2px 8px rgba(0,0,0,0.4)' 
          : '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s';

        const marker = new mapboxgl.Marker(el)
          .setLngLat([place.location.lng, place.location.lat])
          .addTo(map.current!);

        el.addEventListener('click', () => {
          onPlaceClickRef.current(place.place_id);
        });

        markersRef.current.set(place.place_id, marker);
      }
    });
  }, [places, selectedPlaceId, isLoaded]);

  return (
    <div className="w-full h-full relative bg-[#0f172a]">
      <div ref={mapContainer} className="w-full h-full" />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a]/95 z-10">
          <div className="bg-[#1e293b] p-6 rounded-lg shadow-xl max-w-md mx-4 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Map Error</h3>
            <p className="text-sm text-slate-300 mb-4">{mapError}</p>
            <p className="text-xs text-slate-400">
              Add your Mapbox token to <code className="bg-slate-800 px-1 rounded text-slate-200">.env.local</code>:
              <br />
              <code className="bg-slate-800 px-1 rounded text-slate-200">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token</code>
            </p>
          </div>
        </div>
      )}
      <style jsx global>{`
        .mapboxgl-popup-content {
          padding: 12px;
          font-family: system-ui, -apple-system, sans-serif;
          background-color: #1e293b;
          color: #e2e8f0;
          border: 1px solid rgba(148, 163, 184, 0.1);
        }
        .mapboxgl-popup-close-button {
          font-size: 20px;
          padding: 4px 8px;
          color: #94a3b8;
        }
        .mapboxgl-popup-close-button:hover {
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
}
