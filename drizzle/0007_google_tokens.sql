CREATE TABLE IF NOT EXISTS `google_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` integer,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL
);
