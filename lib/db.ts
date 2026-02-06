/**
 * Database functions for user usage tracking
 * Uses Neon (Vercel Postgres replacement)
 */

import { neon } from '@neondatabase/serverless';
import { UserUsage } from './paywall';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

const sql = neon(process.env.POSTGRES_URL);

/**
 * Initialize database schema
 */
export async function initDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_usage (
        user_id VARCHAR(255) PRIMARY KEY,
        plan VARCHAR(50) DEFAULT 'free',
        ai_classifications_this_month INTEGER DEFAULT 0,
        searches_this_month INTEGER DEFAULT 0,
        last_reset_date TIMESTAMP DEFAULT NOW(),
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('[DB] Database schema initialized');
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    throw error;
  }
}

/**
 * Get user usage from database
 */
export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  try {
    const result = await sql`
      SELECT * FROM user_usage
      WHERE user_id = ${userId}
    `;
    
    if (result.length === 0) {
      // Create new user record
      return await createUserUsage(userId);
    }
    
    const row = result[0];
    return {
      userId: row.user_id,
      plan: row.plan as 'free' | 'pro',
      aiClassificationsThisMonth: row.ai_classifications_this_month || 0,
      searchesThisMonth: row.searches_this_month || 0,
      lastResetDate: row.last_reset_date?.toISOString() || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[DB] Error getting user usage:', error);
    return null;
  }
}

/**
 * Create new user usage record
 */
async function createUserUsage(userId: string): Promise<UserUsage> {
  const now = new Date();
  const userUsage: UserUsage = {
    userId,
    plan: 'free',
    aiClassificationsThisMonth: 0,
    searchesThisMonth: 0,
    lastResetDate: now.toISOString(),
  };
  
  try {
    await sql`
      INSERT INTO user_usage (user_id, plan, ai_classifications_this_month, searches_this_month, last_reset_date)
      VALUES (${userId}, 'free', 0, 0, ${now.toISOString()})
    `;
  } catch (error) {
    console.error('[DB] Error creating user usage:', error);
  }
  
  return userUsage;
}

/**
 * Update user usage in database
 */
export async function updateUserUsage(userUsage: UserUsage): Promise<void> {
  try {
    await sql`
      UPDATE user_usage
      SET 
        plan = ${userUsage.plan},
        ai_classifications_this_month = ${userUsage.aiClassificationsThisMonth},
        searches_this_month = ${userUsage.searchesThisMonth},
        last_reset_date = ${userUsage.lastResetDate}::timestamp,
        updated_at = NOW()
      WHERE user_id = ${userUsage.userId}
    `;
  } catch (error) {
    console.error('[DB] Error updating user usage:', error);
    throw error;
  }
}

/**
 * Increment AI classification count
 */
export async function incrementAIUsage(userId: string): Promise<void> {
  const userUsage = await getUserUsage(userId);
  if (!userUsage) return;
  
  const { incrementAIUsage } = await import('./paywall');
  const updated = incrementAIUsage(userUsage);
  await updateUserUsage(updated);
}

/**
 * Increment search count
 */
export async function incrementSearchUsage(userId: string): Promise<void> {
  const userUsage = await getUserUsage(userId);
  if (!userUsage) return;
  
  const { incrementSearchUsage } = await import('./paywall');
  const updated = incrementSearchUsage(userUsage);
  if (updated) {
    await updateUserUsage(updated);
  }
}

/**
 * Update user plan (e.g., after Stripe subscription)
 */
export async function updateUserPlan(
  userId: string, 
  plan: 'free' | 'pro',
  stripeCustomerId?: string,
  stripeSubscriptionId?: string
): Promise<void> {
  try {
    await sql`
      UPDATE user_usage
      SET 
        plan = ${plan},
        stripe_customer_id = ${stripeCustomerId || null},
        stripe_subscription_id = ${stripeSubscriptionId || null},
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  } catch (error) {
    console.error('[DB] Error updating user plan:', error);
    throw error;
  }
}
