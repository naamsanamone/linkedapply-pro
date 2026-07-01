-- ============================================================
-- LinkedApply Pro — Supabase Database Schema
-- Run this in Supabase SQL Editor to set up all required tables
-- ============================================================

-- ---- Usage Logs (daily aggregates per user) ----
CREATE TABLE IF NOT EXISTS usage_logs (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  applications_count INTEGER DEFAULT 0,
  external_count     INTEGER DEFAULT 0,
  skipped_count      INTEGER DEFAULT 0,
  failed_count       INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date ON usage_logs(user_id, date);

-- ---- Activity Log (individual events for detailed analytics) ----
CREATE TABLE IF NOT EXISTS activity_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,        -- 'applied', 'external', 'skipped', 'failed'
  job_id     TEXT,                 -- LinkedIn job ID
  job_status TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at DESC);

-- ---- Synced Jobs (cloud backup of applied jobs) ----
CREATE TABLE IF NOT EXISTS synced_jobs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id              TEXT NOT NULL,       -- LinkedIn job ID
  title               TEXT DEFAULT '',
  company             TEXT DEFAULT '',
  location            TEXT DEFAULT '',
  work_style          TEXT DEFAULT '',
  description         TEXT DEFAULT '',
  experience_required TEXT DEFAULT '',
  job_link            TEXT DEFAULT '',
  external_link       TEXT DEFAULT '',
  date_applied        TEXT,
  date_listed         TEXT,
  status              TEXT DEFAULT 'applied',
  match_score         INTEGER,
  resume_used         TEXT DEFAULT '',
  hr_name             TEXT DEFAULT '',
  hr_link             TEXT DEFAULT '',
  notes               TEXT DEFAULT '',
  skills_extracted    JSONB,
  questions_answered  JSONB DEFAULT '[]',
  synced_at           TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_jobs_user ON synced_jobs(user_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_synced_jobs_status ON synced_jobs(user_id, status);

-- ---- AI Usage Logs (daily AI request counts per user) ----
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  request_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage_logs(user_id, date);

-- ---- Row Level Security (RLS) ----
-- Users can only access their own data

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Usage Logs policies
CREATE POLICY "Users can view own usage" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage" ON usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own usage" ON usage_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- Activity Log policies
CREATE POLICY "Users can view own activity" ON activity_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Synced Jobs policies
CREATE POLICY "Users can view own jobs" ON synced_jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON synced_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON synced_jobs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own jobs" ON synced_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- AI Usage policies
CREATE POLICY "Users can view own AI usage" ON ai_usage_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own AI usage" ON ai_usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own AI usage" ON ai_usage_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- ---- Profiles table (linked to auth.users) ----
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  name            TEXT,
  image           TEXT,
  customer_id     TEXT,          -- Stripe customer ID
  price_id        TEXT,          -- Active Stripe price ID
  has_access      BOOLEAN DEFAULT false,
  plan_name       TEXT DEFAULT 'free_trial',
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  plan_status     TEXT DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ---- Subscription Events (audit trail for billing) ----
CREATE TABLE IF NOT EXISTS subscription_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,         -- 'checkout_completed', 'plan_changed', 'cancel_scheduled', etc.
  plan_name   TEXT,
  price_id    TEXT,
  amount      NUMERIC(10,2),
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_user ON subscription_events(user_id, created_at DESC);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription events" ON subscription_events
  FOR SELECT USING (auth.uid() = user_id);
-- Insert handled by service_role key in webhook (no RLS insert policy for users)

