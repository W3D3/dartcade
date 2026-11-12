-- The code in a tournament's invite link (#/tournaments/join/<code>), made like a lobby code.
-- Tournaments made before it have none: only new ones are shared by link.
ALTER TABLE tournaments ADD COLUMN invite_code TEXT UNIQUE;
