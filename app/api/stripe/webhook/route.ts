import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { updateUserPlan } from '@/lib/db';

// Mark as dynamic since we use headers()
export const dynamic = 'force-dynamic';

// Lazy initialization - only create Stripe client when needed
function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
  });
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/stripe/webhook - Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;
      
      if (userId && session.subscription) {
        // Get subscription details
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        
        // Update user to Pro plan
        await updateUserPlan(
          userId,
          'pro',
          session.customer as string,
          subscription.id
        );
        
        console.log(`[Stripe Webhook] User ${userId} upgraded to Pro`);
      }
      break;
    }
    
    case 'customer.subscription.deleted':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      
      if (userId) {
        // Check if subscription is active
        const isActive = subscription.status === 'active';
        await updateUserPlan(
          userId,
          isActive ? 'pro' : 'free',
          subscription.customer as string,
          subscription.id
        );
        
        console.log(`[Stripe Webhook] User ${userId} plan updated: ${isActive ? 'pro' : 'free'}`);
      }
      break;
    }
    
    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
