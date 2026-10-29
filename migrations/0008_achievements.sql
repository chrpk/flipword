CREATE TABLE `achievement` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	`seen_at` integer,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
