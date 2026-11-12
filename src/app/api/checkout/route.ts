import { NextResponse } from 'next/server';
import { getStripe, PLANS } from '@/lib/stripe';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!PLANS.pro.priceId) {
      return NextResponse.json({ error: 'Stripe price not configured — set STRIPE_PRO_PRICE_ID in Vercel env vars' }, { status: 500 });
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = userRow?.stripe_customer_id;
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Admin client: signed-in users can't write billing columns on `users`
      // themselves (column privileges; see migration users_column_privileges).
      await createAdminClient().from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL;
    if (!origin) return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 });

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PLANS.pro.priceId, quantity: 1 }],
      success_url: `${origin}/account?upgraded=1`,
      cancel_url: `${origin}/account`,
      metadata: { supabase_user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[checkout]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
