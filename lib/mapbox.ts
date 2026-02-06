/**
 * Mapbox API utilities
 * Handles isochrone generation and directions
 */

export interface IsochroneResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
    properties: {
      contour: number;
      metric: string;
    };
  }>;
}

export interface DirectionsResponse {
  routes: Array<{
    distance: number; // meters
    duration: number; // seconds
    geometry: {
      coordinates: number[][];
    };
  }>;
}

/**
 * Generate isochrone polygon for drive-time area
 */
export async function generateIsochrone(
  lng: number,
  lat: number,
  minutes: number,
  accessToken: string
): Promise<IsochroneResponse> {
  const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${lng},${lat}?contours_minutes=${minutes}&polygons=true&access_token=${accessToken}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mapbox Isochrone API error: ${error}`);
  }
  
  return response.json();
}

/**
 * Get driving directions and time from origin to destination
 */
export async function getDirections(
  origin: [number, number],
  destination: [number, number],
  accessToken: string
): Promise<DirectionsResponse> {
  const [originLng, originLat] = origin;
  const [destLng, destLat] = destination;
  
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&access_token=${accessToken}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mapbox Directions API error: ${error}`);
  }
  
  return response.json();
}

/**
 * Convert meters to miles
 */
export function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}

/**
 * Convert seconds to minutes
 */
export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}
