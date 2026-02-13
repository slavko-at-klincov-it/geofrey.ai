CREATE TABLE `cron_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`chat_id` text NOT NULL,
	`task` text NOT NULL,
	`schedule` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 5 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
