CREATE TABLE `published_pages` (
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`workspace_id`, `page_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_published_pages_page` ON `published_pages` (`page_id`);--> statement-breakpoint
CREATE TABLE `workspace_sites` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`home_page_id` text,
	`published_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_sites_slug_unique` ON `workspace_sites` (`slug`);