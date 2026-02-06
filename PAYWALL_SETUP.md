# Paywall Setup Guide

This guide shows you how to add a paywall to ScoutRadius to monetize AI features.

## Current Status

✅ **AI Cost Optimization**: Already using `gpt-4o-mini` (cheapest model)
- Optimized prompt (reduced tokens)
- Limited to 50 max tokens output
- Only runs for ambiguous places (top 30 results)

✅ **Paywall Foundation**: Basic paywall logic created
- Usage tracking system (`lib/paywall.ts`)
- Usage API endpoint (`app/api/usage/route.ts`)
- Integrated into search route

## What You Need to Complete

### 1. User Authentication

Choose one:

**Option A: Clerk (Easiest)**
```bash
npm install @clerk/nextjs
```

**Option B: NextAuth.js**
```bash
npm install next-auth
```

**Option C: Custom Auth**
- Use your existing auth system
- Pass user ID in request headers or session

### 2. Database Setup

Choose one:

**Option A: Vercel Postgres**
```bash
npm install @vercel/postgres
```

**Option B: Supabase**
```bash
npm install @supabase/supabase-js
```

**Option C: MongoDB**
```bash
npm install mongodb
```

**Database Schema:**
```sql
CREATE TABLE user_usage (
  user_id VARCHAR(255) PRIMARY KEY,
  plan VARCHAR(50) DEFAULT 'free',
  ai_classifications_this_month INTEGER DEFAULT 0,
  searches_this_month INTEGER DEFAULT 0,
  last_reset_date TIMESTAMP DEFAULT NOW()
);
```

### 3. Payment Processing (Stripe)

```bash
npm install stripe @stripe/stripe-js
```

**Setup:**
1. Create Stripe account: https://stripe.com
2. Get API keys from Stripe Dashboard
3. Add to `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

**Create Subscription Plans:**
- Free: $0/month (10 AI classifications, 50 searches)
- Pro: $9.99/month (1000 AI classifications, unlimited searches)

### 4. Update Search Route

Replace mock user usage with real database calls:

```typescript
// In app/api/search/route.ts
import { getServerSession } from 'next-auth'; // or Clerk equivalent
import { getUserUsage, incrementAIUsage } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getServerSession(); // Get from your auth provider
  const userId = session?.user?.id || null;
  
  const userUsage = userId ? await getUserUsage(userId) : null;
  
  // ... rest of code
}
```

### 5. Frontend Integration

Add usage display and upgrade prompts:

```typescript
// In app/page.tsx or a new component
const [usage, setUsage] = useState(null);

useEffect(() => {
  fetch('/api/usage')
    .then(res => res.json())
    .then(data => setUsage(data));
}, []);

// Show upgrade prompt when limit reached
{usage && !usage.canUseAI && (
  <div className="upgrade-banner">
    AI classification limit reached. 
    <button onClick={handleUpgrade}>Upgrade to Pro</button>
  </div>
)}
```

## Pricing Strategy

**Free Tier:**
- 10 AI classifications/month
- 50 searches/month
- Basic features

**Pro Tier ($9.99/month):**
- 1,000 AI classifications/month
- Unlimited searches
- All features

## Cost Analysis

**Current AI Costs (gpt-4o-mini):**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- Average classification: ~200 input tokens, ~50 output tokens
- Cost per classification: ~$0.000045 (less than $0.01)

**With 1,000 classifications/month:**
- Cost: ~$0.045/month
- Revenue: $9.99/month
- Profit margin: 99.5%

## Quick Start (Minimal Setup)

For a quick MVP, you can use:

1. **LocalStorage for usage tracking** (temporary)
2. **Stripe Checkout** (one-time payment links)
3. **Manual plan upgrades** (admin dashboard)

This gets you started without a full database setup.

## Next Steps

1. Choose authentication provider
2. Set up database
3. Integrate Stripe
4. Update search route with real user checks
5. Add frontend usage display
6. Test payment flow

## Files Created

- `lib/paywall.ts` - Usage limits and checking logic
- `app/api/usage/route.ts` - Usage API endpoint
- `PAYWALL_SETUP.md` - This guide

## Files Modified

- `lib/aiClassifier.ts` - Optimized prompt (reduced tokens)
- `app/api/search/route.ts` - Added paywall checks
