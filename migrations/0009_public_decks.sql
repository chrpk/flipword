ALTER TABLE `deck` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX `deck_visibility_idx` ON `deck` (`visibility`,`updated_at`);