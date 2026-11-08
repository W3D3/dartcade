-- A board's own seat colours for its light profile (the six colours the strips show for seats 1 to
-- 6); NULL keeps the built-in defaults.
ALTER TABLE boards ADD COLUMN light_seat_colors JSONB;
