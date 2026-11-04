-- Friends & privacy: who sees when you were last online and your friends list, whether search finds you (Invisible is migration 016).
ALTER TABLE "user"
  ADD COLUMN show_last_online TEXT NOT NULL DEFAULT 'friends' CHECK (show_last_online IN ('friends', 'nobody')),
  ADD COLUMN friends_visibility TEXT NOT NULL DEFAULT 'friends' CHECK (friends_visibility IN ('friends', 'me')),
  ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT true,
  -- Set when the last /ws/me socket closes after the offline grace (friends/service.ts), at most every few minutes
  ADD COLUMN last_seen_at TIMESTAMPTZ;
