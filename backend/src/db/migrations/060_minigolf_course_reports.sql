-- Reports on published user courses (one per person per course), and a moderator's reason on a
-- course they took out of play. A moderated course cannot be published again until it is allowed.
CREATE TABLE minigolf_course_reports (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES minigolf_courses (id) ON DELETE CASCADE,
  reporter_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ
);
-- One open report per person per course: a dismissed one frees the person to report again
CREATE UNIQUE INDEX minigolf_course_reports_once_idx ON minigolf_course_reports (course_id, reporter_user_id) WHERE dismissed_at IS NULL;
CREATE INDEX minigolf_course_reports_open_idx ON minigolf_course_reports (course_id) WHERE dismissed_at IS NULL;
ALTER TABLE minigolf_courses
  ADD COLUMN moderation_reason TEXT,
  ADD COLUMN moderated_at TIMESTAMPTZ;
