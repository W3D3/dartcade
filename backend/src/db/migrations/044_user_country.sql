-- The country a player shows next to their name (ISO 3166-1 alpha-2, validated by the API); null = none.
ALTER TABLE "user" ADD COLUMN country TEXT;
