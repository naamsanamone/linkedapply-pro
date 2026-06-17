/* ============================================================
   LinkedApply Pro — Extension Checkout API Route
   Creates Stripe checkout sessions for the Chrome Extension.
   Unlike the web checkout, this uses JWT auth instead of cookies.
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/libs/supabase-admin";
import { createCheckout, createCustomerPortal } from "@/libs/stripe";
import configFile from "@/config";

// POST — Create a Stripe Checkout Session
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const { priceId } = body;

    if (!priceId) {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    // Find the plan config
    const plan = configFile.stripe.plans.find((p) => p.priceId === priceId);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) {
      await supabase.from("profiles").insert({
        id: user.id,
        email: user.email,
      });
    }

    // Determine checkout mode
    // Day/Week/Lifetime = one-time payment
    // Month/Year = subscription
    const isRecurring = ["month", "year"].some((t) => priceId.includes(t));
    const mode = isRecurring ? "subscription" : "payment";

    const domain = `https://${configFile.domainName}`;
    const stripeSessionUrl = await createCheckout({
      priceId,
      mode: mode as "payment" | "subscription",
      successUrl: `${domain}/dashboard?checkout=success`,
      cancelUrl: `${domain}/#pricing`,
      clientReferenceId: user.id,
      user: {
        email: user.email,
        customerId: profile?.customer_id,
      },
    });

    if (!stripeSessionUrl) {
      return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
    }

    return NextResponse.json({
      url: stripeSessionUrl,
      mode,
      plan: plan.name,
    });
  } catch (error: any) {
    console.error("Extension checkout error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// GET — Get customer portal URL (for managing subscriptions)
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.customer_id) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
    }

    const domain = `https://${configFile.domainName}`;
    const portalUrl = await createCustomerPortal({
      customerId: profile.customer_id,
      returnUrl: `${domain}/dashboard`,
    });

    return NextResponse.json({ url: portalUrl });
  } catch (error: any) {
    console.error("Customer portal error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
