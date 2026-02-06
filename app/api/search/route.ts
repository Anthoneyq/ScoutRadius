import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces, convertGooglePlace, deduplicatePlaces, getClubConfidence, getAgeGroupScores, getPrimaryAgeGroup } from '@/lib/googlePlaces';
import { getDirections, metersToMiles, secondsToMinutes } from '@/lib/mapbox';
import { Place } from '@/lib/googlePlaces';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

// Club-intent keywords (avoid generic terms that trigger restaurants/bars)
const SPORT_KEYWORDS: Record<string, string[]> = {
  'volleyball': [
    'youth volleyball club',
    'junior volleyball club',
    'competitive volleyball club',
    'volleyball training academy',
    'volleyball club',
  ],
  'track and field': [
    'track and field club',
    'youth track club',
    'junior track club',
    'track and field academy',
    'running club',
    'athletics club',
  ],
  'basketball': [
    'youth basketball club',
    'junior basketball club',
    'competitive basketball club',
    'basketball training academy',
    'basketball club',
  ],
  'softball': [
    'youth softball club',
    'junior softball club',
    'competitive softball club',
    'softball training academy',
    'softball club',
  ],
};

// Place types to include (excludes restaurants, bars, retail, etc.)
// Note: If too restrictive, try removing some types or making this optional
const INCLUDED_PLACE_TYPES = [
  'sports_club',
  'school',
  'gym',
  'recreation_center',
];

// Fallback: Try without type restrictions if initial search fails
const FALLBACK_INCLUDED_TYPES: string[] = []; // Empty = no type restriction

