import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserUsage } from '@/lib/db';
import { canUseAI, canSearch } from '@/lib/paywall';

// Mark as dynamic since we use auth()
export const dynamic = 'force-dynamic';

/**
 * GET /api/usage - Get current user's usage stats
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      // Anonymous users - free tier limits
      return NextResponse.json({ 
        plan: 'free',
        aiClassificationsThisMonth: 0,
        searchesThisMonth: 0,
        canUseAI: false,
        canSearch: true,
        isAuthenticated: false,
      });
    }

    const userUsage = await getUserUsage(userId);
    
    if (!userUsage) {
      return NextResponse.json({ 
        plan: 'free',
        aiClassificationsThisMonth: 0,
        searchesThisMonth: 0,
        canUseAI: false,
        canSearch: true,
        isAuthenticated: true,
      });
    }

    return NextResponse.json({
      plan: userUsage.plan,
      aiClassificationsThisMonth: userUsage.aiClassificationsThisMonth,
      searchesThisMonth: userUsage.searchesThisMonth,
      canUseAI: canUseAI(userUsage),
      canSearch: canSearch(userUsage),
      isAuthenticated: true,
    });
  } catch (error) {
    console.error('[Usage API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
