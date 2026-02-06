/**
 * Retail Sporting Goods Store Exclusion Module
 * Hard-excludes retail chains that sell sports equipment but are not clubs
 * These should never appear as clubs, regardless of scoring
 */

export const RETAIL_CHAIN_KEYWORDS = [
  'academy sports',
  'academy sports + outdoors',
  "academy sports and outdoors",
  "dick's sporting goods",
  "dicks sporting goods",
  "dicks",
  'scheels',
  'big 5 sporting goods',
  "big 5",
  "sportsman's warehouse",
  'sportsmans warehouse',
  'rei',
  'bass pro',
  'cabela',
  'cabelas',
  'fleet feet',
  'foot locker',
  'champs sports',
  'finish line',
  'modell\'s',
  'modells',
  'sports authority',
  'play it again sports',
];

/**
 * Check if a place is a retail sporting goods store
 * Uses name, displayName, and website to detect retail chains
 */
export function isRetailSportStore(place: {
  name?: string;
  displayName?: string | { text?: string };
  website?: string;
}): boolean {
  // Extract text from various name formats
  const nameText = typeof place.name === 'string' 
    ? place.name 
    : typeof place.displayName === 'string'
    ? place.displayName
    : typeof place.displayName === 'object' && place.displayName?.text
    ? place.displayName.text
    : '';

  // Build haystack from all available text fields
  const haystack = [
    nameText,
    place.website || '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Check if any retail keyword matches
  return RETAIL_CHAIN_KEYWORDS.some(keyword =>
    haystack.includes(keyword.toLowerCase())
  );
}
