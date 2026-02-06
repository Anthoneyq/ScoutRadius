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
}

export interface GooglePlaceResult {
  id?: string;
  place_id?: string;
  name?: string;
  displayName?: string;
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
  apiKey: string
): Promise<GooglePlaceResult[]> {
  const url = new URL('https://places.googleapis.com/v1/places:searchText');
  
  const body = {
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
    maxResultCount: 50, // Increased for better coverage
  };

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Google Places API error: ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorJson.error || errorMessage;
    } catch {
      // Use text as-is
    }
    console.error('Google Places API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorMessage,
      url: url.toString(),
    });
    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log('Google Places API response:', {
    hasPlaces: !!data.places,
    placesCount: Array.isArray(data.places) ? data.places.length : 0,
    dataKeys: Object.keys(data),
  });
  
  // Handle both array and object responses
  if (Array.isArray(data.places)) {
    return data.places;
  }
  if (data.places && Array.isArray(data.places)) {
    return data.places;
  }
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
  url.searchParams.set('fields', 'id,displayName,formattedAddress,location,rating,userRatingCount,nationalPhoneNumber,websiteUri,types');

  const response = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': apiKey,
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
  const name = googlePlace.name || googlePlace.displayName || 'Unknown';
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
  };
}
