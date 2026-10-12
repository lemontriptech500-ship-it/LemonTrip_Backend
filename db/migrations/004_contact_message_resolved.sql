ALTER TABLE contact_messages
  DROP CONSTRAINT IF EXISTS contact_messages_status_check;

ALTER TABLE contact_messages
  ADD CONSTRAINT contact_messages_status_check
  CHECK (status IN ('received', 'email_sent', 'email_failed', 'resolved'));
