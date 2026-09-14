CREATE TABLE game_accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, recovery_hash TEXT NOT NULL, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE game_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES game_accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX game_sessions_expiry ON game_sessions(expires);
--> statement-breakpoint
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
