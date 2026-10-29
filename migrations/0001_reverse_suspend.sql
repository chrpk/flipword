ALTER TABLE `card` ADD `note_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `card` SET `note_id` = `id` WHERE `note_id` = '';--> statement-breakpoint
ALTER TABLE `card` ADD `reverse` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `card` ADD `suspended` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `card_note_direction_idx` ON `card` (`note_id`,`reverse`);--> statement-breakpoint
ALTER TABLE `deck` ADD `reverse_cards` integer DEFAULT false NOT NULL;
