import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { updateLoopsContact } from '@/lib/email/loops';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown';
    console.error('[stripe-webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const subscriptionId = session.subscription as string | null;
      if (userId && subscriptionId) {
        await supabase.from('users').update({
          subscription_tier: 'pro',
          stripe_subscription_id: subscriptionId,
        }).eq('id', userId);
        // Fire-and-forget: sync the upgrade to Loops. The webhook only has the user
        // id, so look up the account email to key the contact (same email as signup).
        const { data: u } = await supabase.from('users').select('email').eq('id', userId).single();
        if (u?.email) updateLoopsContact(u.email, { subscriptionTier: 'pro' });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      // Find user by Stripe customer ID
      const { data: userRow } = await supabase
        .from('users')
        .select('id, email, comp_pro')
        .eq('stripe_customer_id', customerId)
        .single();
      if (userRow) {
        // Comped (admin-granted) accounts keep Pro when a Stripe sub ends.
        await supabase.from('users').update({
          ...(userRow.comp_pro ? {} : { subscription_tier: 'free' }),
          stripe_subscription_id: null,
        }).eq('id', userRow.id);
        // Fire-and-forget: reflect the churn in Loops so the contact drops back
        // into free-conversion segments.
        if (userRow.email && !userRow.comp_pro) updateLoopsContact(userRow.email, { subscriptionTier: 'free' });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const isActive = subscription.status === 'active' || subscription.status === 'trialing';
      const { data: userRow } = await supabase
        .from('users')
        .select('id, email, comp_pro')
        .eq('stripe_customer_id', customerId)
        .single();
      // Comped accounts' tier is managed by admin, not Stripe.
      if (userRow && !userRow.comp_pro) {
        await supabase.from('users').update({
          subscription_tier: isActive ? 'pro' : 'free',
        }).eq('id', userRow.id);
        // Fire-and-forget: keep Loops' subscriptionTier in sync either direction.
        if (userRow.email) updateLoopsContact(userRow.email, { subscriptionTier: isActive ? 'pro' : 'free' });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
