-- SOAP Journals table for disciple daily entries
-- Run this in Supabase SQL Editor

-- Create soap_journals table
CREATE TABLE IF NOT EXISTS soap_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  journal_date DATE NOT NULL,
  photo_url TEXT,
  ocr_text TEXT,
  scripture_reference TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per person per day
  UNIQUE(person_id, journal_date)
);

-- Create index for faster lookups
CREATE INDEX idx_soap_journals_person_date ON soap_journals(person_id, journal_date DESC);

-- Enable RLS
ALTER TABLE soap_journals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own journals
CREATE POLICY "Users can read own journals"
  ON soap_journals
  FOR SELECT
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: Coaches can read their disciples' journals
CREATE POLICY "Coaches can read disciple journals"
  ON soap_journals
  FOR SELECT
  USING (
    person_id IN (
      SELECT p.id FROM people p
      JOIN discipleship_connections dc ON dc.disciple_person_id = p.id
      JOIN people coach ON coach.id = dc.discipler_person_id
      WHERE coach.auth_user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own journals
CREATE POLICY "Users can insert own journals"
  ON soap_journals
  FOR INSERT
  WITH CHECK (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: Users can update their own journals
CREATE POLICY "Users can update own journals"
  ON soap_journals
  FOR UPDATE
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: Users can delete their own journals
CREATE POLICY "Users can delete own journals"
  ON soap_journals
  FOR DELETE
  USING (
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid()
    )
  );

-- Invite tokens table for account linking
CREATE TABLE IF NOT EXISTS invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);

-- RLS for invite_tokens
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone can read tokens (needed for signup flow)
CREATE POLICY "Anyone can read invite tokens"
  ON invite_tokens
  FOR SELECT
  USING (true);

-- Coaches can create invite tokens for their disciples
CREATE POLICY "Coaches can create invite tokens"
  ON invite_tokens
  FOR INSERT
  WITH CHECK (
    person_id IN (
      SELECT dc.disciple_person_id FROM discipleship_connections dc
      JOIN people coach ON coach.id = dc.discipler_person_id
      WHERE coach.auth_user_id = auth.uid()
    )
    OR
    person_id IN (
      SELECT id FROM people WHERE auth_user_id = auth.uid() AND is_admin = true
    )
  );

-- Allow updating tokens (marking as used)
CREATE POLICY "Anyone can update invite tokens"
  ON invite_tokens
  FOR UPDATE
  USING (true);

-- Create storage bucket for SOAP journal photos
-- Note: Run this via Supabase dashboard or API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('soap-photos', 'soap-photos', true);
