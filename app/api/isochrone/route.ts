import { NextRequest, NextResponse } from 'next/server';
import { generateIsochrone } from '@/lib/mapbox';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lng = parseFloat(searchParams.get('lng') || '');
  const lat = parseFloat(searchParams.get('lat') || '');
  const minutes = parseInt(searchParams.get('minutes') || '15');

  if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
    return NextResponse.json(
      { error: 'Missing or invalid lng/lat parameters' },
      { status: 400 }
    );
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: 'MAPBOX_ACCESS_TOKEN not configured' },
      { status: 500 }
    );
  }

  try {
    const isochrone = await generateIsochrone(lng, lat, minutes, accessToken);
    return NextResponse.json(isochrone);
  } catch (error) {
    console.error('Isochrone API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate isochrone' },
      { status: 500 }
    );
  }
}
