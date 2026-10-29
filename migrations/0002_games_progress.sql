CREATE TABLE `game_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`game` text NOT NULL,
	`score` integer NOT NULL,
	`correct` integer NOT NULL,
	`wrong` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_session_deck_idx` ON `game_session` (`deck_id`,`game`);--> statement-breakpoint
CREATE TABLE `practice_log` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`correct` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_log_card_idx` ON `practice_log` (`card_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `practice_log_user_idx` ON `practice_log` (`user_id`,`created_at`);