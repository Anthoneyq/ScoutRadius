import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';

/**
 * GET/POST /api/init-db - Initialize database schema
 * Run this once after setting up your database
 */
export async function GET() {
  return POST();
}

export async function POST() {
  try {
    await initDatabase();
    return NextResponse.json({ success: true, message: 'Database initialized' });
  } catch (error: any) {
    console.error('[Init DB] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initialize database' },
      { status: 500 }
    );
  }
}