// Keywords that indicate non-club venues (to exclude)
const EXCLUDED_KEYWORDS = [
  'bar',
  'restaurant',
  'grill',
  'pub',
  'cantina',
  'brew',
  'tavern',
  'equinox',
  'lifetime',
  'ymca',
  'rec center',
  'community center',
  'fitness center',
  'health club',
];

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
    if (!apiKey || apiKey === 'your_google_maps_api_key_here' || apiKey === 'AIzaSyYOUR_REAL_KEY') {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return NextResponse.json(
        { 
          error: 'GOOGLE_MAPS_API_KEY not configured',
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
    // Mapbox Isochrone API returns GeoJSON with coordinates as [lng, lat] arrays
    let isochronePolygon: any = null;
    if (isochroneGeoJSON && isochroneGeoJSON.features && isochroneGeoJSON.features.length > 0) {
      // Find the largest polygon (usually the main isochrone)
      const polygons = isochroneGeoJSON.features.filter(
        (f: any) => f.geometry && f.geometry.type === 'Polygon'
      );
      if (polygons.length > 0) {
        // Sort by coordinate count (rough estimate of area) and take the largest
        isochronePolygon = polygons.reduce((largest: any, current: any) => {
          const largestCoords = largest.geometry.coordinates[0];
          const currentCoords = current.geometry.coordinates[0];
          const largestArea = largestCoords.length;
          const currentArea = currentCoords.length;
          return currentArea > largestArea ? current : largest;
        });
        
        // Verify polygon coordinate format: Mapbox Isochrone API returns [lng, lat] format
        // This matches GeoJSON standard and Turf.js expectations
        const firstCoord = isochronePolygon.geometry.coordinates[0][0];
        console.log(`Isochrone polygon: ${isochronePolygon.geometry.coordinates[0].length} coordinates, first=[${firstCoord[0]}, ${firstCoord[1]}]`);
      }
    }

    // Search for each sport with expanded keywords
    const allPlaces: Place[] = [];
    const rawPlacesBeforeFiltering: Place[] = []; // Collect raw places for debugging
    let totalResultsFound = 0;
    let totalResultsAfterPolygonFilter = 0;
    let totalResultsAfterDriveTimeFilter = 0;
    
    // Log search parameters for debugging
    console.log(`Search: origin=[${origin.lng}, ${origin.lat}], driveTime=${driveTimeMinutes}min, radius=${radiusMeters}m, sports=[${sports.join(', ')}]`);
    
    for (const sport of sports) {
      const keywords = SPORT_KEYWORDS[sport.toLowerCase()] || [`${sport} club`];
      
      // Search with each keyword
      for (const keyword of keywords) {
        try {
          console.log(`[Search API] Searching for "${keyword}" (sport: ${sport}) with types: ${INCLUDED_PLACE_TYPES.join(', ')}`);
          const results = await searchPlaces(
            keyword,
            { lat: origin.lat, lng: origin.lng },
            radiusMeters,
            apiKey,
            INCLUDED_PLACE_TYPES // Restrict to sports_club, school, gym, recreation_center
          );

          totalResultsFound += results.length;
          console.log(`[Search API] Keyword "${keyword}": ${results.length} raw results from Google Places`);

          // Convert and filter results
          for (const googlePlace of results) {
            try {
              const place = convertGooglePlace(googlePlace, sport);
              
              // Calculate club confidence score and isClub flag
              const clubScore = getClubConfidence(place);
              place.clubScore = clubScore;
              place.isClub = clubScore >= 3;
              
              // Calculate age group scores
              const ageGroups = getAgeGroupScores(place);
              place.ageGroups = ageGroups;
              place.primaryAgeGroup = getPrimaryAgeGroup(ageGroups);
              
              // Filter out obvious non-club venues by name (legacy exclusion filter)
              // Note: This is now redundant with scoring, but kept for backward compatibility
              const placeNameLower = place.name.toLowerCase();
              const isExcluded = EXCLUDED_KEYWORDS.some(keyword => 
                placeNameLower.includes(keyword)
              );
              
              if (isExcluded) {
                console.log(`Excluding "${place.name}" - matches excluded keywords`);
                continue;
              }
              
              // Collect raw place for debugging (after exclusion filter)
              rawPlacesBeforeFiltering.push(place);
              
              // Filter by isochrone polygon if available
              if (isochronePolygon) {
                // CRITICAL: Turf.js booleanPointInPolygon expects [lng, lat] order
                // Mapbox isochrone polygon coordinates are [lng, lat]
                // Google Places location is {lat, lng}, so we convert to [lng, lat]
                const placePoint = point([place.location.lng, place.location.lat]);
                const isInside = booleanPointInPolygon(placePoint, isochronePolygon);
                
                if (!isInside) {
                  continue; // Skip places outside the isochrone polygon
                }
                totalResultsAfterPolygonFilter++;
              }
              
              // Calculate drive time and distance using Mapbox Directions API
              // This provides exact routing data, not just straight-line distance
              try {
                // Mapbox Directions API expects [lng, lat] format
                const directions = await getDirections(
                  [origin.lng, origin.lat], // [lng, lat]
                  [place.location.lng, place.location.lat], // [lng, lat]
                  mapboxToken
                );

                if (directions.routes && directions.routes.length > 0) {
                  const route = directions.routes[0];
                  // route.duration is in seconds, route.distance is in meters
                  const calculatedDriveTimeMinutes = Math.round(route.duration / 60);
                  const distanceMiles = metersToMiles(route.distance);

                  // Verify drive time is within limit (isochrone polygon should already filter this)
                  // Add small buffer (1 minute) to account for routing variations
                  if (calculatedDriveTimeMinutes <= driveTimeMinutes + 1) {
                    place.driveTime = calculatedDriveTimeMinutes;
                    place.distance = distanceMiles;
                    allPlaces.push(place);
                    totalResultsAfterDriveTimeFilter++;
                  } else {
                    // Drive time exceeds limit, skip this place
                    continue;
                  }
                } else {
                  // No route found - skip this place
                  continue;
                }
              } catch (dirError) {
                const errorMessage = dirError instanceof Error ? dirError.message : String(dirError);
                console.error(`Directions API failed for "${place.name}": ${errorMessage}`);
                // If polygon filtering passed, include place without drive time data
                // This handles cases where Directions API fails but place is within polygon
                if (isochronePolygon) {
                  place.driveTime = undefined;
                  place.distance = undefined;
                  allPlaces.push(place);
                } else {
                  // Without polygon filtering, we need directions to validate drive time
                  // Skip this place if directions fail
                  continue;
                }
              }
            } catch (convertError) {
              const errorMessage = convertError instanceof Error ? convertError.message : String(convertError);
              console.error(`Failed to convert place result: ${errorMessage}`);
              // Skip this place and continue with others
            }
          }
        } catch (keywordError) {
          const errorMessage = keywordError instanceof Error ? keywordError.message : String(keywordError);
          console.error(`Search failed for "${sport}" keyword "${keyword}": ${errorMessage}`);
          // Continue with other keywords - one failure shouldn't stop the entire search
        }
      }
    }

    // Deduplicate by place_id
    const uniquePlaces = deduplicatePlaces(allPlaces);

    const uniqueRawPlaces = deduplicatePlaces(rawPlacesBeforeFiltering);
    
    // Log search pipeline results
    console.log(`Search pipeline: raw=${uniqueRawPlaces.length}, afterPolygon=${totalResultsAfterPolygonFilter}, afterDriveTime=${totalResultsAfterDriveTimeFilter}, final=${uniquePlaces.length}`);
    
    // If we found places but filtering removed them all, return raw results for debugging
    // This helps identify if the issue is with filtering logic vs API calls
    if (uniqueRawPlaces.length > 0 && uniquePlaces.length === 0) {
      console.warn(`All ${uniqueRawPlaces.length} places filtered out. Returning first 5 raw places for debugging.`);
      if (isochronePolygon) {
        const polygonCoords = isochronePolygon.geometry.coordinates[0];
        console.warn(`Polygon first coord: [${polygonCoords[0][0]}, ${polygonCoords[0][1]}], origin: [${origin.lng}, ${origin.lat}]`);
      }
      return NextResponse.json({ 
        places: uniqueRawPlaces.slice(0, 5), 
        debug: { 
          bypassedFiltering: true,
          message: 'Filtering removed all places - returning raw results for debugging',
          rawPlacesCount: uniqueRawPlaces.length,
          totalResultsFound,
          totalResultsAfterPolygonFilter,
          totalResultsAfterDriveTimeFilter,
        } 
      });
    }
    
    // If no places found at all, try fallback search without type restrictions
    if (uniquePlaces.length === 0 && uniqueRawPlaces.length === 0 && totalResultsFound === 0) {
      console.warn(`[Search API] No places found with type restrictions. Trying fallback search without type restrictions...`);
      
      // Retry search without type restrictions for first sport only (to avoid too many API calls)
      const firstSport = sports[0];
      const keywords = SPORT_KEYWORDS[firstSport.toLowerCase()] || [`${firstSport} club`];
      const firstKeyword = keywords[0];
      
      try {
        const fallbackResults = await searchPlaces(
          firstKeyword,
          { lat: origin.lat, lng: origin.lng },
          radiusMeters,
          apiKey,
          undefined // No type restrictions
        );
        
        console.log(`[Search API] Fallback search (no type restrictions): ${fallbackResults.length} results`);
        
        if (fallbackResults.length > 0) {
          console.warn(`[Search API] Type restrictions were too strict. Consider relaxing INCLUDED_PLACE_TYPES.`);
          // Process fallback results
          for (const googlePlace of fallbackResults.slice(0, 10)) { // Limit to first 10
            try {
              const place = convertGooglePlace(googlePlace, firstSport);
              const clubScore = getClubConfidence(place);
              place.clubScore = clubScore;
              place.isClub = clubScore >= 3;
              const ageGroups = getAgeGroupScores(place);
              place.ageGroups = ageGroups;
              place.primaryAgeGroup = getPrimaryAgeGroup(ageGroups);
              
              // Still apply exclusion filter
              const placeNameLower = place.name.toLowerCase();
              const isExcluded = EXCLUDED_KEYWORDS.some(keyword => 
                placeNameLower.includes(keyword)
              );
              
              if (!isExcluded) {
                rawPlacesBeforeFiltering.push(place);
              }
            } catch (err) {
              console.error(`Error processing fallback place:`, err);
            }
          }
        }
      } catch (fallbackError) {
        console.error(`[Search API] Fallback search also failed:`, fallbackError);
      }
      
      console.warn(`[Search API] No places found for search: ${sports.join(', ')} near [${origin.lat}, ${origin.lng}]`);
      console.warn(`[Search API] Debug info: totalResultsFound=${totalResultsFound}, radiusMeters=${radiusMeters}, keywords used=${sports.flatMap(s => SPORT_KEYWORDS[s.toLowerCase()] || [`${s} club`]).join(', ')}`);
    }

    return NextResponse.json({ 
      places: uniquePlaces,
      debug: {
        totalResultsFound,
        rawPlacesCount: uniqueRawPlaces.length,
        totalResultsAfterPolygonFilter,
        totalResultsAfterDriveTimeFilter,
        uniquePlacesCount: uniquePlaces.length,
        hasIsochrone: !!isochronePolygon,
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Search API failed: ${errorMessage}`);
    return NextResponse.json(
      { 
        error: 'Search failed',
        places: [],
        debug: {
          error: errorMessage,
        }
      },
      { status: 500 }
    );
  }
}
