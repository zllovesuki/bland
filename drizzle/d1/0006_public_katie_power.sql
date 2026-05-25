ALTER TABLE `pages` ADD `archive_root_id` text;--> statement-breakpoint
CREATE INDEX `idx_pages_archive_operation` ON `pages` (`workspace_id`,`archive_root_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `idx_pages_trash_roots` ON `pages` (`workspace_id`,`archived_at`) WHERE "pages"."archived_at" IS NOT NULL AND "pages"."archive_root_id" = "pages"."id";