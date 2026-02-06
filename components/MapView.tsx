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
      style: 'mapbox://styles/mapbox/dark-v11', // Dark base - luxury foundation
      center: [-122.4194, 37.7749], // Default center, will update via flyTo
      zoom: 10,
    });
    
    // Luxury map styling - barely-there grid texture, technical precision feel
    map.current.on('style.load', () => {
      if (map.current) {
        try {
          // Deep slate background - sophisticated, not pure black
          if (map.current.getLayer('water')) {
            map.current.setPaintProperty('water', 'fill-color', '#0f172a');
          }
          // Minimal road visibility - restraint is luxury
          const roadLayers = ['road-street', 'road-street-low', 'road-primary-secondary', 'road'];
          for (const layerName of roadLayers) {
            if (map.current.getLayer(layerName)) {
              map.current.setPaintProperty(layerName, 'line-opacity', 0.2);
              break;
            }
          }
        } catch (error) {
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
    el.style.backgroundColor = '#fbbf24'; // Warm gold (amber 400) - luxury signal
    el.style.border = '2px solid rgba(255,255,255,0.95)';
    el.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.3), 0 4px 12px rgba(0,0,0,0.6), 0 0 24px rgba(251, 191, 36, 0.2)';
    el.style.cursor = 'pointer';
    el.style.transition = 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)';

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
          'fill-color': '#fbbf24', // Warm gold (amber 400) - luxury signal
          'fill-opacity': 0.15, // Subtle ambient glow
        },
      });

      map.current.addLayer({
        id: 'isochrone-outline',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#fbbf24', // Warm gold border
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });
      
      // Luxury glow effect - dramatic shadows
      map.current.addLayer({
        id: 'isochrone-glow',
        type: 'line',
        source: 'isochrone',
        paint: {
          'line-color': '#fbbf24',
          'line-width': 8,
          'line-opacity': 0.2,
          'line-blur': 4,
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
          const markerOpacity = '1'; // Always full opacity
          
          // Luxury confidence tier colors - BRIGHTER for visibility
          if (clubScore >= 80) {
            markerColor = '#fbbf24'; // Gold - Elite
            markerSize = isSelected ? 22 : 16;
          } else if (clubScore >= 60) {
            markerColor = '#10b981'; // Emerald - Premium
            markerSize = isSelected ? 20 : 14;
          } else if (clubScore >= 40) {
            markerColor = '#94a3b8'; // Brighter slate - Standard (was #64748b)
            markerSize = isSelected ? 18 : 12;
          } else {
            markerColor = '#64748b'; // Brighter slate - Basic (was #475569, was opacity 0.6)
            markerSize = isSelected ? 16 : 10;
          }
          
          // Convert nested structure to simple if needed (for old markers)
          const innerCircle = el.querySelector('.marker-inner') as HTMLElement;
          if (innerCircle) {
            // Remove nested structure - copy styles to parent and remove inner
            el.style.backgroundColor = innerCircle.style.backgroundColor || markerColor;
            el.style.opacity = innerCircle.style.opacity || markerOpacity;
            el.style.border = innerCircle.style.border || (isSelected ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.4)');
            el.style.boxShadow = innerCircle.style.boxShadow || (isSelected 
              ? '0 0 0 3px rgba(251, 191, 36, 0.25), 0 4px 12px rgba(0,0,0,0.6), 0 0 24px rgba(251, 191, 36, 0.15)' 
              : '0 0 0 1px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.6)');
            el.style.display = 'block';
            el.style.alignItems = '';
            el.style.justifyContent = '';
            innerCircle.remove();
          }
          
          // Store state on element for hover handlers
          el.setAttribute('data-original-opacity', markerOpacity);
          el.setAttribute('data-is-selected', isSelected ? 'true' : 'false');
          
          // Update marker appearance
          el.style.width = `${markerSize}px`;
          el.style.height = `${markerSize}px`;
          el.style.backgroundColor = markerColor;
          el.style.opacity = markerOpacity;
          el.style.border = isSelected ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.4)';
          el.style.boxShadow = isSelected 
            ? '0 0 0 3px rgba(251, 191, 36, 0.25), 0 4px 12px rgba(0,0,0,0.6), 0 0 24px rgba(251, 191, 36, 0.15)' 
            : '0 0 0 1px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.6)';
          el.style.zIndex = isSelected ? '1000' : '10';
        }
      } else {
        // Create new marker - flat, minimal circles (Pergamum-style)
        const clubScore = place.clubScore ?? 0;
        let markerColor: string;
        let markerSize: number;
        let markerOpacity = '1';
        
        // Luxury confidence tier colors - BRIGHTER for visibility
        if (clubScore >= 80) {
          markerColor = '#fbbf24'; // Gold - Elite
          markerSize = isSelected ? 22 : 16;
        } else if (clubScore >= 60) {
          markerColor = '#10b981'; // Emerald - Premium
          markerSize = isSelected ? 20 : 14;
        } else if (clubScore >= 40) {
          markerColor = '#94a3b8'; // Brighter slate - Standard (was #64748b)
          markerSize = isSelected ? 18 : 12;
        } else {
          markerColor = '#64748b'; // Brighter slate - Basic (was #475569, was opacity 0.6)
          markerSize = isSelected ? 16 : 10;
          markerOpacity = '1'; // Full opacity - no dimming
        }
        
        // Create marker element - simple single element, no nested structure
        const el = document.createElement('div');
        el.className = 'place-marker';
        el.style.width = `${markerSize}px`;
        el.style.height = `${markerSize}px`;
        el.style.borderRadius = '50%';
        el.style.backgroundColor = markerColor;
        el.style.opacity = markerOpacity;
        el.style.border = isSelected ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.4)';
        el.style.boxShadow = isSelected 
          ? '0 0 0 3px rgba(251, 191, 36, 0.25), 0 4px 12px rgba(0,0,0,0.6), 0 0 24px rgba(251, 191, 36, 0.15)' 
          : '0 0 0 1px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.6)';
        el.style.transition = 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.cursor = 'pointer';
        el.style.pointerEvents = 'auto';
        el.style.position = 'relative';
        el.style.zIndex = isSelected ? '1000' : '10';

        // Store state on element for hover handlers to read (prevents stale closure issues)
        el.setAttribute('data-original-opacity', markerOpacity);
        el.setAttribute('data-is-selected', isSelected ? 'true' : 'false');

        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center', // Center anchor prevents shifting
        })
          .setLngLat([place.location.lng, place.location.lat])
          .addTo(map.current!);

        // Click handler - stop propagation to prevent map interactions
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          onPlaceClickRef.current(place.place_id);
        });
        
        // Hover behavior - NO transform to prevent positioning issues, only visual changes
        el.addEventListener('mouseenter', (e) => {
          e.stopPropagation();
          el.style.opacity = '1';
          el.style.zIndex = '100';
          el.style.border = '3px solid rgba(251, 191, 36, 0.9)';
          el.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.4), 0 4px 20px rgba(0,0,0,0.8), 0 0 40px rgba(251, 191, 36, 0.4)';
        });
        el.addEventListener('mouseleave', (e) => {
          e.stopPropagation();
          const originalOpacity = el.getAttribute('data-original-opacity') || '1';
          const isCurrentlySelected = el.getAttribute('data-is-selected') === 'true';
          el.style.opacity = originalOpacity;
          el.style.zIndex = isCurrentlySelected ? '1000' : '10';
          el.style.border = isCurrentlySelected ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.4)';
          el.style.boxShadow = isCurrentlySelected 
            ? '0 0 0 3px rgba(251, 191, 36, 0.25), 0 4px 12px rgba(0,0,0,0.6), 0 0 24px rgba(251, 191, 36, 0.15)' 
            : '0 0 0 1px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.6)';
        });

        markersRef.current.set(place.place_id, marker);
      }
    });
  }, [places, selectedPlaceId, isLoaded]);

    return (
    <div className="w-full h-full relative bg-luxury-dark">
      <div ref={mapContainer} className="w-full h-full" style={{ opacity: 0.98 }} />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-luxury-dark/95 z-10 backdrop-blur-md">
          <div className="card-luxury p-6 rounded-lg max-w-md mx-4">
            <h3 className="text-base font-light text-label text-secondary mb-2.5">MAP ERROR</h3>
            <p className="text-sm text-tertiary mb-4 font-light">{mapError}</p>
            <p className="text-xs text-label text-tertiary font-light">
              Add your Mapbox token to <code className="bg-[#0f172a] px-1.5 py-0.5 rounded text-secondary">.env.local</code>:
              <br />
              <code className="bg-[#0f172a] px-1.5 py-0.5 rounded text-secondary">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_token</code>
            </p>
          </div>
        </div>
      )}
      <style jsx global>{`
        .mapboxgl-popup-content {
          padding: 16px;
          font-family: 'Inter', system-ui, sans-serif;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 100%);
          color: #f8fafc;
          border: 1px solid rgba(51, 65, 85, 0.3);
          backdrop-filter: blur(12px);
          font-weight: 300;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
        }
        .mapboxgl-popup-close-button {
          font-size: 18px;
          padding: 4px 8px;
          color: #94a3b8;
          transition: opacity 300ms ease;
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
