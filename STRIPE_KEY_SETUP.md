# Stripe Restricted API Key Setup

## Step 1: Enter Key Name

In the "Key name" field, enter:
```
ScoutRadius Paywall
```
or
```
ScoutRadius Backend
```

## Step 2: Set Permissions

For ScoutRadius paywall integration, you need these permissions:

### Required Permissions (Write):
- **Checkout Sessions** → **Write** (to create checkout sessions)
- **Customers** → **Write** (to create/manage customers)
- **Subscriptions** → **Write** (to manage subscriptions)

### Optional but Recommended (Read):
- **Webhooks** → **Read** (to verify webhook signatures)
- **Payment Intents** → **Read** (for payment status)
- **Charges** → **Read** (for payment history)

### Set to None (Not Needed):
- Everything else can be set to **None**

## Quick Setup Guide:

1. **Key name**: `ScoutRadius Paywall`

2. **Permissions to set**:
   - Scroll through the list
   - Find "Checkout Sessions" → Set to **Write**
   - Find "Customers" → Set to **Write**
   - Find "Subscriptions" → Set to **Write**
   - Find "Webhooks" → Set to **Read**
   - Leave everything else as **None**

3. **Click "Create key"** at the bottom

4. **Copy the secret key immediately** (starts with `sk_test_` or `sk_live_`)
   - It only shows once!
   - Add to `.env.local` as `STRIPE_SECRET_KEY`

5. **Also get your Publishable Key**:
   - Go back to API keys page
   - Copy the "Publishable key" (starts with `pk_test_` or `pk_live_`)
   - Add to `.env.local` as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Security Note:

Using a restricted key is more secure than the default key because it limits what the key can do. This is a best practice for production applications.
