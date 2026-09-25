ALTER TABLE game_accounts ADD COLUMN email TEXT;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN pending_email TEXT;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN email_token_hash TEXT;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN email_token_expires INTEGER;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN reset_token_hash TEXT;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN reset_token_expires INTEGER;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE game_accounts ADD COLUMN marketing_consented_at INTEGER;
--> statement-breakpoint
CREATE UNIQUE INDEX game_accounts_verified_email ON game_accounts(email) WHERE email IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX game_accounts_email_token ON game_accounts(email_token_hash) WHERE email_token_hash IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX game_accounts_reset_token ON game_accounts(reset_token_hash) WHERE reset_token_hash IS NOT NULL;
