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
      style: 'mapbox://styles/mapbox/dark-v11', // Dark, desaturated base map
      center: [-122.4194, 37.7749], // Default center, will update via flyTo
      zoom: 10,
    });
    
    // Further dim the base map for intelligence-grade feel
    map.current.on('style.load', () => {
      if (map.current) {
        try {
          // Reduce saturation and contrast of base map layers
          // Check if layers exist before setting properties
          if (map.current.getLayer('water')) {
            map.current.setPaintProperty('water', 'fill-color', '#1a1f2e');
          }
          // Try common road layer names - different styles use different names
          const roadLayers = ['road-street', 'road-street-low', 'road-primary-secondary', 'road'];
          for (const layerName of roadLayers) {
            if (map.current.getLayer(layerName)) {
              map.current.setPaintProperty(layerName, 'line-opacity', 0.3);
              break; // Only set the first one that exists
            }
          }
        } catch (error) {
          // Silently ignore if layers don't exist - different map styles have different layers
          console.debug('Map layer styling skipped:', error);
        }
      }
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

    // Add origin marker - gold/amber accent
    const el = document.createElement('div');
    el.className = 'origin-marker';
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#f59e0b'; // Gold/amber for origin
    el.style.border = '2px solid rgba(255,255,255,0.9)';
    el.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.25), 0 2px 6px rgba(0,0,0,0.5)';
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
          'fill-color': '#f59e0b', // Gold/amber for drive-time polygon
          'fill-opacity': 0.12, // Subtle, premium feel
        },
      });

      map.current.addLayer({
        id: 'isochrone-outline',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#f59e0b', // Gold/amber border
          'line-width': 2.5,
          'line-opacity': 0.7,
        },
      });
      
      // Add subtle glow effect for premium feel
      map.current.addLayer({
        id: 'isochrone-glow',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 6,
          'line-opacity': 0.15,
          'line-blur': 3,
        },
      }, 'isochrone-outline');
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
          let markerOpacity = '1';
          
          if (clubScore >= 4) {
            markerColor = '#14b8a6'; // Muted teal
            markerSize = isSelected ? 18 : 12;
          } else if (clubScore >= 2) {
            markerColor = '#64748b'; // Slate
            markerSize = isSelected ? 16 : 10;
          } else {
            markerColor = '#475569'; // Darker slate
            markerSize = isSelected ? 14 : 8;
            markerOpacity = '0.6';
          }
          
          el.style.width = `${markerSize}px`;
          el.style.height = `${markerSize}px`;
          el.style.backgroundColor = markerColor;
          el.style.opacity = markerOpacity;
          el.style.zIndex = isSelected ? '1000' : '1';
          el.style.border = isSelected ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.2)';
          el.style.boxShadow = isSelected 
            ? '0 0 0 3px rgba(245, 158, 11, 0.2), 0 2px 8px rgba(0,0,0,0.5)' 
            : '0 1px 3px rgba(0,0,0,0.4)';
        }
      } else {
        // Create new marker - flat, minimal circles (Pergamum-style)
        const clubScore = place.clubScore ?? 0;
        let markerColor: string;
        let markerSize: number;
        let markerOpacity = '1';
        
        if (clubScore >= 4) {
          markerColor = '#14b8a6'; // Muted teal - high confidence (primary)
          markerSize = isSelected ? 18 : 12;
        } else if (clubScore >= 2) {
          markerColor = '#64748b'; // Slate - mixed (secondary)
          markerSize = isSelected ? 16 : 10;
        } else {
          markerColor = '#475569'; // Darker slate - uncertain/recreational
          markerSize = isSelected ? 14 : 8;
          markerOpacity = '0.6'; // Slight opacity for secondary markers
        }
        
        const el = document.createElement('div');
        el.className = 'place-marker';
        el.style.width = `${markerSize}px`;
        el.style.height = `${markerSize}px`;
        el.style.borderRadius = '50%';
        el.style.backgroundColor = markerColor;
        el.style.opacity = markerOpacity;
        el.style.border = isSelected ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.2)';
        el.style.boxShadow = isSelected 
          ? '0 0 0 3px rgba(245, 158, 11, 0.2), 0 2px 8px rgba(0,0,0,0.5)' 
          : '0 1px 3px rgba(0,0,0,0.4)';
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.2s ease-out';

        const marker = new mapboxgl.Marker(el)
          .setLngLat([place.location.lng, place.location.lat])
          .addTo(map.current!);

        el.addEventListener('click', () => {
          onPlaceClickRef.current(place.place_id);
        });
        
        // Hover behavior - subtle glow
        el.addEventListener('mouseenter', () => {
          el.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.3), 0 2px 8px rgba(0,0,0,0.5)';
        });
        el.addEventListener('mouseleave', () => {
          el.style.boxShadow = isSelected 
            ? '0 0 0 3px rgba(245, 158, 11, 0.2), 0 2px 8px rgba(0,0,0,0.5)' 
            : '0 1px 3px rgba(0,0,0,0.4)';
        });

        markersRef.current.set(place.place_id, marker);
      }
    });
  }, [places, selectedPlaceId, isLoaded]);

  return (
    <div className="w-full h-full relative bg-[#0e1420]">
      <div ref={mapContainer} className="w-full h-full" style={{ opacity: 0.95 }} />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0e1420]/95 z-10 backdrop-blur-sm">
          <div className="bg-[#111827]/95 p-6 rounded-lg shadow-2xl max-w-md mx-4 border border-[#374151]/40 backdrop-blur-md">
            <h3 className="text-base font-light text-secondary mb-2">Map Error</h3>
            <p className="text-sm text-tertiary mb-4 font-light">{mapError}</p>
            <p className="text-xs text-tertiary font-light">
              Add your Mapbox token to <code className="bg-[#0e1420] px-1.5 py-0.5 rounded text-secondary">.env.local</code>:
              <br />
              <code className="bg-[#0e1420] px-1.5 py-0.5 rounded text-secondary">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token</code>
            </p>
          </div>
        </div>
      )}
      <style jsx global>{`
        .mapboxgl-popup-content {
          padding: 14px;
          font-family: 'Inter', system-ui, sans-serif;
          background-color: rgba(17, 24, 39, 0.95);
          color: #e5e7eb;
          border: 1px solid rgba(107, 114, 128, 0.2);
          backdrop-filter: blur(8px);
          font-weight: 300;
        }
        .mapboxgl-popup-close-button {
          font-size: 18px;
          padding: 4px 8px;
          color: #6b7280;
          font-weight: 300;
        }
        .mapboxgl-popup-close-button:hover {
          color: #9ca3af;
        }
        .mapboxgl-control-container {
          opacity: 0.7;
        }
        .mapboxgl-control-container:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
