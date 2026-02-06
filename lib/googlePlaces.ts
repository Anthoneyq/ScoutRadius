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
  ageGroups?: {
    youth: number;
    highSchool: number;
    adult: number;
    elite: number;
  };
  primaryAgeGroup?: 'youth' | 'highSchool' | 'adult' | 'elite';
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
 */
export async function searchPlaces(
  query: string,
  location: { lat: number; lng: number },
  radius: number, // meters
  apiKey: string,
  includedTypes?: string[] // Optional: restrict to specific place types
): Promise<GooglePlaceResult[]> {
  const url = new URL('https://places.googleapis.com/v1/places:searchText');
  
  const body: any = {
    textQuery: query,
    locationBias: {
      circle: {
        center: {
          latitude: location.lat,
          longitude: location.lng,
        },
        radius: radius,
      },
    },
    maxResultCount: 50,
  };
  
  // Add includedTypes if provided (restricts to specific place types)
  if (includedTypes && includedTypes.length > 0) {
    body.includedTypes = includedTypes;
  }

  // REQUIRED: Google Places API (New) requires X-Goog-FieldMask header
  // Without this header, the API will return an error or empty results
  // Specify which fields to return - this is mandatory, not optional
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.types', // Include types for filtering
  ].join(',');

  // Log request details for debugging
  console.log(`[Google Places] Searching: "${query}"`, {
    location: { lat: location.lat, lng: location.lng },
    radiusMeters: radius,
    includedTypes: includedTypes?.join(', ') || 'none',
    maxResultCount: body.maxResultCount,
  });

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask, // REQUIRED for Places API (New)
    },
    body: JSON.stringify(body),
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
      url: url.toString().substring(0, 100),
    });
    throw new Error(`Google Places API ${response.status}: ${errorMessage}`);
  }

  const data = await response.json();
  
  // Google Places API (New) returns results in data.places array
  const places = data.places;
  if (Array.isArray(places)) {
    console.log(`[Google Places] Found ${places.length} results for "${query}"`);
    if (places.length === 0) {
      console.warn(`[Google Places] Zero results for "${query}"`);
      console.warn(`[Google Places] Request details:`, {
        query,
        location: { lat: location.lat, lng: location.lng },
        radiusMeters: radius,
        includedTypes: includedTypes?.join(', ') || 'none',
        responseStatus: response.status,
        responseData: JSON.stringify(data).substring(0, 500), // First 500 chars of response
      });
    }
    return places;
  }
  
  // If places is not an array, log warning and return empty
  console.warn(`[Google Places] Unexpected response format for query "${query}":`, {
    responseData: data,
    hasPlaces: !!places,
    placesType: typeof places,
  });
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
 */
export function getClubConfidence(place: Place): number {
  let score = 0;
  const name = place.name.toLowerCase();
  const websiteLower = (place.website || '').toLowerCase();

  // Name-based signals (highest weight)
  if (name.match(/club|juniors|academy|select|travel|volleyball club/i)) {
    score += 3;
  }
  if (name.match(/bar|restaurant|grill|cantina|pub/i)) {
    score -= 3; // Strong negative signal
  }

  // Place type-based signals
  if (place.types?.includes('sports_club')) {
    score += 2;
  }
  if (place.types?.includes('school')) {
    score += 1;
  }
  if (place.types?.some(type => ['restaurant', 'bar', 'gym', 'fitness_center'].includes(type))) {
    score -= 2;
  }

  // Website-based signals (if available)
  if (place.website) {
    score += 2; // Base score for having a website
    if (websiteLower.match(/tryouts|teams|age groups|12u|14u|16u|18u/i)) {
      score += 2; // Additional boost for club-specific content
    }
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
