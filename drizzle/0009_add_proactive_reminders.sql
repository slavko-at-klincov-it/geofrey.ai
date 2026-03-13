CREATE TABLE IF NOT EXISTS `proactive_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`external_id` text NOT NULL,
	`reminded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `proactive_type_external` ON `proactive_reminders` (`type`, `external_id`);
