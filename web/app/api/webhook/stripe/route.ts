/* ============================================================
   LinkedApply Pro — Extended Stripe Webhook
   Handles all subscription lifecycle events with:
   - Plan provisioning (grant/revoke)
   - Subscription tracking (plan changes, cancellations)
   - Welcome & notification emails
   - Trial expiry management
   - Day/Week pass auto-expiry
   ============================================================ */

import { NextResponse, NextRequest } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { SupabaseClient } from "@supabase/supabase-js";
import configFile from "@/config";
import { findCheckoutSession } from "@/libs/stripe";
import { sendEmail } from "@/libs/mailgun";
import {
  PLAN_DURATIONS,
  resolvePlanName,
  getWelcomeEmail,
  getPaymentFailedEmail,
  getSubscriptionCanceledEmail,
  getPlanUpgradedEmail,
} from "@/libs/subscription-helpers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-08-16",
  typescript: true,
});
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = headers().get("stripe-signature")!;

  const supabase = new SupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify Stripe signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const eventType = event.type;

  try {
    switch (eventType) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✅ CHECKOUT COMPLETED — Grant access
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "checkout.session.completed": {
        const stripeObject = event.data.object as Stripe.Checkout.Session;
        const session = await findCheckoutSession(stripeObject.id);

        const customerId = session?.customer as string;
        const priceId = session?.line_items?.data[0]?.price?.id;
        const userId = stripeObject.client_reference_id;
        const plan = configFile.stripe.plans.find((p) => p.priceId === priceId);

        if (!plan || !userId) break;

        const planName = resolvePlanName(priceId!);
        const duration = PLAN_DURATIONS[planName];

        // Calculate expiry for time-limited plans (day, week)
        let expiresAt: string | null = null;
        if (duration && duration > 0) {
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + duration);
          expiresAt = expiry.toISOString();
        }

        // Update profile with plan info
        await supabase
          .from("profiles")
          .update({
            customer_id: customerId,
            price_id: priceId,
            has_access: true,
            plan_name: planName,
            plan_started_at: new Date().toISOString(),
            plan_expires_at: expiresAt,
            plan_status: "active",
          })
          .eq("id", userId);

        // Log subscription event
        await supabase.from("subscription_events").insert({
          user_id: userId,
          event_type: "checkout_completed",
          plan_name: planName,
          price_id: priceId,
          amount: plan.price,
          metadata: { session_id: stripeObject.id },
        });

        // Send welcome email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", userId)
          .single();

        if (profile?.email) {
          try {
            const emailContent = getWelcomeEmail(planName, plan.price);
            await sendEmail({
              to: profile.email,
              subject: `Welcome to LinkedApply Pro ${plan.name}! 🚀`,
              html: emailContent,
            });
          } catch (e: any) {
            console.error("Welcome email failed:", e?.message);
          }
        }

        console.log(`✅ Checkout completed: ${planName} for user ${userId}`);
        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📝 SUBSCRIPTION UPDATED — Plan change
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "customer.subscription.updated": {
        const stripeObject = event.data.object as Stripe.Subscription;
        const customerId = stripeObject.customer as string;
        const newPriceId = stripeObject.items.data[0]?.price?.id;
        const cancelAtPeriodEnd = stripeObject.cancel_at_period_end;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("customer_id", customerId)
          .single();

        if (!profile) break;

        if (cancelAtPeriodEnd) {
          // User scheduled cancellation
          await supabase
            .from("profiles")
            .update({ plan_status: "cancel_scheduled" })
            .eq("customer_id", customerId);

          await supabase.from("subscription_events").insert({
            user_id: profile.id,
            event_type: "cancel_scheduled",
            plan_name: profile.plan_name,
            metadata: { cancel_at: stripeObject.cancel_at },
          });
        } else if (newPriceId && newPriceId !== profile.price_id) {
          // Plan upgrade/downgrade
          const newPlanName = resolvePlanName(newPriceId);
          await supabase
            .from("profiles")
            .update({
              price_id: newPriceId,
              plan_name: newPlanName,
              plan_status: "active",
            })
            .eq("customer_id", customerId);

          await supabase.from("subscription_events").insert({
            user_id: profile.id,
            event_type: "plan_changed",
            plan_name: newPlanName,
            price_id: newPriceId,
            metadata: { from_plan: profile.plan_name },
          });

          // Send upgrade email
          if (profile.email) {
            try {
              const emailContent = getPlanUpgradedEmail(profile.plan_name, newPlanName);
              await sendEmail({
                to: profile.email,
                subject: `Plan upgraded to ${newPlanName}! ✨`,
                html: emailContent,
              });
            } catch (e: any) {
              console.error("Upgrade email failed:", e?.message);
            }
          }
        }
        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ❌ SUBSCRIPTION DELETED — Revoke access
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "customer.subscription.deleted": {
        const stripeObject = event.data.object as Stripe.Subscription;
        const customerId = stripeObject.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("customer_id", customerId)
          .single();

        if (!profile) break;

        await supabase
          .from("profiles")
          .update({
            has_access: false,
            plan_status: "canceled",
          })
          .eq("customer_id", customerId);

        await supabase.from("subscription_events").insert({
          user_id: profile.id,
          event_type: "subscription_canceled",
          plan_name: profile.plan_name,
        });

        // Send cancellation email
        if (profile.email) {
          try {
            const emailContent = getSubscriptionCanceledEmail(profile.plan_name);
            await sendEmail({
              to: profile.email,
              subject: "Your LinkedApply Pro subscription has ended",
              html: emailContent,
            });
          } catch (e: any) {
            console.error("Cancellation email failed:", e?.message);
          }
        }

        console.log(`❌ Subscription canceled for customer ${customerId}`);
        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 💰 INVOICE PAID — Recurring payment
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "invoice.paid": {
        const stripeObject = event.data.object as Stripe.Invoice;
        const priceId = stripeObject.lines.data[0]?.price?.id;
        const customerId = stripeObject.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("customer_id", customerId)
          .single();

        if (!profile || profile.price_id !== priceId) break;

        await supabase
          .from("profiles")
          .update({
            has_access: true,
            plan_status: "active",
          })
          .eq("customer_id", customerId);

        await supabase.from("subscription_events").insert({
          user_id: profile.id,
          event_type: "invoice_paid",
          plan_name: profile.plan_name,
          price_id: priceId,
          amount: (stripeObject.amount_paid || 0) / 100,
        });

        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ⚠️ INVOICE FAILED — Payment issue
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "invoice.payment_failed": {
        const stripeObject = event.data.object as Stripe.Invoice;
        const customerId = stripeObject.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("customer_id", customerId)
          .single();

        if (!profile) break;

        await supabase
          .from("profiles")
          .update({ plan_status: "past_due" })
          .eq("customer_id", customerId);

        await supabase.from("subscription_events").insert({
          user_id: profile.id,
          event_type: "payment_failed",
          plan_name: profile.plan_name,
          metadata: { attempt: stripeObject.attempt_count },
        });

        // Send payment failed email
        if (profile.email) {
          try {
            const emailContent = getPaymentFailedEmail(profile.plan_name);
            await sendEmail({
              to: profile.email,
              subject: "⚠️ Payment failed — update your card",
              html: emailContent,
            });
          } catch (e: any) {
            console.error("Payment failed email failed:", e?.message);
          }
        }

        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🕐 CHECKOUT EXPIRED
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "checkout.session.expired": {
        // User didn't complete checkout — no action needed
        break;
      }

      default:
        // Unhandled event type
        console.log(`Unhandled webhook event: ${eventType}`);
    }
  } catch (e: any) {
    console.error("Stripe webhook error:", e.message);
  }

  return NextResponse.json({});
}
