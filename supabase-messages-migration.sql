-- Messages: disciple ↔ coach greetings, prayers, and notes
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  to_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'greeting' CHECK (kind IN ('greeting','prayer','note')),
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_person_id, created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own messages" ON messages;
CREATE POLICY "Read own messages" ON messages FOR SELECT USING (
  to_person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
  OR from_person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Send messages as self" ON messages;
CREATE POLICY "Send messages as self" ON messages FOR INSERT WITH CHECK (
  from_person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Recipients can mark messages read" ON messages;
CREATE POLICY "Recipients can mark messages read" ON messages FOR UPDATE USING (
  to_person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())
);
