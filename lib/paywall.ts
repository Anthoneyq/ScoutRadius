/**
 * Paywall and Usage Tracking
 * Tracks AI usage per user and enforces limits
 */

export interface UsageLimits {
  free: {
    aiClassificationsPerMonth: number;
    searchesPerMonth: number;
  };
  pro: {
    aiClassificationsPerMonth: number;
    searchesPerMonth: number;
  };
}

export const USAGE_LIMITS: UsageLimits = {
  free: {
    aiClassificationsPerMonth: 10, // Free tier: 10 AI classifications/month
    searchesPerMonth: 50, // Free tier: 50 searches/month
  },
  pro: {
    aiClassificationsPerMonth: 1000, // Pro tier: 1000 AI classifications/month
    searchesPerMonth: 10000, // Pro tier: unlimited searches
  },
};

export interface UserUsage {
  userId: string;
  plan: 'free' | 'pro';
  aiClassificationsThisMonth: number;
  searchesThisMonth: number;
  lastResetDate: string; // ISO date string
}

/**
 * Check if user can use AI classification
 */
export function canUseAI(userUsage: UserUsage | null): boolean {
  if (!userUsage) {
    // No user = free tier limits
    return false; // Require authentication for AI
  }

  const limits = USAGE_LIMITS[userUsage.plan];
  
  // Reset monthly usage if needed
  const now = new Date();
  const lastReset = new Date(userUsage.lastResetDate);
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || 
                      now.getFullYear() !== lastReset.getFullYear();
  
  if (isNewMonth) {
    // Usage resets - allow
    return true;
  }

  return userUsage.aiClassificationsThisMonth < limits.aiClassificationsPerMonth;
}

/**
 * Check if user can perform search
 */
export function canSearch(userUsage: UserUsage | null): boolean {
  if (!userUsage) {
    // Allow searches without auth (basic feature)
    return true;
  }

  const limits = USAGE_LIMITS[userUsage.plan];
  
  // Reset monthly usage if needed
  const now = new Date();
  const lastReset = new Date(userUsage.lastResetDate);
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || 
                      now.getFullYear() !== lastReset.getFullYear();
  
  if (isNewMonth) {
    return true;
  }

  return userUsage.searchesThisMonth < limits.searchesPerMonth;
}

/**
 * Increment AI usage counter
 */
export function incrementAIUsage(userUsage: UserUsage): UserUsage {
  const now = new Date();
  const lastReset = new Date(userUsage.lastResetDate);
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || 
                      now.getFullYear() !== lastReset.getFullYear();
  
  if (isNewMonth) {
    // Reset counters
    return {
      ...userUsage,
      aiClassificationsThisMonth: 1,
      searchesThisMonth: 0,
      lastResetDate: now.toISOString(),
    };
  }

  return {
    ...userUsage,
    aiClassificationsThisMonth: userUsage.aiClassificationsThisMonth + 1,
  };
}

/**
 * Increment search counter
 */
export function incrementSearchUsage(userUsage: UserUsage | null): UserUsage | null {
  if (!userUsage) {
    return null; // No tracking for anonymous users
  }

  const now = new Date();
  const lastReset = new Date(userUsage.lastResetDate);
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || 
                      now.getFullYear() !== lastReset.getFullYear();
  
  if (isNewMonth) {
    return {
      ...userUsage,
      searchesThisMonth: 1,
      aiClassificationsThisMonth: 0,
      lastResetDate: now.toISOString(),
    };
  }

  return {
    ...userUsage,
    searchesThisMonth: userUsage.searchesThisMonth + 1,
  };
}
