CREATE TABLE IF NOT EXISTS `privacy_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`pattern` text NOT NULL,
	`action` text NOT NULL,
	`scope` text NOT NULL DEFAULT 'global',
	`label` text,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
