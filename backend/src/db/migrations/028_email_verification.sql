-- Email verification (docs/superpowers/specs/2026-10-17-email-verification-legal-design.md):
-- accounts from before it count as verified; sign-up records when the terms were accepted
UPDATE "user" SET "emailVerified" = true;
ALTER TABLE "user" ADD COLUMN terms_accepted_at TIMESTAMPTZ;
