import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces, convertGooglePlace, deduplicatePlaces, getClubConfidence, getAgeGroupScores, getPrimaryAgeGroup } from '@/lib/googlePlaces';
import { getDirections, metersToMiles, secondsToMinutes } from '@/lib/mapbox';
import { Place } from '@/lib/googlePlaces';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { queryOSMSportsFacilities, matchPlaceToOSM } from '@/lib/osmLookup';
import { classifyPlaceWithAI } from '@/lib/aiClassifier';
import { isRetailSportStore } from '@/lib/retailExclusions';
import { canUseAI } from '@/lib/paywall';
import { auth } from '@clerk/nextjs/server';
import { getUserUsage, incrementAIUsage, incrementSearchUsage } from '@/lib/db';

// Mark as dynamic since we use auth()
export const dynamic = 'force-dynamic';

// FIXED: Expanded queries - rotate multiple queries per sport
// Google Places (New) is stricter, need broader search terms
// MVP: Supported sports (binary: Yes/No/Unknown)
const SPORT_KEYWORDS: Record<string, string[]> = {
  'volleyball': [
    'volleyball club',
    'volleyball academy',
    'youth volleyball',
    'club volleyball',
    'travel volleyball',
    'volleyball training',
    'competitive volleyball',
  ],
  'soccer': [
    'soccer club',
    'youth soccer',
    'soccer academy',
    'club soccer',
    'travel soccer',
    'soccer training',
    'competitive soccer',
    'football club', // UK/European term
  ],
  'baseball': [
    'baseball club',
    'youth baseball',
    'baseball academy',
    'club baseball',
    'travel baseball',
    'baseball training',
    'competitive baseball',
  ],
  'basketball': [
    'basketball club',
    'youth basketball',
    'basketball academy',
    'club basketball',
    'basketball training',
    'competitive basketball',
  ],
  'football': [
    'football club',
    'youth football',
    'football academy',
    'club football',
    'travel football',
    'football training',
    'competitive football',
  ],
  'track and field': [
    'track and field club',
    'track club',
    'youth track club',
    'running club',
    'athletics club',
    'track and field academy',
  ],
  'cross country': [
    'cross country team',
    'cross country club',
    'cross country running',
    'youth cross country',
    'cross country training',
    'running club',
    'cross country program',
  ],
};

// REMOVED: includedTypes completely
// Google Places (New) has inconsistent type taxonomy
// Most clubs are NOT labeled sports_club
// Volleyball gyms are often gym, point_of_interest, or untyped
// We score + rank client-side instead of hard-filtering

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

/**
 * MVP: STRICT FILTERING LOGIC (Authoritative)
 * Entity Type filters are HARD GATES
 * - School filters exclude all clubs
 * - Club filter excludes all schools
 * - Sport filters apply after entity type filtering (strict, requires 100% confidence)
 */
