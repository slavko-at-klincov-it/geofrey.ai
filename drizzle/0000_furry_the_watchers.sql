CREATE TABLE `shipment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`event_type` text NOT NULL,
	`description` text,
	`location` text,
	`lat` real,
	`lon` real,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`tracking_number` text NOT NULL,
	`type` text NOT NULL,
	`carrier` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`origin` text,
	`destination` text,
	`eta` integer,
	`current_lat` real,
	`current_lon` real,
	`metadata` text,
	`chat_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vessel_positions` (
	`mmsi` text PRIMARY KEY NOT NULL,
	`vessel_name` text,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`speed` real,
	`heading` real,
	`updated_at` integer NOT NULL
);
