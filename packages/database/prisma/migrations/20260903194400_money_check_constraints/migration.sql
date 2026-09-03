-- Non-negative money columns (defense in depth alongside application-level integer-cents handling)
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_cpm_nonneg" CHECK ("cpmCents" >= 0);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_daily_budget_nonneg" CHECK ("dailyBudgetCents" IS NULL OR "dailyBudgetCents" >= 0);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_total_budget_nonneg" CHECK ("totalBudgetCents" IS NULL OR "totalBudgetCents" >= 0);
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_cpm_nonneg" CHECK ("cpmCents" >= 0);
ALTER TABLE "developer_earnings_ledger" ADD CONSTRAINT "earnings_ledger_amount_nonneg" CHECK ("amountCents" >= 0);
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_nonneg" CHECK ("amountCents" >= 0);
ALTER TABLE "advertiser_billing_accounts" ADD CONSTRAINT "billing_balance_nonneg" CHECK ("balanceCents" >= 0);
ALTER TABLE "campaign_spend" ADD CONSTRAINT "campaign_spend_amount_nonneg" CHECK ("amountCents" >= 0);