function filterResultsStrict(
  entity: Place,
  filters: {
    schoolTypes?: string[]; // MVP: Can include 'club', 'public', 'private', or school levels
    sports?: string[];
  }
): boolean {
  // MVP: Entity type must be explicitly set (no ambiguous results)
  if (!entity.entityType) {
    return false; // Exclude entities without explicit type
  }
  
  // MVP RULE 1: Club filter excludes schools
  if (filters.schoolTypes && filters.schoolTypes.includes('club')) {
    // If filtering for clubs, exclude all schools
    if (entity.entityType === 'Public School' || entity.entityType === 'Private School') {
      return false;
    }
    
    // Must be a club
    if (entity.entityType !== 'Club') {
      return false;
    }
    
    // Sport filter applies to clubs too (if specified)
    if (filters.sports && filters.sports.length > 0) {
      const selectedSport = filters.sports[0].toLowerCase();
      if (!entity.sports || !entity.sports.includes(selectedSport)) return false;
      const confidence = entity.sportsConfidence?.[selectedSport];
      // Accept 70%+ confidence instead of requiring 100% (more forgiving)
      if (confidence === undefined || confidence < 0.7) return false;
    }
    
    return true;
  }
  
  // MVP RULE 2: School filters exclude clubs
  if (filters.schoolTypes && filters.schoolTypes.length > 0) {
    // If filtering for schools, exclude all clubs
    if (entity.entityType === 'Club') {
      return false;
    }
    
    // Must be a school entity
    if (entity.entityType !== 'Public School' && entity.entityType !== 'Private School') {
      return false;
    }
    
    // Check specific school type filters
    const hasPublicFilter = filters.schoolTypes.includes('public');
    const hasPrivateFilter = filters.schoolTypes.includes('private');
    
    if (hasPublicFilter && entity.entityType !== 'Public School') return false;
    if (hasPrivateFilter && entity.entityType !== 'Private School') return false;
    
    // If only public/private filters (no school level filters), allow through
    const hasOnlyEntityFilters = (hasPublicFilter || hasPrivateFilter) && 
      !filters.schoolTypes.some(id => ['elementary', 'middle', 'juniorHigh', 'highSchool'].includes(id));
    
    if (hasOnlyEntityFilters) {
      // Just public/private filter, no school level filter
      // CONDITIONAL SPORT FILTER (relaxed) - applies after entity type filter
      if (filters.sports && filters.sports.length > 0) {
        const selectedSport = filters.sports[0].toLowerCase();
        if (!entity.sports || entity.sports.length === 0) return false;
        const hasSport = entity.sports.some(s => s.toLowerCase() === selectedSport);
        if (!hasSport) return false;
        const confidence = entity.sportsConfidence?.[selectedSport];
        // Accept 70%+ confidence instead of requiring 100% (more forgiving)
        if (confidence === undefined || confidence < 0.7) return false;
      }
      return true;
    }
    
    // Check school level filters (elementary, middle, etc.)
    const schoolLevelFilters = filters.schoolTypes.filter(id => 
      ['elementary', 'middle', 'juniorHigh', 'highSchool'].includes(id)
    );
    
    if (schoolLevelFilters.length > 0) {
      if (!entity.schoolTypes || entity.schoolTypes.length === 0) return false;
      const matchesLevel = entity.schoolTypes.some(type => schoolLevelFilters.includes(type));
      if (!matchesLevel) return false;
    }
    
    // CONDITIONAL SPORT FILTER (relaxed) - applies after entity type filter
    if (filters.sports && filters.sports.length > 0) {
      const selectedSport = filters.sports[0].toLowerCase();
      if (!entity.sports || entity.sports.length === 0) return false;
      const hasSport = entity.sports.some(s => s.toLowerCase() === selectedSport);
      if (!hasSport) return false;
      const confidence = entity.sportsConfidence?.[selectedSport];
      // Accept 70%+ confidence instead of requiring 100% (more forgiving)
      if (confidence === undefined || confidence < 0.7) return false;
    }
    
    return true;
  }
  
  // If no entity type filter, allow through (sport filters may still apply)
  // Sport filter (if specified) still applies
  if (filters.sports && filters.sports.length > 0) {
    const selectedSport = filters.sports[0].toLowerCase();
    if (!entity.sports || !entity.sports.includes(selectedSport)) return false;
    const confidence = entity.sportsConfidence?.[selectedSport];
    // Accept 70%+ confidence instead of requiring 100% (more forgiving)
    if (confidence === undefined || confidence < 0.7) return false;
  }
  
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Get user ID from Clerk auth (may fail if Clerk not configured)
    let userId: string | null = null;
    let userUsage = null;
    
    try {
      const authResult = await auth();
      userId = authResult.userId || null;
      
      // Fetch user usage from database (or null if not authenticated)
      if (userId) {
        try {
          userUsage = await getUserUsage(userId);
        } catch (dbError) {
          console.error('[Search] Error fetching user usage (non-blocking):', dbError);
          // Continue without usage tracking
        }
        
        // Increment search usage if authenticated
        try {
          await incrementSearchUsage(userId);
        } catch (usageError) {
          console.error('[Search] Error incrementing search usage (non-blocking):', usageError);
          // Continue without usage tracking
        }
      }
    } catch (authError) {
      // Clerk not configured or auth failed - continue as anonymous user
      console.debug('[Search] Auth not available (continuing as anonymous):', authError);
    }
    
    // Main search logic
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('[Search API] Invalid JSON in request body:', jsonError);
      return NextResponse.json(
        { 
          error: 'Invalid request format. Expected JSON.',
          places: []
        },
        { status: 400 }
      );
    }
    
    const { origin, sports, driveTimeMinutes, isochroneGeoJSON, schoolTypes = [] } = body;

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
    let retailExcludedCount = 0; // Track retail store exclusions
    
    // Log search parameters for debugging
    console.log(`Search: origin=[${origin.lng}, ${origin.lat}], driveTime=${driveTimeMinutes}min, radius=${radiusMeters}m, sports=[${sports.join(', ')}]`);
    
    // Fetch OSM sports facilities once for the entire search area
    // This is done upfront to avoid repeated API calls
    let osmFacilities: Awaited<ReturnType<typeof queryOSMSportsFacilities>> = [];
    try {
      console.log(`[OSM] Querying sports facilities near [${origin.lat}, ${origin.lng}]`);
      osmFacilities = await queryOSMSportsFacilities(origin.lat, origin.lng, radiusMeters);
      console.log(`[OSM] Found ${osmFacilities.length} sports facilities`);
    } catch (error) {
      console.debug(`[OSM] Failed to fetch facilities, continuing without OSM signal:`, error);
    }
    
    for (const sport of sports) {
      const keywords = SPORT_KEYWORDS[sport.toLowerCase()] || [`${sport} club`];
      
      // Search with each keyword (aggregate before dedupe)
      for (const keyword of keywords) {
        try {
          console.log(`[Search API] Searching for "${keyword}" (sport: ${sport})`);
          const results = await searchPlaces(
            keyword,
            { lat: origin.lat, lng: origin.lng },
            radiusMeters,
            apiKey,
            undefined // NO type restrictions - Google Places (New) has inconsistent taxonomy
          );

          totalResultsFound += results.length;
          console.log(`[Search API] Keyword "${keyword}": ${results.length} raw results from Google Places`);
          
          // TEMP DEBUG: If zero results, log request payload
          if (results.length === 0) {
            console.warn(`[Search API] ZERO RESULTS FROM GOOGLE for "${keyword}"`);
          }

          // Convert and filter results
          for (const googlePlace of results) {
            try {
              const place = convertGooglePlace(googlePlace, sport);
              
              // Detect if this is a school (even if found through sports search)
              const placeName = (place.name || '').toLowerCase();
              const placeTypes = googlePlace.types || [];
              const isSchool = 
                placeTypes.some((type: string) => 
                  type.includes('school') || 
                  type.includes('educational')
                ) ||
                placeName.includes('school') ||
                placeName.includes('academy') ||
                placeName.includes('preparatory') ||
                placeName.includes('high school') ||
                placeName.includes('middle school') ||
                placeName.includes('elementary');
              
              if (isSchool) {
                place.isSchool = true;
                
                // Detect school types from name/types
                let detectedSchoolTypes: string[] = [];
                
                // Check for private/public indicators
                if (placeName.includes('private') || placeTypes.some(t => t.includes('private'))) {
                  detectedSchoolTypes.push('private');
                }
                if (placeName.includes('public') || placeTypes.some(t => t.includes('public'))) {
                  detectedSchoolTypes.push('public');
                }
                // If no explicit private/public indicator, infer from context
                // Most schools without "private" in name are public schools
                if (detectedSchoolTypes.length === 0) {
                  // Check Google Places types for school indicators
                  const hasSchoolType = placeTypes.some(t => 
                    t.includes('school') || 
                    t.includes('educational')
                  );
                  if (hasSchoolType) {
                    // Default to public if no explicit private indicator
                    detectedSchoolTypes.push('public');
                  }
                }
                
                // Add school level types
                if (placeName.includes('elementary') || placeName.includes('primary') || placeName.includes('grade school')) {
                  detectedSchoolTypes.push('elementary');
                }
                if (placeName.includes('middle school') || placeName.includes('intermediate')) {
                  detectedSchoolTypes.push('middle');
                }
                if (placeName.includes('junior high')) {
                  detectedSchoolTypes.push('juniorHigh');
                }
                if (placeName.includes('high school') || placeName.includes('secondary')) {
                  detectedSchoolTypes.push('highSchool');
                }
                
                place.schoolTypes = detectedSchoolTypes.length > 0 ? detectedSchoolTypes : ['highSchool']; // Default to high school if unclear
                
                // MVP: Assign explicit entityType (hard-coded, not inferred)
                // Determine if Public School or Private School
                if (detectedSchoolTypes.includes('private')) {
                  place.entityType = 'Private School';
                } else if (detectedSchoolTypes.includes('public')) {
                  place.entityType = 'Public School';
                } else {
                  // Default to Public School if unclear (most schools are public)
                  place.entityType = 'Public School';
                }
                
                // STRICT SPORTS DETECTION FOR SCHOOLS
                // Only set confidence to 1.0 if sport is explicitly confirmed
                // For now, if school was found via sport search AND name contains sport, set to 1.0
                // Otherwise, set to 0.0 (will be filtered out if sport filter is active)
                if (sport) {
                  const sportLower = sport.toLowerCase();
                  const nameContainsSport = placeName.includes(sportLower);
                  
                  // Initialize sports array if needed
                  if (!place.sports) {
                    place.sports = [];
                  }
                  if (!place.sportsConfidence) {
                    place.sportsConfidence = {};
                  }
                  
                  // Only set to 1.0 if explicitly confirmed (name contains sport)
                  // This is strict - no inference, no guessing
                  if (nameContainsSport) {
                    if (!place.sports.includes(sportLower)) {
                      place.sports.push(sportLower);
                    }
                    place.sportsConfidence[sportLower] = 1.0;
                  } else {
                    // School might have sport, but we can't confirm with 100% certainty
                    // Set confidence to 0.0 so it won't pass strict filter
                    if (!place.sports.includes(sportLower)) {
                      place.sports.push(sportLower);
                    }
                    place.sportsConfidence[sportLower] = 0.0;
                  }
                }
              }
              
              // HARD EXCLUSION: Retail sporting goods stores
              // These are not ambiguous - they should never appear as clubs
              // Check before any scoring or processing
              if (isRetailSportStore({
                name: place.name,
                displayName: googlePlace.displayName,
                website: place.website,
              })) {
                retailExcludedCount++;
                console.log(`[Retail exclusion] Excluding "${place.name}" - retail sporting goods store`);
                continue; // Hard stop - do not include
              }
              
              // External intelligence signal 1: OSM validation
              // Check if place matches an OSM sports facility (within 200m)
              if (osmFacilities.length > 0) {
                place.osmConfirmed = matchPlaceToOSM(
                  place.location.lat,
                  place.location.lng,
                  osmFacilities,
                  200 // 200 meter threshold
                );
              }
              
              // Calculate initial club confidence score (before AI)
              const initialScore = getClubConfidence(place);
              place.clubScore = initialScore;
              
              // External intelligence signal 2: AI classification (only for ambiguous cases)
              // Run AI only if:
              // - Score is between 40-70 (ambiguous)
              // - OR OSM did NOT confirm
              // - AND place is in top 30 results (limit to control cost)
              const shouldRunAI = 
                (initialScore >= 40 && initialScore <= 70) || 
                (!place.osmConfirmed && initialScore >= 20);
              
              // Check paywall before running AI
              const canUseAIFeature = canUseAI(userUsage);
              
              if (shouldRunAI && rawPlacesBeforeFiltering.length < 30 && canUseAIFeature) {
                try {
                  const aiResult = await classifyPlaceWithAI({
                    name: place.name,
                    website: place.website,
                    reviews: [], // Reviews not available in current data model
                  });
                  
                  if (aiResult) {
                    place.aiClassification = {
                      label: aiResult.classification,
                      confidence: aiResult.confidence,
                    };
                    
                    // Recalculate score with AI signal
                    place.clubScore = getClubConfidence(place);
                    
                    // Increment usage counter in database
                    if (userId) {
                      try {
                        await incrementAIUsage(userId);
                      } catch (error) {
                        console.error('[Search] Error incrementing AI usage:', error);
                      }
                    }
                  }
                } catch (aiError) {
                  // Silently fail - AI is optional
                  console.debug(`[AI] Classification failed for "${place.name}":`, aiError);
                }
              } else if (shouldRunAI && !canUseAIFeature) {
                // Log that AI was skipped due to paywall
                console.debug(`[AI] Skipped classification for "${place.name}" - usage limit reached`);
                // Add flag to indicate AI was skipped (for UX feedback)
                if (!place.confidenceSignals) {
                  place.confidenceSignals = [];
                }
                if (!place.confidenceSignals.includes('ai_skipped_paywall')) {
                  place.confidenceSignals.push('ai_skipped_paywall');
                }
              }
              
              // Set isClub flag based on final score
              place.isClub = (place.clubScore ?? 0) >= 3;
              
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

    // Search for schools if school types are selected
    if (schoolTypes && schoolTypes.length > 0) {
      // Map school types to search keywords
      const schoolTypeKeywords: Record<string, string[]> = {
        'private': ['private school', 'private academy', 'private high school', 'private elementary'],
        'public': ['public school', 'public high school', 'public middle school', 'public elementary'],
        'elementary': ['elementary school', 'primary school', 'grade school'],
        'middle': ['middle school', 'intermediate school'],
        'juniorHigh': ['junior high school', 'junior high'],
        'highSchool': ['high school', 'secondary school'],
      };
      
      // Collect all keywords for selected school types
      const schoolKeywords: string[] = [];
      schoolTypes.forEach((type: string) => {
        const keywords = schoolTypeKeywords[type] || [];
        schoolKeywords.push(...keywords);
      });
      
      // Remove duplicates
      const uniqueKeywords = [...new Set(schoolKeywords)];
      
      for (const keyword of uniqueKeywords) {
        try {
          console.log(`[Search API] Searching for "${keyword}" (school types: ${schoolTypes.join(', ')})`);
          const results = await searchPlaces(
            keyword,
            { lat: origin.lat, lng: origin.lng },
            radiusMeters,
            apiKey,
            undefined
          );

          totalResultsFound += results.length;
          console.log(`[Search API] School keyword "${keyword}": ${results.length} raw results from Google Places`);
          
          // Process school results
          for (const googlePlace of results) {
            try {
              // Check if place is a school by types or name
              const placeName = (googlePlace.displayName?.text || '').toLowerCase();
              const placeTypes = googlePlace.types || [];
              const isSchool = 
                placeTypes.some((type: string) => 
                  type.includes('school') || 
                  type.includes('educational')
                ) ||
                placeName.includes('school') ||
                placeName.includes('academy') ||
                placeName.includes('preparatory');
              
              if (!isSchool) continue; // Skip non-schools
              
              // Detect school type from name/types
              let detectedSchoolTypes: string[] = [];
              if (placeName.includes('private') || placeTypes.some(t => t.includes('private'))) {
                detectedSchoolTypes.push('private');
              }
              if (placeName.includes('public') || placeTypes.some(t => t.includes('public'))) {
                detectedSchoolTypes.push('public');
              }
              if (placeName.includes('elementary') || placeName.includes('primary') || placeName.includes('grade school')) {
                detectedSchoolTypes.push('elementary');
              }
              if (placeName.includes('middle school') || placeName.includes('intermediate')) {
                detectedSchoolTypes.push('middle');
              }
              if (placeName.includes('junior high')) {
                detectedSchoolTypes.push('juniorHigh');
              }
              if (placeName.includes('high school') || placeName.includes('secondary')) {
                detectedSchoolTypes.push('highSchool');
              }
              
              // Filter by selected school types - must match at least one
              if (detectedSchoolTypes.length > 0) {
                const matchesSelectedType = detectedSchoolTypes.some(detected => schoolTypes.includes(detected));
                if (!matchesSelectedType) continue; // Skip if doesn't match any selected type
              } else {
                // If we can't detect type, include it if searching for generic school terms
                // This handles cases where school type isn't clear from name
                if (!schoolKeywords.some(k => placeName.includes(k.split(' ')[0]))) {
                  continue; // Skip if name doesn't match any keyword
                }
              }
              
              // Use first sport or "school" as sport label
              const sportLabel = sports.length > 0 ? sports[0] : 'school';
              const place = convertGooglePlace(googlePlace, sportLabel);
              
              // Mark as school and store detected types
              place.isSchool = true;
              place.schoolTypes = detectedSchoolTypes.length > 0 ? detectedSchoolTypes : ['unknown'];
              
              // MVP: Assign explicit entityType (hard-coded, not inferred)
              if (detectedSchoolTypes.includes('private')) {
                place.entityType = 'Private School';
              } else if (detectedSchoolTypes.includes('public')) {
                place.entityType = 'Public School';
              } else {
                // Default to Public School if unclear (most schools are public)
                place.entityType = 'Public School';
              }
              
              // STRICT SPORTS DETECTION FOR SCHOOLS
              // Only set confidence to 1.0 if sport is explicitly confirmed
              // For schools found via school search, we don't have sport context
              // So set confidence to 0.0 (will be filtered out if sport filter is active)
              if (sports && sports.length > 0) {
                if (!place.sports) {
                  place.sports = [];
                }
                if (!place.sportsConfidence) {
                  place.sportsConfidence = {};
                }
                
                // Check if school name contains any of the selected sports
                const placeNameLower = place.name.toLowerCase();
                for (const sport of sports) {
                  const sportLower = sport.toLowerCase();
                  const nameContainsSport = placeNameLower.includes(sportLower);
                  
                  if (!place.sports.includes(sportLower)) {
                    place.sports.push(sportLower);
                  }
                  
                  // Only set to 1.0 if explicitly confirmed (name contains sport)
                  place.sportsConfidence[sportLower] = nameContainsSport ? 1.0 : 0.0;
                }
              }
              
              // HARD EXCLUSION: Retail sporting goods stores
              if (isRetailSportStore({
                name: place.name,
                displayName: googlePlace.displayName,
                website: place.website,
              })) {
                retailExcludedCount++;
                continue;
              }
              
              // Calculate club confidence (schools get higher base score)
              const initialScore = getClubConfidence(place);
              place.clubScore = initialScore + 20; // Boost for schools
              place.isClub = true; // Schools are always considered clubs
              
              // Age groups - schools typically serve high school age
              const ageGroups = getAgeGroupScores(place);
              ageGroups.highSchool += 5; // Boost high school score for schools
              place.ageGroups = ageGroups;
              place.primaryAgeGroup = getPrimaryAgeGroup(ageGroups);
              
              // Filter by isochrone polygon if available
              if (isochronePolygon) {
                const placePoint = point([place.location.lng, place.location.lat]);
                const isInside = booleanPointInPolygon(placePoint, isochronePolygon);
                if (!isInside) continue;
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
                  const calculatedDriveTimeMinutes = Math.round(route.duration / 60);
                  const distanceMiles = metersToMiles(route.distance);

                  if (calculatedDriveTimeMinutes <= driveTimeMinutes + 1) {
                    place.driveTime = calculatedDriveTimeMinutes;
                    place.distance = distanceMiles;
                    allPlaces.push(place);
                    totalResultsAfterDriveTimeFilter++;
                  }
                }
              } catch (dirError) {
                if (isochronePolygon) {
                  place.driveTime = undefined;
                  place.distance = undefined;
                  allPlaces.push(place);
                }
              }
            } catch (convertError) {
              console.error(`Failed to convert school result: ${convertError}`);
            }
          }
        } catch (keywordError) {
          console.error(`School search failed for "${keyword}": ${keywordError}`);
        }
      }
    }

    // HARD SAFETY FALLBACK: If no results, try generic sport + gym query
    if (totalResultsFound === 0 && sports.length > 0) {
      console.warn(`[Search API] Primary queries returned 0 results — running fallback`);
      const firstSport = sports[0];
      const fallbackQuery = `${firstSport} gym`;
      
      try {
        const fallbackResults = await searchPlaces(
          fallbackQuery,
          { lat: origin.lat, lng: origin.lng },
          radiusMeters,
          apiKey,
          undefined // No type restrictions
        );
        
        console.log(`[Search API] Fallback query "${fallbackQuery}": ${fallbackResults.length} results`);
        totalResultsFound += fallbackResults.length;
        
        // Process fallback results
        for (const googlePlace of fallbackResults) {
          try {
            const place = convertGooglePlace(googlePlace, firstSport);
            
            // MVP: Detect schools in fallback results and assign entityType
            const placeName = (place.name || '').toLowerCase();
            const placeTypes = googlePlace.types || [];
            const isSchool = 
              placeTypes.some((type: string) => 
                type.includes('school') || 
                type.includes('educational')
              ) ||
              placeName.includes('school') ||
              placeName.includes('academy') ||
              placeName.includes('preparatory') ||
              placeName.includes('high school') ||
              placeName.includes('middle school') ||
              placeName.includes('elementary');
            
            if (isSchool) {
              place.isSchool = true;
              let detectedSchoolTypes: string[] = [];
              if (placeName.includes('private') || placeTypes.some(t => t.includes('private'))) {
                detectedSchoolTypes.push('private');
              }
              if (placeName.includes('public') || placeTypes.some(t => t.includes('public'))) {
                detectedSchoolTypes.push('public');
              }
              if (detectedSchoolTypes.length === 0) {
                const hasSchoolType = placeTypes.some(t => 
                  t.includes('school') || 
                  t.includes('educational')
                );
                if (hasSchoolType) {
                  detectedSchoolTypes.push('public');
                }
              }
              place.schoolTypes = detectedSchoolTypes.length > 0 ? detectedSchoolTypes : ['highSchool'];
              
              // MVP: Assign explicit entityType
              if (detectedSchoolTypes.includes('private')) {
                place.entityType = 'Private School';
              } else {
                place.entityType = 'Public School';
              }
            } else {
              // Not a school, assign as Club
              place.entityType = 'Club';
            }
            
            // HARD EXCLUSION: Retail sporting goods stores (also in fallback)
            if (isRetailSportStore({
              name: place.name,
              displayName: googlePlace.displayName,
              website: place.website,
            })) {
              retailExcludedCount++;
              console.log(`[Retail exclusion] Excluding fallback "${place.name}" - retail sporting goods store`);
              continue; // Hard stop - do not include
            }
            
            // External intelligence signal 1: OSM validation
            if (osmFacilities.length > 0) {
              place.osmConfirmed = matchPlaceToOSM(
                place.location.lat,
                place.location.lng,
                osmFacilities,
                200
              );
            }
            
            // Calculate initial club confidence score (before AI)
            const initialScore = getClubConfidence(place);
            place.clubScore = initialScore;
            
            // External intelligence signal 2: AI classification (only for ambiguous cases)
            const shouldRunAI = 
              (initialScore >= 40 && initialScore <= 70) || 
              (!place.osmConfirmed && initialScore >= 20);
            
            // Check paywall before running AI
            const canUseAIFeature = canUseAI(userUsage);
            
            if (shouldRunAI && rawPlacesBeforeFiltering.length < 30 && canUseAIFeature) {
              try {
                const aiResult = await classifyPlaceWithAI({
                  name: place.name,
                  website: place.website,
                  reviews: [],
                });
                
                if (aiResult) {
                  place.aiClassification = {
                    label: aiResult.classification,
                    confidence: aiResult.confidence,
                  };
                  place.clubScore = getClubConfidence(place);
                }
              } catch (aiError) {
                console.debug(`[AI] Classification failed for "${place.name}":`, aiError);
              }
            } else if (shouldRunAI && !canUseAIFeature) {
              // Log that AI was skipped due to paywall
              console.debug(`[AI] Skipped classification for "${place.name}" - usage limit reached`);
              // Add flag to indicate AI was skipped (for UX feedback)
              if (!place.confidenceSignals) {
                place.confidenceSignals = [];
              }
              if (!place.confidenceSignals.includes('ai_skipped_paywall')) {
                place.confidenceSignals.push('ai_skipped_paywall');
              }
            }
            
            place.isClub = (place.clubScore ?? 0) >= 3;
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
              // Also add to allPlaces for processing
              allPlaces.push(place);
            }
          } catch (err) {
            console.error(`Error processing fallback place:`, err);
          }
        }
      } catch (fallbackError) {
        console.error(`[Search API] Fallback search failed:`, fallbackError);
      }
    }

    // Deduplicate by place_id
    const uniquePlaces = deduplicatePlaces(allPlaces);

    const uniqueRawPlaces = deduplicatePlaces(rawPlacesBeforeFiltering);
    
    // MVP: APPLY STRICT FILTERING LOGIC (before final return)
    // Entity type filters are HARD GATES
    // School filters exclude clubs, Club filter excludes schools
    // Sport filter requires 100% confidence
    const filteredPlaces = uniquePlaces.filter(place => {
      // Ensure entityType is set (should be set during conversion, but double-check)
      if (!place.entityType) {
        // Fallback: assign based on isSchool
        if (place.isSchool) {
          place.entityType = place.schoolTypes?.includes('private') ? 'Private School' : 'Public School';
        } else {
          place.entityType = 'Club';
        }
      }
      
      return filterResultsStrict(place, {
        schoolTypes: schoolTypes.length > 0 ? schoolTypes : undefined,
        sports: sports.length > 0 ? sports : undefined,
        // Note: entityType filter not yet implemented in UI, but filter function supports it
      });
    });
    
    console.log(`[Strict Filter] Before: ${uniquePlaces.length}, After: ${filteredPlaces.length}, School types: ${schoolTypes.join(', ') || 'none'}, Sports: ${sports.join(', ') || 'none'}`);
    
    // Log search pipeline results
    console.log(`Search pipeline: raw=${uniqueRawPlaces.length}, afterPolygon=${totalResultsAfterPolygonFilter}, afterDriveTime=${totalResultsAfterDriveTimeFilter}, retail excluded=${retailExcludedCount}, afterStrictFilter=${filteredPlaces.length}, final=${filteredPlaces.length}`);
    
    // Calculate external intelligence signal counts (for logging and response)
    const osmConfirmedCount = filteredPlaces.filter(p => p.osmConfirmed).length;
    const aiClassifiedCount = filteredPlaces.filter(p => p.aiClassification).length;
    const avgConfidenceScore = filteredPlaces.length > 0
      ? filteredPlaces.reduce((sum, p) => sum + (p.clubScore ?? 0), 0) / filteredPlaces.length
      : 0;
    
    console.log(`External intelligence: OSM confirmed=${osmConfirmedCount}, AI classified=${aiClassifiedCount}, retail excluded=${retailExcludedCount}, avg confidence=${avgConfidenceScore.toFixed(1)}`);
    
    // If we found places but filtering removed them all, return empty with helpful message
    if (uniqueRawPlaces.length > 0 && filteredPlaces.length === 0) {
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
      console.warn(`[Search API] API Key check: ${apiKey ? `Present (${apiKey.substring(0, 10)}...)` : 'MISSING'}`);
      
      // Retry search without type restrictions for first sport only (to avoid too many API calls)
      const firstSport = sports[0];
      const keywords = SPORT_KEYWORDS[firstSport.toLowerCase()] || [`${firstSport} club`];
      const firstKeyword = keywords[0];
      
      try {
        console.log(`[Search API] Fallback: Searching "${firstKeyword}" without type restrictions`);
        const fallbackResults = await searchPlaces(
          firstKeyword,
          { lat: origin.lat, lng: origin.lng },
          radiusMeters,
          apiKey,
          undefined // No type restrictions
        );
        
        console.log(`[Search API] Fallback search (no type restrictions): ${fallbackResults.length} results`);
        
        if (fallbackResults.length > 0) {
          console.warn(`[Search API] SUCCESS: Fallback found ${fallbackResults.length} results. Type restrictions were too strict.`);
          totalResultsFound += fallbackResults.length;
          
          // Process fallback results
          for (const googlePlace of fallbackResults.slice(0, 10)) { // Limit to first 10
            try {
              const place = convertGooglePlace(googlePlace, firstSport);
              
              // MVP: Detect schools in fallback results and assign entityType
              const placeName = (place.name || '').toLowerCase();
              const placeTypes = googlePlace.types || [];
              const isSchool = 
                placeTypes.some((type: string) => 
                  type.includes('school') || 
                  type.includes('educational')
                ) ||
                placeName.includes('school') ||
                placeName.includes('academy') ||
                placeName.includes('preparatory') ||
                placeName.includes('high school') ||
                placeName.includes('middle school') ||
                placeName.includes('elementary');
              
              if (isSchool) {
                place.isSchool = true;
                let detectedSchoolTypes: string[] = [];
                if (placeName.includes('private') || placeTypes.some(t => t.includes('private'))) {
                  detectedSchoolTypes.push('private');
                }
                if (placeName.includes('public') || placeTypes.some(t => t.includes('public'))) {
                  detectedSchoolTypes.push('public');
                }
                if (detectedSchoolTypes.length === 0) {
                  const hasSchoolType = placeTypes.some(t => 
                    t.includes('school') || 
                    t.includes('educational')
                  );
                  if (hasSchoolType) {
                    detectedSchoolTypes.push('public');
                  }
                }
                place.schoolTypes = detectedSchoolTypes.length > 0 ? detectedSchoolTypes : ['highSchool'];
                
                // MVP: Assign explicit entityType
                if (detectedSchoolTypes.includes('private')) {
                  place.entityType = 'Private School';
                } else {
                  place.entityType = 'Public School';
                }
              } else {
                // Not a school, assign as Club
                place.entityType = 'Club';
              }
              
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
                // Add to allPlaces for processing
                allPlaces.push(place);
              }
            } catch (err) {
              console.error(`Error processing fallback place:`, err);
            }
          }
          
          // Re-deduplicate after adding fallback results
          const updatedUniquePlaces = deduplicatePlaces(allPlaces);
          const updatedUniqueRawPlaces = deduplicatePlaces(rawPlacesBeforeFiltering);
          
          if (updatedUniquePlaces.length > 0) {
            return NextResponse.json({ 
              places: updatedUniquePlaces,
              debug: {
                totalResultsFound,
                rawPlacesCount: updatedUniqueRawPlaces.length,
                totalResultsAfterPolygonFilter,
                totalResultsAfterDriveTimeFilter,
                uniquePlacesCount: updatedUniquePlaces.length,
                hasIsochrone: !!isochronePolygon,
                usedFallback: true,
                message: 'Fallback search without type restrictions found results',
              }
            });
          }
        } else {
          console.error(`[Search API] Fallback search also returned 0 results. This suggests an API key or configuration issue.`);
        }
      } catch (fallbackError) {
        const errorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        console.error(`[Search API] Fallback search failed:`, errorMsg);
        console.error(`[Search API] Full error:`, fallbackError);
      }
      
      console.warn(`[Search API] No places found for search: ${sports.join(', ')} near [${origin.lat}, ${origin.lng}]`);
      console.warn(`[Search API] Debug info: totalResultsFound=${totalResultsFound}, radiusMeters=${radiusMeters}, keywords used=${sports.flatMap(s => SPORT_KEYWORDS[s.toLowerCase()] || [`${s} club`]).join(', ')}`);
    }

    // Count places where AI was skipped due to paywall
    const aiSkippedCount = filteredPlaces.filter(p => 
      p.confidenceSignals?.includes('ai_skipped_paywall')
    ).length;

    return NextResponse.json({ 
      places: filteredPlaces,
      debug: {
        totalResultsFound,
        rawPlacesCount: uniqueRawPlaces.length,
        totalResultsAfterPolygonFilter,
        totalResultsAfterDriveTimeFilter,
        retailExcludedCount, // Retail sporting goods stores excluded
        uniquePlacesCount: uniquePlaces.length,
        filteredPlacesCount: filteredPlaces.length,
        hasIsochrone: !!isochronePolygon,
        // External intelligence signals
        osmConfirmedCount,
        aiClassifiedCount,
        aiSkippedCount, // Places where AI was skipped due to paywall
        avgConfidence: Math.round(avgConfidenceScore * 10) / 10,
        // Filter info
        schoolTypesFilter: schoolTypes.length > 0 ? schoolTypes : null,
        sportsFilter: sports.length > 0 ? sports : null,
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`Search API failed: ${errorMessage}`, errorStack);
    console.error('Full error object:', error);
    
    // Ensure we always return valid JSON, even if something goes wrong
    try {
      return NextResponse.json(
        { 
          error: 'Search failed',
          places: [],
          debug: {
            error: errorMessage,
            stack: errorStack,
          }
        },
        { status: 500 }
      );
    } catch (jsonError) {
      // If even JSON.stringify fails, return a plain text response
      console.error('Failed to create JSON error response:', jsonError);
      return new NextResponse(
        JSON.stringify({ error: 'Search failed', places: [] }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
}
