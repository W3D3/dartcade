-- Account-wide game and caller preferences (Settings: Game preferences, Caller), only the ones
-- set, as the API checked them (schema/api-v1.yaml, Preferences). Volume stays per device.
ALTER TABLE "user" ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
