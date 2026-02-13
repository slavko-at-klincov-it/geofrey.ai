CREATE TABLE `memory_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` text NOT NULL,
	`created_at` integer NOT NULL
);
