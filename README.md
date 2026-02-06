# ScoutRadius

A production-ready MVP web app for finding sports clubs within a specified drive time from a starting location.

## Features

- 🗺️ Interactive map with Mapbox GL JS
- ⏱️ Drive-time isochrone visualization
- 🏐 Multi-sport search (volleyball, track and field, basketball, softball)
- 📊 Synced table view with sorting and filtering
- 📍 Click map pins ↔ highlight table rows
- 📝 Add notes and tags per location (persisted in LocalStorage)
- 📥 Export results to CSV

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Maps**: Mapbox GL JS
- **Places**: Google Places API (New)
- **Deployment**: Vercel

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd ScoutRadius
npm install
```

### 2. Get API Keys

#### Mapbox
1. Sign up at [mapbox.com](https://www.mapbox.com)
2. Get your access token from the account page
3. Token should start with `pk.`

#### Google Places API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Places API (New)**
4. Create an API key
5. **Important**: Enable billing (required for Places API)

### 3. Configure Environment Variables

Create `.env.local` in the project root:

```bash
# Server-side (API routes)
MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Client-side (browser)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
```

**Note**: Use the same Mapbox token for both variables.

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Enter starting location**: Type an address or lat,lng coordinates (e.g., `37.7749,-122.4194`)
2. **Select drive time**: Choose 15, 30, or 45 minutes
3. **Select sports**: Click to toggle volleyball, track and field, basketball, softball
4. **Click "Search Sports Clubs"**: Results appear on map and in table
5. **Interact**:
   - Click map pins to highlight table rows
   - Click table rows to highlight map pins
   - Add notes/tags inline in the table
   - Filter and sort table columns
   - Export filtered results to CSV

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Vercel will auto-detect Next.js settings

### 3. Add Environment Variables

In Vercel project settings → Environment Variables, add:

- `MAPBOX_ACCESS_TOKEN` = `pk.your_token`
- `GOOGLE_MAPS_API_KEY` = `your_key`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` = `pk.your_token` (same as above)

### 4. Deploy

Click "Deploy" - Vercel will build and deploy automatically.

## Project Structure

```
ScoutRadius/
├── app/
│   ├── api/
│   │   ├── isochrone/route.ts    # Isochrone generation endpoint
│   │   └── search/route.ts        # Places search endpoint
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                   # Main app page
├── components/
│   ├── Controls.tsx               # Location/drive-time/sport controls
│   ├── Map.tsx                    # Mapbox map component
│   └── ResultsTable.tsx           # Table with sorting/filtering
├── lib/
│   ├── csv.ts                     # CSV export utilities
│   ├── googlePlaces.ts            # Google Places API client
│   └── mapbox.ts                  # Mapbox API client
├── .env.example
├── next.config.js
├── package.json
└── README.md
```

## API Routes

### `GET /api/isochrone`
Generate drive-time isochrone polygon.

**Query params:**
- `lng`: Longitude
- `lat`: Latitude
- `minutes`: Drive time in minutes (default: 15)

**Response:** GeoJSON FeatureCollection

### `POST /api/search`
Search for sports clubs within drive time.

**Body:**
```json
{
  "origin": { "lat": 37.7749, "lng": -122.4194 },
  "sports": ["volleyball", "basketball"],
  "driveTimeMinutes": 30
}
```

**Response:**
```json
{
  "places": [
    {
      "place_id": "...",
      "name": "...",
      "address": "...",
      "location": { "lat": ..., "lng": ... },
      "driveTime": 25,
      "distance": 12.5,
      ...
    }
  ]
}
```

## Troubleshooting

### Map doesn't render
- Check browser console for errors
- Verify `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set in `.env.local`
- Restart dev server after adding env vars

### No places returned
- Verify Google Places API is enabled in Google Cloud Console
- Check billing is enabled (required)
- Verify API key has correct permissions
- Check server logs for API errors

### Build fails on Vercel
- Ensure all environment variables are set in Vercel dashboard
- Check build logs for specific errors
- Verify `package.json` has all dependencies

### Directions API errors
- Mapbox Directions API is included with Mapbox account
- Check token has correct permissions
- Verify coordinates are valid

## Future Enhancements

- Replace LocalStorage with Supabase/Firebase for notes/tags
- Add user authentication
- Save search history
- Add more sports
- Custom drive time input
- Route visualization on map
- Batch export options

## License

MIT
