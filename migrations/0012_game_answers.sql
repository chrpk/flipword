ALTER TABLE `game_session` ADD `mode` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_log` ADD `format` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_log` ADD `hints` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_log` ADD `attempt` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_log` ADD `latency_ms` integer;--> statement-breakpoint
ALTER TABLE `practice_log` ADD `near_miss` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_log` ADD `confused_with` text;--> statement-breakpoint
ALTER TABLE `review_log` ADD `source` text DEFAULT 'study' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `game_reviews` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `lenient_accents` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Match now refills its board from a longer queue, so times from the old 6-pair board are a different best.
UPDATE `game_session` SET `mode` = 'classic' WHERE `game` = 'match';--> statement-breakpoint
-- Spell it now scores 10 points per word (less with hints); old games counted words, all of them unaided.
UPDATE `game_session` SET `score` = `score` * 10 WHERE `game` = 'spell';
