ALTER TABLE `accounts` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `budgets` ADD `color` text;--> statement-breakpoint
ALTER TABLE `budgets` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `color` text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE `profile` ADD `icon` text;