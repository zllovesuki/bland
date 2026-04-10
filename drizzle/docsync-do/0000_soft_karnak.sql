CREATE TABLE `snapshot_chunks` (
	`chunk_index` integer PRIMARY KEY NOT NULL,
	`data` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshot_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`chunk_count` integer NOT NULL,
	`total_bytes` integer NOT NULL,
	`snapshot_at` text NOT NULL
);
