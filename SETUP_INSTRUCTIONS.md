# Paywall System Setup Instructions

## ✅ What's Been Built

1. **Authentication**: Clerk integration
2. **Database**: Neon database functions (`lib/db.ts`)
3. **Stripe**: Checkout and webhook handlers
4. **Frontend**: Usage display component
5. **Backend**: Updated search route to use real user data

## 📋 Setup Steps

### Step 1: Set Up Clerk (Authentication)

1. Go to https://clerk.com and sign up
2. Create a new application
3. Copy your API keys from the dashboard
4. Add to `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

### Step 2: Set Up Neon Database

1. Go to https://neon.tech and sign up
2. Create a new project
3. Copy the connection string (starts with `postgresql://`)
4. Add to `.env.local`:
   ```
   POSTGRES_URL=postgresql://user:password@host/database
   ```
5. Initialize the database schema:
   ```bash
   curl -X POST http://localhost:3000/api/init-db
   ```
   Or visit: http://localhost:3000/api/init-db in your browser

### Step 3: Set Up Stripe (Payments)

1. Go to https://stripe.com and create an account
2. Get your API keys from the dashboard
3. Add to `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
4. Create a product in Stripe Dashboard:
   - Name: "ScoutRadius Pro"
   - Type: Recurring
   - Price: $9.99/month
   - Copy the Price ID (starts with `price_`)
5. Add Price ID to `.env.local`:
   ```
   STRIPE_PRO_PRICE_ID=price_...
   ```
6. Set up webhook endpoint:
   - In Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-domain.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy webhook signing secret
   - Add to `.env.local`:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_...
     ```

### Step 4: Update Environment Variables

Your `.env.local` should now have:
```bash
# Existing keys
MAPBOX_ACCESS_TOKEN=pk...
GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk...
OPENAI_API_KEY=sk-proj-...

# New keys for paywall
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
POSTGRES_URL=postgresql://...
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Step 5: Test Locally

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Initialize database:
   ```bash
   curl -X POST http://localhost:3000/api/init-db
   ```

3. Test the flow:
   - Visit http://localhost:3000
   - Sign up/login with Clerk
   - Try a search (should work)
   - Check usage display (top right)
   - Click "Upgrade to Pro" (Stripe checkout)
   - Complete test payment
   - Verify webhook updates your plan

### Step 6: Deploy to Vercel

1. Push code to GitHub
2. In Vercel Dashboard → Your Project → Settings → Environment Variables
3. Add all environment variables from `.env.local`
4. Deploy
5. Update Stripe webhook URL to production:
   - `https://your-domain.vercel.app/api/stripe/webhook`

## 🎯 Features

- **Free Tier**: 10 AI classifications/month, 50 searches/month
- **Pro Tier**: 1,000 AI classifications/month, unlimited searches
- **Usage Tracking**: Real-time display in UI
- **Stripe Integration**: Secure payment processing
- **Automatic Plan Updates**: Webhook handles subscription changes

## 🐛 Troubleshooting

**Database connection errors:**
- Verify `POSTGRES_URL` is correct
- Make sure database is accessible
- Run `/api/init-db` to create tables

**Stripe checkout not working:**
- Verify `STRIPE_PRO_PRICE_ID` is set
- Check Stripe Dashboard for errors
- Use test mode keys for development

**Webhook not updating plans:**
- Verify webhook URL is correct
- Check `STRIPE_WEBHOOK_SECRET` matches Stripe
- Check Vercel logs for webhook errors

**Authentication issues:**
- Verify Clerk keys are correct
- Check Clerk Dashboard → Users
- Make sure middleware is working

## 📁 Files Created

- `lib/db.ts` - Database functions
- `middleware.ts` - Clerk auth middleware
- `app/api/usage/route.ts` - Usage API
- `app/api/stripe/checkout/route.ts` - Stripe checkout
- `app/api/stripe/webhook/route.ts` - Stripe webhook handler
- `app/api/init-db/route.ts` - Database initialization
- `components/UsageDisplay.tsx` - Usage UI component
- `app/layout.tsx` - Updated with ClerkProvider

## 📝 Next Steps

1. Complete all setup steps above
2. Test locally
3. Deploy to Vercel
4. Monitor usage and payments
5. Adjust pricing/limits as needed
