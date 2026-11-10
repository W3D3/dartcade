-- Which effects of the built-in light profile a board has switched on or off, by the effect's key
-- (shared/lights ruleKey) and only where it differs from the default. NULL: every effect as shipped.
-- A profile of the player's own keeps each effect's `enabled` in its rules.
ALTER TABLE boards ADD COLUMN light_effect_overrides JSONB;
