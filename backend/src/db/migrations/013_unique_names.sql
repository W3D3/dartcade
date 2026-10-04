-- Names are unique handles, ignoring case: 2-20 letters, digits, '.', '_' or '-'.
-- Design: docs/superpowers/specs/2026-10-04-friends-design.md
-- Names that break the rules and all but the oldest of each duplicate group are flagged:
-- their owners pick a new name after signing in. The unique index covers the rest.
-- [[:alpha:]] follows the database locale: a C-locale database flags non-ASCII letters too
-- (the owner confirms the suggestion, which keeps the name).
ALTER TABLE "user" ADD COLUMN name_needs_change BOOLEAN NOT NULL DEFAULT false;
UPDATE "user" SET name_needs_change = true WHERE name !~ '^[[:alpha:][:digit:]._-]{2,20}$';
UPDATE "user" u SET name_needs_change = true
  FROM (SELECT id, row_number() OVER (PARTITION BY lower(name) ORDER BY "createdAt", id) AS n FROM "user") d
  WHERE d.id = u.id AND d.n > 1;
CREATE UNIQUE INDEX user_name_unique ON "user" (lower(name)) WHERE NOT name_needs_change;
