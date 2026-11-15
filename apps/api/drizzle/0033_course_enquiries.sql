-- Course website: enquiries sent from the public "Enroll / Call me" forms. Phone and email are encrypted.
CREATE TABLE IF NOT EXISTS course_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  phone_enc text NOT NULL,
  email_enc text,
  course_slug varchar(80),
  message varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'ENROLLED', 'CLOSED')),
  note varchar(500),
  ip varchar(64),
  handled_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_enquiries_status_idx ON course_enquiries(status, created_at DESC);
