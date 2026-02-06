import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces, getPlaceDetails, convertGooglePlace, deduplicatePlaces } from '@/lib/googlePlaces';
import { getDirections, metersToMiles, secondsToMinutes } from '@/lib/mapbox';
import { Place } from '@/lib/googlePlaces';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

// Expanded keywords for better discovery
const SPORT_KEYWORDS: Record<string, string[]> = {
  'volleyball': [
    'volleyball club',
    'volleyball training',
    'volleyball facility',
    'sports complex',
    'athletic club',
    'sports center',
  ],
  'track and field': [
    'track club',
    'track and field',
    'running club',
    'athletics club',
    'track facility',
    'sports complex',
  ],
  'basketball': [
    'basketball club',
    'basketball training',
    'basketball facility',
    'sports complex',
    'athletic club',
  ],
  'softball': [
    'softball club',
    'softball training',
    'softball facility',
    'sports complex',
    'athletic club',
  ],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, sports, driveTimeMinutes, isochroneGeoJSON } = body;

    if (!origin || !origin.lat || !origin.lng) {
      return NextResponse.json(
        { error: 'Missing origin location' },
        { status: 400 }
      );
    }

    if (!sports || !Array.isArray(sports) || sports.length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty sports array' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    // TEMPORARY DEBUG: Verify env var is loaded
    console.log('=== ENV VAR DEBUG ===');
    console.log('GOOGLE_MAPS_API_KEY exists:', !!apiKey);
    console.log('GOOGLE_MAPS_API_KEY length:', apiKey?.length || 0);
    console.log('GOOGLE_MAPS_API_KEY starts with:', apiKey?.substring(0, 10) || 'undefined');
    console.log('GOOGLE_MAPS_API_KEY is placeholder:', apiKey === 'your_google_maps_api_key_here' || apiKey === 'AIzaSyYOUR_REAL_KEY');
    console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('GOOGLE') || k.includes('MAPBOX')));
    console.log('===================');
    
    if (!apiKey || apiKey === 'your_google_maps_api_key_here' || apiKey === 'AIzaSyYOUR_REAL_KEY') {
      return NextResponse.json(
        { 
          error: 'GOOGLE_MAPS_API_KEY not configured. Please add your Google Maps API key to .env.local',
          places: []
        },
        { status: 500 }
      );
    }

    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) {
      return NextResponse.json(
        { error: 'MAPBOX_ACCESS_TOKEN not configured' },
        { status: 500 }
      );
    }

    // Use a larger radius for initial search (conservative estimate)
    // 40 minutes ≈ 40-50km in urban areas, use 50km to be safe
    const radiusMeters = Math.min(driveTimeMinutes * 1000, 50000); // Max 50km

    // Extract polygon from isochrone GeoJSON for filtering
    let isochronePolygon: any = null;
    if (isochroneGeoJSON && isochroneGeoJSON.features && isochroneGeoJSON.features.length > 0) {
      // Find the largest polygon (usually the main isochrone)
      const polygons = isochroneGeoJSON.features.filter(
        (f: any) => f.geometry && f.geometry.type === 'Polygon'
      );
      if (polygons.length > 0) {
        // Sort by area (rough estimate) and take the largest
        isochronePolygon = polygons.reduce((largest: any, current: any) => {
          const largestCoords = largest.geometry.coordinates[0];
          const currentCoords = current.geometry.coordinates[0];
          const largestArea = largestCoords.length;
          const currentArea = currentCoords.length;
          return currentArea > largestArea ? current : largest;
        });
      }
    }

    // Search for each sport with expanded keywords
    const allPlaces: Place[] = [];
    let totalResultsFound = 0;
    let totalResultsAfterPolygonFilter = 0;
    let totalResultsAfterDriveTimeFilter = 0;
    
    for (const sport of sports) {
      const keywords = SPORT_KEYWORDS[sport.toLowerCase()] || [`${sport} club`];
      
      // Search with each keyword
      for (const keyword of keywords) {
        try {
          console.log(`Searching for "${sport}" with keyword "${keyword}"`);
          const results = await searchPlaces(
            keyword,
            { lat: origin.lat, lng: origin.lng },
            radiusMeters,
            apiKey
          );

          totalResultsFound += results.length;
          console.log(`Found ${results.length} results for "${keyword}" (sport: ${sport})`);
          if (results.length > 0) {
            console.log(`First result: ${results[0]?.displayName || results[0]?.name || 'unknown'}`);
          }

          // Convert and filter results
          for (const googlePlace of results) {
            try {
              const place = convertGooglePlace(googlePlace, sport);
              
              // Filter by isochrone polygon if available
              if (isochronePolygon) {
                const placePoint = point([place.location.lng, place.location.lat]);
                const isInside = booleanPointInPolygon(placePoint, isochronePolygon);
                
                if (!isInside) {
                  continue; // Skip places outside the isochrone
                }
                totalResultsAfterPolygonFilter++;
              }
              
              // Calculate drive time and distance
              try {
                const directions = await getDirections(
                  [origin.lng, origin.lat],
                  [place.location.lng, place.location.lat],
                  mapboxToken
                );

                if (directions.routes && directions.routes.length > 0) {
                  const route = directions.routes[0];
                  const driveTime = secondsToMinutes(route.duration);
                  const distance = metersToMiles(route.distance);

                  // Double-check drive time (isochrone should handle this, but verify)
                  if (driveTime <= driveTimeMinutes) {
                    (place as any).driveTime = driveTime;
                    (place as any).distance = distance;
                    allPlaces.push(place);
                    totalResultsAfterDriveTimeFilter++;
                  }
                }
              } catch (dirError) {
                console.error(`Directions error for ${place.place_id}:`, dirError);
                // If we have isochrone filtering, include without drive time
                // Otherwise skip (we need at least one validation)
                if (isochronePolygon) {
                  (place as any).driveTime = null;
                  (place as any).distance = null;
                  allPlaces.push(place);
                }
              }
            } catch (convertError) {
              console.error(`Error converting place:`, convertError);
              // Skip this place
            }
          }
        } catch (keywordError) {
          console.error(`Search error for ${sport} keyword "${keyword}":`, keywordError);
          // Continue with other keywords
        }
      }
    }

    // Deduplicate by place_id
    const uniquePlaces = deduplicatePlaces(allPlaces);

    console.log(`Search summary: Found ${totalResultsFound} total, ${totalResultsAfterPolygonFilter} after polygon filter, ${totalResultsAfterDriveTimeFilter} after drive time filter, ${uniquePlaces.length} unique places`);

    return NextResponse.json({ 
      places: uniquePlaces,
      debug: {
        totalResultsFound,
        totalResultsAfterPolygonFilter,
        totalResultsAfterDriveTimeFilter,
        uniquePlacesCount: uniquePlaces.length,
        hasIsochrone: !!isochronePolygon,
      }
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search places' },
      { status: 500 }
    );
  }
}
