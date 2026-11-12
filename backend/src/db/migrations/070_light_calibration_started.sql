-- The calibration.started light effect is gone (the lights stay as they are while the board calibrates):
-- drop it from players' own profiles and from a board's on/off overrides of the built-in one.
UPDATE light_profiles
SET rules = COALESCE((SELECT jsonb_agg(r) FROM jsonb_array_elements(rules) r WHERE r->'when'->>'trigger' <> 'calibration.started'), '[]'::jsonb)
WHERE rules @> '[{"when": {"trigger": "calibration.started"}}]';
UPDATE boards SET light_effect_overrides = light_effect_overrides - 'calibration.started|any||'
WHERE light_effect_overrides ? 'calibration.started|any||';
