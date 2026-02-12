CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_call_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pending_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_args` text NOT NULL,
	`risk_level` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message_ref` text,
	`nonce` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_approvals_nonce_unique` ON `pending_approvals` (`nonce`);
--> statement-breakpoint
CREATE TABLE `schema_version` (
	`version` integer PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
