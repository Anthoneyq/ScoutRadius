/**
 * OpenStreetMap (OSM) / Overpass API lookup for sports facilities
 * Provides structural validation signal for club identification
 */

export type OSMMatch = {
  lat: number;
  lng: number;
  tags: Record<string, string>;
};

/**
 * Query OpenStreetMap for sports facilities near a location
 * Uses Overpass API to find nodes/ways tagged with sports-related tags
 */
export async function queryOSMSportsFacilities(
  lat: number,
  lng: number,
  radiusMeters = 3000
): Promise<OSMMatch[]> {
  try {
    // Overpass QL query: find sports facilities within radius
    // Searches for:
    // - Nodes/ways with "sport" tag
    // - Nodes/ways with leisure=sports_centre
    const query = `
    [out:json];
    (
      node(around:${radiusMeters},${lat},${lng})["sport"];
      way(around:${radiusMeters},${lat},${lng})["sport"];
      node(around:${radiusMeters},${lat},${lng})["leisure"="sports_centre"];
      way(around:${radiusMeters},${lat},${lng})["leisure"="sports_centre"];
    );
    out center tags;
    `;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: query,
    });

    if (!res.ok) {
      console.warn(`[OSM] API request failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const elements = data.elements || [];

    return elements.map((el: any) => ({
      lat: el.lat ?? el.center?.lat ?? 0,
      lng: el.lon ?? el.center?.lon ?? 0,
      tags: el.tags ?? {},
    }));
  } catch (error) {
    // Silently fail - OSM is optional signal
    console.debug(`[OSM] Lookup failed for [${lat}, ${lng}]:`, error);
    return [];
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a Google Place matches any OSM sports facility
 * Returns true if within 200 meters of an OSM facility
 */
export function matchPlaceToOSM(
  placeLat: number,
  placeLng: number,
  osmFacilities: OSMMatch[],
  maxDistanceMeters = 200
): boolean {
  for (const facility of osmFacilities) {
    const distance = calculateDistance(
      placeLat,
      placeLng,
      facility.lat,
      facility.lng
    );
    if (distance <= maxDistanceMeters) {
      return true;
    }
  }
  return false;
}
