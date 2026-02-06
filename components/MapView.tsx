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
      style: 'mapbox://styles/mapbox/streets-v12',
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
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#3b82f6';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
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
          'fill-color': '#3b82f6',
          'fill-opacity': 0.2,
        },
      });

      map.current.addLayer({
        id: 'isochrone-outline',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
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
        
        // Update marker appearance for selection
        const el = existingMarker.getElement();
        if (el) {
          if (isSelected) {
            el.style.width = '24px';
            el.style.height = '24px';
            el.style.zIndex = '1000';
            el.style.backgroundColor = '#ef4444';
          } else {
            el.style.width = '16px';
            el.style.height = '16px';
            el.style.zIndex = '1';
            el.style.backgroundColor = '#10b981';
          }
        }
      } else {
        // Create new marker
        const el = document.createElement('div');
        el.className = 'place-marker';
        el.style.width = isSelected ? '24px' : '16px';
        el.style.height = isSelected ? '24px' : '16px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = isSelected ? '#ef4444' : '#10b981';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
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
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md mx-4 border border-red-200">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Map Error</h3>
            <p className="text-sm text-gray-700 mb-4">{mapError}</p>
            <p className="text-xs text-gray-500">
              Add your Mapbox token to <code className="bg-gray-100 px-1 rounded">.env.local</code>:
              <br />
              <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token</code>
            </p>
          </div>
        </div>
      )}
      <style jsx global>{`
        .mapboxgl-popup-content {
          padding: 12px;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .mapboxgl-popup-close-button {
          font-size: 20px;
          padding: 4px 8px;
        }
      `}</style>
    </div>
  );
}
