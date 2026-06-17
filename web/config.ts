import themes from "daisyui/src/theming/themes";
import { ConfigProps } from "./types/config";

const config = {
  // REQUIRED
  appName: "LinkedApply Pro",
  // REQUIRED: a short description of your app for SEO tags
  appDescription:
    "AI-Powered LinkedIn Job Auto-Applier Chrome Extension — Apply to 100+ jobs in under an hour. Smart form filling, AI resume tailoring, and Kanban job tracker.",
  // REQUIRED (no https://, not trailing slash at the end, just the naked domain)
  domainName: "linkedapplypro.com",
  crisp: {
    id: "",
    onlyShowOnRoutes: ["/"],
  },
  stripe: {
    plans: [
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_free_trial_dev"
            : "price_free_trial",
        name: "Free Trial",
        description: "Try LinkedApply Pro for 3 days",
        price: 0,
        features: [
          { name: "5 applications/day" },
          { name: "Basic job filters" },
          { name: "Local job history" },
          { name: "3 search terms" },
        ],
      },
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_day_dev"
            : "price_day",
        name: "Day Pass",
        description: "Perfect for a focused day of applying",
        price: 2.99,
        priceAnchor: 4.99,
        features: [
          { name: "Unlimited applications" },
          { name: "AI-powered answers" },
          { name: "All job filters" },
          { name: "Speed control" },
        ],
      },
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_week_dev"
            : "price_week",
        name: "Weekly",
        description: "A week of unlimited job hunting",
        price: 7.99,
        priceAnchor: 14.99,
        features: [
          { name: "Everything in Day Pass" },
          { name: "AI resume tailoring" },
          { name: "Job match scoring" },
          { name: "Cloud job sync" },
        ],
      },
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_month_dev"
            : "price_month",
        isFeatured: true,
        name: "Monthly",
        description: "Most popular — full power for your job search",
        price: 14.99,
        priceAnchor: 29.99,
        features: [
          { name: "Everything in Weekly" },
          { name: "AI cover letter generation" },
          { name: "ATS keyword analysis" },
          { name: "Kanban job tracker" },
          { name: "Analytics dashboard" },
          { name: "Follow-up reminders" },
          { name: "Email notifications" },
          { name: "Data export (CSV/PDF)" },
        ],
      },
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_year_dev"
            : "price_year",
        name: "Yearly",
        description: "Best value — save 44% over monthly",
        price: 99.99,
        priceAnchor: 179.88,
        features: [
          { name: "Everything in Monthly" },
          { name: "Priority support" },
          { name: "Early access to new features" },
          { name: "Save 44% vs monthly" },
        ],
      },
      {
        priceId:
          process.env.NODE_ENV === "development"
            ? "price_lifetime_dev"
            : "price_lifetime",
        name: "Lifetime",
        description: "Pay once, apply forever",
        price: 199.99,
        priceAnchor: 499.99,
        features: [
          { name: "Everything in Yearly" },
          { name: "Lifetime updates" },
          { name: "Lifetime priority support" },
          { name: "One-time payment" },
        ],
      },
    ],
  },
  aws: {
    bucket: "linkedapply-pro",
    bucketUrl: `https://linkedapply-pro.s3.amazonaws.com/`,
    cdn: "https://cdn.linkedapplypro.com/",
  },
  mailgun: {
    subdomain: "mg",
    fromNoReply: `LinkedApply Pro <noreply@mg.linkedapplypro.com>`,
    fromAdmin: `LinkedApply Pro <hello@mg.linkedapplypro.com>`,
    supportEmail: "support@linkedapplypro.com",
    forwardRepliesTo: "",
  },
  colors: {
    theme: "dark",
    main: "#6366f1", // Indigo 500 — matches extension design system
  },
  auth: {
    loginUrl: "/signin",
    callbackUrl: "/dashboard",
  },
} as ConfigProps;

export default config;
