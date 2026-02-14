CREATE TABLE IF NOT EXISTS `webhooks` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `path` text NOT NULL,
  `secret` text,
  `template` text,
  `enabled` integer NOT NULL DEFAULT true,
  `chat_id` text NOT NULL DEFAULT 'default',
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `webhooks_path_unique` ON `webhooks` (`path`);
