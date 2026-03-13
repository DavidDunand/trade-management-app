-- Add columns to group_entities
ALTER TABLE group_entities ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'other';
ALTER TABLE group_entities ADD COLUMN IF NOT EXISTS ssi text;
ALTER TABLE group_entities ADD COLUMN IF NOT EXISTS short_name text;

-- Backfill from current names
UPDATE group_entities SET entity_type = 'valeur',  ssi = 'Euroclear 41420', short_name = 'VALEUR SECURITIES AG'      WHERE legal_name ILIKE '%valeur%';
UPDATE group_entities SET entity_type = 'riverrock', short_name = 'RIVERROCK SECURITIES SAS' WHERE legal_name ILIKE '%riverrock%';

-- group_entity_contacts table
CREATE TABLE IF NOT EXISTS group_entity_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_entity_id uuid NOT NULL REFERENCES group_entities(id) ON DELETE CASCADE,
  first_name      text NOT NULL,
  family_name     text NOT NULL,
  email           text,
  role            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_entity_contacts_entity_id_idx
  ON group_entity_contacts(group_entity_id);

ALTER TABLE group_entity_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read group_entity_contacts"
  ON group_entity_contacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated can insert group_entity_contacts"
  ON group_entity_contacts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated can update group_entity_contacts"
  ON group_entity_contacts FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated can delete group_entity_contacts"
  ON group_entity_contacts FOR DELETE USING (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';
