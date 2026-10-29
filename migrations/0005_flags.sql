ALTER TABLE `card` ADD `flag` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `flag_names` text DEFAULT '[]' NOT NULL;