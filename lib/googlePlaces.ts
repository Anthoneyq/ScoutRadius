/**
 * Google Places API utilities
 * Handles place search and details fetching
 */

export interface Place {
  place_id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  location: {
    lat: number;
    lng: number;
  };
  sport?: string;
  driveTime?: number;
  distance?: number;
  types?: string[]; // Place types from Google Places API
  clubScore?: number; // Club confidence score (0-10+)
  isClub?: boolean; // True if clubScore >= 3
  isSchool?: boolean; // True if place is a school
  schoolTypes?: string[]; // Detected school types: 'private', 'public', 'elementary', 'middle', 'juniorHigh', 'highSchool'
  ageGroups?: {
    youth: number;
    highSchool: number;
    adult: number;
    elite: number;
  };
  primaryAgeGroup?: 'youth' | 'highSchool' | 'adult' | 'elite';
  // External intelligence signals
  osmConfirmed?: boolean; // Confirmed by OpenStreetMap
  aiClassification?: {
    label: string;
    confidence: number;
  };
  confidenceSignals?: string[]; // Explanation tags for scoring
  // Sports data for schools
  sports?: string[]; // List of sports offered (for schools)
  sportsConfidence?: Record<string, number>; // Confidence score (0.0-1.0) for each sport
}

export interface GooglePlaceResult {
  id?: string;
  place_id?: string;
  name?: string;
  // Google Places API (New) returns displayName as an object, not a string
  displayName?: {
    text: string;
    languageCode?: string;
  };
  formatted_address?: string;
  formattedAddress?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  rating?: number;
  user_ratings_total?: number;
  userRatingCount?: number;
  formatted_phone_number?: string;
  formattedPhoneNumber?: string;
  nationalPhoneNumber?: string;
  website?: string;
  websiteUri?: string;
  types?: string[];
}

/**
 * Search for places by text query
 * FIXED: Removed includedTypes, added languageCode and rankPreference
 */
