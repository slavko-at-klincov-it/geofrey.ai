CREATE TABLE IF NOT EXISTS `google_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `chat_id` text NOT NULL,
  `access_token` text NOT NULL,
  `refresh_token` text NOT NULL,
  `expires_at` integer NOT NULL,
  `scopes` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `google_tokens_chat_id_unique` ON `google_tokens` (`chat_id`);
