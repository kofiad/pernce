CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`institution` text,
	`currency` text NOT NULL,
	`color` text DEFAULT 'primary' NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`category_id` text NOT NULL,
	`period` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_category_period_idx` ON `budgets` (`category_id`,`period`) WHERE deleted = 0;--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text NOT NULL,
	`icon` text DEFAULT 'more' NOT NULL,
	`spending_type` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_sort_idx` ON `categories` (`kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`currency` text PRIMARY KEY NOT NULL,
	`rate_to_usd` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`base_currency` text DEFAULT 'USD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`currency` text NOT NULL,
	`rate_to_usd` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_overrides_currency_idx` ON `rate_overrides` (`currency`) WHERE deleted = 0;--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`transfer_account_id` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`transfer_amount` integer,
	`transfer_currency` text,
	`exchange_rate` text,
	`fee` integer DEFAULT 0 NOT NULL,
	`note` text,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_occurred_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_transfer_account_idx` ON `transactions` (`transfer_account_id`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);