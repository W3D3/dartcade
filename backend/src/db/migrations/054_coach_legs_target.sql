-- The coach target a row was graded for (user.preferences.coachTarget when it was built: auto or a
-- tier, coach/store.ts): a row whose target isn't the player's current one is stale, and its game is
-- rebuilt (coach/store.ts unbuilt), so changing the target regrades the legs.
ALTER TABLE coach_legs ADD COLUMN target TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE coach_legs ALTER COLUMN target DROP DEFAULT;