export async function searchPlaces(
  query: string,
  location: { lat: number; lng: number },
  radius: number, // meters
  apiKey: string,
  includedTypes?: string[] // DEPRECATED: Not used - Google Places (New) has inconsistent type taxonomy
): Promise<GooglePlaceResult[]> {
  // FIXED: Proper request body construction
  const requestBody = {
    textQuery: query,
    languageCode: "en", // REQUIRED for consistent results
    maxResultCount: 20, // Reduced from 50 for better performance
    locationBias: {
      circle: {
        center: {
          latitude: location.lat,
          longitude: location.lng,
        },
        radius: radius,
      },
    },
    rankPreference: "DISTANCE", // Prioritize closer results
    // DO NOT use includedTypes - Google Places (New) has inconsistent type taxonomy
    // Most clubs are NOT labeled sports_club
    // We score + rank client-side instead
  };

  // REQUIRED: Google Places API (New) requires X-Goog-FieldMask header
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.websiteUri',
    'places.nationalPhoneNumber',
  ].join(',');

  // Log request details for debugging
  console.log(`[Google Places] Searching: "${query}"`, {
    location: { lat: location.lat, lng: location.lng },
    radiusMeters: radius,
    requestBody: JSON.stringify(requestBody),
  });

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Google Places API error: ${errorText}`;
    let errorDetails: any = {};
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorJson.error || errorMessage;
      errorDetails = errorJson;
    } catch {
      // Use text as-is
    }
    console.error('[Google Places] API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorMessage,
      errorDetails,
      query,
      requestBody: JSON.stringify(requestBody),
    });
    throw new Error(`Google Places API ${response.status}: ${errorMessage}`);
  }

  const data = await response.json();
  
  if (!data.places) {
    console.error('[Google Places] No places array in response:', data);
    return [];
  }

  const places = data.places;
  if (Array.isArray(places)) {
    console.log(`[Google Places] Found ${places.length} results for "${query}"`);
    if (places.length === 0) {
      console.warn(`[Google Places] Zero results for "${query}"`);
      console.warn(`[Google Places] Response data:`, JSON.stringify(data).substring(0, 500));
    }
    return places;
  }
  
  console.warn(`[Google Places] Unexpected response format for query "${query}":`, data);
  return [];
}

/**
 * Get place details by place_id
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<GooglePlaceResult | null> {
  const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
  
  // REQUIRED: Use X-Goog-FieldMask header, not fields query param
  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'location',
    'rating',
    'userRatingCount',
    'nationalPhoneNumber',
    'websiteUri',
    'types',
  ].join(',');

  const response = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask, // REQUIRED for Places API (New)
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.text();
    throw new Error(`Google Places Details API error: ${error}`);
  }

  const data = await response.json();
  // Add place_id for consistency
  if (data.id && !data.place_id) {
    data.place_id = data.id;
  }
  return data;
}

/**
 * Deduplicate places by place_id
 */
export function deduplicatePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter(place => {
    if (seen.has(place.place_id)) {
      return false;
    }
    seen.add(place.place_id);
    return true;
  });
}

/**
 * Convert Google Place result to our Place format
 */
export function convertGooglePlace(googlePlace: GooglePlaceResult, sport?: string): Place {
  const placeId = googlePlace.place_id || googlePlace.id || '';
  // Google Places API (New) returns displayName as { text, languageCode }
  // Extract the text property, fallback to name or 'Unknown'
  const name = googlePlace.name || googlePlace.displayName?.text || 'Unknown';
  const address = googlePlace.formatted_address || googlePlace.formattedAddress || '';
  const phone = googlePlace.formatted_phone_number || googlePlace.formattedPhoneNumber || googlePlace.nationalPhoneNumber;
  const website = googlePlace.website || googlePlace.websiteUri;
  const rating = googlePlace.rating;
  const reviewCount = googlePlace.user_ratings_total || googlePlace.userRatingCount;
  
  // Handle different location formats
  let lat: number, lng: number;
  if (googlePlace.geometry?.location) {
    lat = googlePlace.geometry.location.lat;
    lng = googlePlace.geometry.location.lng;
  } else if (googlePlace.location) {
    lat = googlePlace.location.latitude;
    lng = googlePlace.location.longitude;
  } else {
    throw new Error('No location data in place result');
  }
  
  // Validate coordinates
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.error(`[convertGooglePlace] Invalid coordinates for place:`, {
      name: googlePlace.displayName?.text || googlePlace.name,
      lat,
      lng,
      googlePlace,
    });
    throw new Error(`Invalid coordinates: lat=${lat}, lng=${lng}`);
  }

  return {
    place_id: placeId,
    name,
    address,
    phone,
    website,
    rating,
    review_count: reviewCount,
    location: { lat, lng },
    sport,
    types: googlePlace.types, // Include place types for filtering/scoring
    // clubScore will be calculated in the search route after conversion
  };
}

/**
 * Calculate club confidence score for a place
 * Higher score = more likely to be a competitive club/team
 * Score ranges: ≥3 = Club, 1-2 = Possible, ≤0 = Venue
 * 
 * Now includes external intelligence signals:
 * - OSM validation (structural confirmation)
 * - AI semantic classification (for ambiguous cases)
 */
export function getClubConfidence(place: Place): number {
  let score = 0;
  const name = place.name.toLowerCase();
  const websiteLower = (place.website || '').toLowerCase();
  
  // Initialize confidence signals array
  if (!place.confidenceSignals) {
    place.confidenceSignals = [];
  }

  // Name-based signals (highest weight)
  if (name.match(/club|juniors|academy|select|travel|volleyball club/i)) {
    score += 3;
    place.confidenceSignals.push("name keywords");
  }
  if (name.match(/bar|restaurant|grill|cantina|pub/i)) {
    score -= 3; // Strong negative signal
    place.confidenceSignals.push("negative name keywords");
  }

  // Place type-based signals
  if (place.types?.includes('sports_club')) {
    score += 2;
    place.confidenceSignals.push("sports_club type");
  }
  if (place.types?.includes('school')) {
    score += 1;
    place.confidenceSignals.push("school type");
  }
  if (place.types?.some(type => ['restaurant', 'bar', 'gym', 'fitness_center'].includes(type))) {
    score -= 2;
    place.confidenceSignals.push("negative type");
  }

  // Website-based signals (if available)
  if (place.website) {
    score += 2; // Base score for having a website
    place.confidenceSignals.push("has website");
    if (websiteLower.match(/tryouts|teams|age groups|12u|14u|16u|18u/i)) {
      score += 2; // Additional boost for club-specific content
      place.confidenceSignals.push("club-specific website content");
    }
  }

  // External intelligence signal: OSM validation (strong structural confirmation)
  if (place.osmConfirmed) {
    score += 25; // Strong boost for OSM confirmation
    place.confidenceSignals.push("OSM sports facility match");
  }

  // External intelligence signal: AI semantic classification
  if (place.aiClassification) {
    const ai = place.aiClassification;
    if (ai.label === "competitive_club") {
      score += ai.confidence * 40; // Strong positive signal
      place.confidenceSignals.push(`AI: competitive_club (${Math.round(ai.confidence * 100)}%)`);
    } else if (ai.label === "recreational") {
      score += ai.confidence * 10; // Mild positive (still a sports facility)
      place.confidenceSignals.push(`AI: recreational (${Math.round(ai.confidence * 100)}%)`);
    } else if (ai.label === "private") {
      score -= 50; // Strong negative signal
      place.confidenceSignals.push(`AI: private (${Math.round(ai.confidence * 100)}%)`);
    } else if (ai.label === "retail") {
      // Retail stores should be hard-excluded, but if AI catches one, zero the score
      score = 0;
      place.confidenceSignals.push(`AI: retail (${Math.round(ai.confidence * 100)}%) - retail sporting goods store`);
    }
    // "unknown" classification doesn't affect score
  }

  // Ensure score doesn't go below 0
  return Math.max(0, score);
}

/**
 * Calculate age group scores for a place
 * Returns scores for each age group category
 */
export function getAgeGroupScores(place: Place): {
  youth: number;
  highSchool: number;
  adult: number;
  elite: number;
} {
  const scores = {
    youth: 0,
    highSchool: 0,
    adult: 0,
    elite: 0,
  };

  const name = place.name.toLowerCase();
  const websiteLower = (place.website || '').toLowerCase();
  const combinedText = `${name} ${websiteLower}`;

  // Name keywords (each match = +3)
  // Youth indicators
  if (combinedText.match(/youth|junior|juniors|12u|13u|14u/i)) {
    scores.youth += 3;
  }

  // High School indicators
  if (combinedText.match(/15u|16u|17u|18u|varsity|high school/i)) {
    scores.highSchool += 3;
  }

  // Adult indicators
  if (combinedText.match(/adult|open|rec|recreation/i)) {
    scores.adult += 3;
  }

  // Elite indicators
  if (combinedText.match(/elite|academy|performance|college prep/i)) {
    scores.elite += 3;
  }

  // Place type-based signals
  if (place.types?.includes('school')) {
    scores.highSchool += 2;
  }
  if (place.types?.includes('sports_club')) {
    scores.youth += 1;
    scores.elite += 1;
  }
  if (place.types?.some(type => ['bar', 'restaurant'].includes(type))) {
    scores.adult += 2;
  }

  // Review heuristic (weak signal)
  if (place.review_count && place.review_count > 50) {
    scores.adult += 1; // Adult venues tend to have more reviews
  }

  return scores;
}

/**
 * Get the primary age group based on scores
 */
export function getPrimaryAgeGroup(ageGroups: {
  youth: number;
  highSchool: number;
  adult: number;
  elite: number;
}): 'youth' | 'highSchool' | 'adult' | 'elite' | undefined {
  const entries = Object.entries(ageGroups) as Array<['youth' | 'highSchool' | 'adult' | 'elite', number]>;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  
  // Return primary age group if score >= 2, otherwise undefined
  if (sorted[0][1] >= 2) {
    return sorted[0][0];
  }
  
  return undefined;
}
