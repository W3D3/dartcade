-- A finished challenge pays when it is claimed on the Progress page, or by itself once its period
-- has ended. The ones finished before this were paid on finishing: they count as claimed.
ALTER TABLE user_challenges ADD COLUMN claimed_at TIMESTAMPTZ;
UPDATE user_challenges SET claimed_at = completed_at WHERE completed_at IS NOT NULL;
