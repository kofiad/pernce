-- XOF and XAF went from 0 to 2 decimals (core currencyDecimals), so whole
-- francs become centimes. updated_at stays: the server's copies of these
-- rows are old payloads, which sync scales the same way on the way in
-- (src/sync/collections.ts, legacyMinorFactor).
UPDATE `accounts` SET `opening_balance` = `opening_balance` * 100 WHERE `currency` IN ('XOF', 'XAF');--> statement-breakpoint
UPDATE `transactions` SET `amount` = `amount` * 100, `fee` = `fee` * 100 WHERE `currency` IN ('XOF', 'XAF');--> statement-breakpoint
UPDATE `transactions` SET `transfer_amount` = `transfer_amount` * 100 WHERE `transfer_currency` IN ('XOF', 'XAF') AND `transfer_amount` IS NOT NULL;--> statement-breakpoint
UPDATE `budgets` SET `amount` = `amount` * 100 WHERE `currency` IN ('XOF', 'XAF');
