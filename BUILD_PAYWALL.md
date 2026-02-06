# Building the Paywall System - Step by Step

## Step 1: Install Dependencies

```bash
npm install @clerk/nextjs @vercel/postgres stripe @stripe/stripe-js
```

## Step 2: Set Up Clerk (Authentication)

1. Go to https://clerk.com and create an account
2. Create a new application
3. Copy your API keys
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

## Step 3: Set Up Vercel Postgres (Database)

1. In Vercel Dashboard → Storage → Create Database → Postgres
2. Copy connection string
3. Add to `.env.local`:
   ```
   POSTGRES_URL=postgresql://...
   POSTGRES_PRISMA_URL=postgresql://...
   POSTGRES_URL_NON_POOLING=postgresql://...
   ```

## Step 4: Set Up Stripe (Payments)

1. Go to https://stripe.com and create account
2. Get API keys from Dashboard
3. Add to `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
4. Create products in Stripe Dashboard:
   - Pro Plan: $9.99/month recurring

## Step 5: Run Database Migration

```bash
# Create the user_usage table
psql $POSTGRES_URL -c "CREATE TABLE IF NOT EXISTS user_usage (
  user_id VARCHAR(255) PRIMARY KEY,
  plan VARCHAR(50) DEFAULT 'free',
  ai_classifications_this_month INTEGER DEFAULT 0,
  searches_this_month INTEGER DEFAULT 0,
  last_reset_date TIMESTAMP DEFAULT NOW(),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255)
);"
```

## Step 6: Test the System

1. Start dev server: `npm run dev`
2. Sign up/login with Clerk
3. Try a search (should work)
4. Try upgrading to Pro (Stripe checkout)
5. Verify usage tracking works
