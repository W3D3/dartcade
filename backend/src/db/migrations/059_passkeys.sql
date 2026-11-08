-- better-auth's passkey plugin (auth/passkeys.ts): one row per WebAuthn credential. Only the public key
-- and credential id are stored; the private key and any biometrics stay on the player's device.
-- Column names are camelCase like the other better-auth tables, except last_used_at, which auth/passkeys.ts adds.
CREATE TABLE passkey (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  "publicKey"    TEXT NOT NULL,
  "userId"       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "credentialID" TEXT NOT NULL UNIQUE,
  counter        INTEGER NOT NULL,
  "deviceType"   TEXT NOT NULL,
  "backedUp"     BOOLEAN NOT NULL,
  transports     TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  aaguid         TEXT,
  last_used_at   TIMESTAMPTZ
);
CREATE INDEX passkey_user ON passkey ("userId");
