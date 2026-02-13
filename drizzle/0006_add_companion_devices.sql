CREATE TABLE IF NOT EXISTS `companion_devices` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `platform` text NOT NULL,
  `push_token` text,
  `push_provider` text,
  `last_seen_at` integer,
  `created_at` integer NOT NULL
);
