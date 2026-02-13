CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `chat_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
