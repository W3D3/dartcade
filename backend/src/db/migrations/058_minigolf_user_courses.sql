-- User-made minigolf courses: visibility is official (admin-made), private (a player's draft or
-- unpublished course) or public (a player's published course). Friends-only is not offered yet.
-- Existing rows are all official. Owners' rows go with their account (the FK already cascades).
ALTER TABLE minigolf_courses
  ADD CONSTRAINT minigolf_courses_visibility_check CHECK (visibility IN ('official', 'private', 'public'));
CREATE INDEX minigolf_courses_owner_idx ON minigolf_courses (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX minigolf_holes_owner_idx ON minigolf_holes (owner_user_id) WHERE owner_user_id IS NOT NULL;
