'use client';

import { useState, useMemo } from 'react';

interface Place {
  place_id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  review_count?: number;
  sport?: string;
  driveTime?: number;
  distance?: number;
}

interface ResultsTableProps {
  places: Place[];
  selectedPlaceId: string | null;
  onPlaceClick: (placeId: string) => void;
  notes: Record<string, string>;
  tags: Record<string, string>;
  onNotesChange: (placeId: string, notes: string) => void;
  onTagsChange: (placeId: string, tags: string) => void;
  onExport: () => void;
}

type SortField = 'name' | 'sport' | 'driveTime' | 'distance' | 'rating' | 'review_count';
type SortDirection = 'asc' | 'desc';

export default function ResultsTable(props: ResultsTableProps) {
  const {
    places = [],
    selectedPlaceId = null,
    onPlaceClick = () => {},
    notes = {},
    tags = {},
    onNotesChange = () => {},
    onTagsChange = () => {},
    onExport = () => {},
  } = props || {};
  const [sortField, setSortField] = useState<SortField>('driveTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterSport, setFilterSport] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const sports = useMemo(() => {
    const sportSet = new Set<string>();
    places.forEach(p => {
      if (p.sport) sportSet.add(p.sport);
    });
    return Array.from(sportSet).sort();
  }, [places]);

  const filteredAndSorted = useMemo(() => {
    // Safety guard: ensure places is an array
    if (!Array.isArray(places)) return [];
    
    let filtered = places.filter(place => {
      if (filterSport !== 'all' && place.sport !== filterSport) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        // Ensure name is a string (should already be converted from displayName.text)
        const name = typeof place.name === 'string' ? place.name : '';
        return (
          name.toLowerCase().includes(query) ||
          place.address.toLowerCase().includes(query) ||
          place.sport?.toLowerCase().includes(query)
        );
      }
      return true;
    });

    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (aVal === null || aVal === undefined) aVal = sortDirection === 'asc' ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = sortDirection === 'asc' ? Infinity : -Infinity;

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [places, sortField, sortDirection, filterSport, searchQuery]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-4 border-b bg-gray-50 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-md text-sm"
          />
          <select
            value={filterSport}
            onChange={(e) => setFilterSport(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">All Sports</option>
            {sports.map(sport => (
              <option key={sport} value={sport}>{sport}</option>
            ))}
          </select>
          <button
            onClick={onExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            Export CSV
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Showing {filteredAndSorted.length} of {places.length} places
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th
                className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('name')}
              >
                Club Name <SortIcon field="name" />
              </th>
              <th
                className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('sport')}
              >
                Sport <SortIcon field="sport" />
              </th>
              <th
                className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('driveTime')}
              >
                Drive Time <SortIcon field="driveTime" />
              </th>
              <th
                className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('distance')}
              >
                Distance <SortIcon field="distance" />
              </th>
              <th className="px-4 py-2 text-left">Address</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">Website</th>
              <th
                className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('rating')}
              >
                Rating <SortIcon field="rating" />
              </th>
              <th
                className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('review_count')}
              >
                Reviews <SortIcon field="review_count" />
              </th>
              <th className="px-4 py-2 text-left">Notes</th>
              <th className="px-4 py-2 text-left">Tags</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((place) => {
              // Safety guard: ensure name is a string (should already be converted from displayName.text)
              const displayName = typeof place.name === 'string' ? place.name : '';
              
              return (
                <tr
                  key={place.place_id}
                  onClick={() => onPlaceClick(place.place_id)}
                  className={`border-b hover:bg-blue-50 cursor-pointer ${
                    selectedPlaceId === place.place_id ? 'bg-blue-100' : ''
                  }`}
                >
                  <td className="px-4 py-2 font-medium">{displayName}</td>
                <td className="px-4 py-2">{place.sport || '-'}</td>
                <td className="px-4 py-2">
                  {place.driveTime !== null && place.driveTime !== undefined
                    ? `${place.driveTime} min`
                    : '-'}
                </td>
                <td className="px-4 py-2">
                  {place.distance !== null && place.distance !== undefined
                    ? `${place.distance.toFixed(1)} mi`
                    : '-'}
                </td>
                <td className="px-4 py-2">{place.address}</td>
                <td className="px-4 py-2">{place.phone || '-'}</td>
                <td className="px-4 py-2">
                  {place.website ? (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Visit
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-2">
                  {place.rating !== null && place.rating !== undefined
                    ? place.rating.toFixed(1)
                    : '-'}
                </td>
                <td className="px-4 py-2">
                  {place.review_count !== null && place.review_count !== undefined
                    ? place.review_count.toLocaleString()
                    : '-'}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={notes[place.place_id] || ''}
                    onChange={(e) => onNotesChange(place.place_id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Add notes..."
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={tags[place.place_id] || ''}
                    onChange={(e) => onTagsChange(place.place_id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Add tags..."
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {filteredAndSorted.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No places found. Try adjusting your filters.
          </div>
        )}
      </div>
    </div>
  );
}
