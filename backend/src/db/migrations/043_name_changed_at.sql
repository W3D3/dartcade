-- When the user last renamed themselves (users/account.ts renameUser, cooldown); null: never, so the first rename is free.
ALTER TABLE "user" ADD COLUMN name_changed_at TIMESTAMPTZ;
