-- Non-negative money / reward-unit / cap columns for the sponsorship domain
-- (defense in depth alongside application-level integer handling; mirrors
-- 20260903194400_money_check_constraints)
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_reward_amount_positive" CHECK ("rewardAmountUnits" > 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_charge_nonneg" CHECK ("sponsorChargeCents" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_daily_budget_nonneg" CHECK ("dailyBudgetCents" IS NULL OR "dailyBudgetCents" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_total_budget_nonneg" CHECK ("totalBudgetCents" IS NULL OR "totalBudgetCents" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_dev_daily_cap_nonneg" CHECK ("developerDailyCap" IS NULL OR "developerDailyCap" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_dev_lifetime_cap_nonneg" CHECK ("developerLifetimeCap" IS NULL OR "developerLifetimeCap" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_freq_cap_nonneg" CHECK ("frequencyCapPerDay" IS NULL OR "frequencyCapPerDay" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_carry_nonneg" CHECK ("spendCarryMilliCents" >= 0);
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_date_range" CHECK ("endDate" IS NULL OR "endDate" > "startDate");
ALTER TABLE "sponsorship_campaign_spend" ADD CONSTRAINT "sponsorship_campaign_spend_amount_nonneg" CHECK ("amountCents" >= 0);
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "reward_ledger_amount_nonneg" CHECK ("amountUnits" >= 0);
ALTER TABLE "developer_reward_wallets" ADD CONSTRAINT "reward_wallets_available_nonneg" CHECK ("availableUnits" >= 0);
ALTER TABLE "developer_reward_wallets" ADD CONSTRAINT "reward_wallets_pending_nonneg" CHECK ("pendingUnits" >= 0);
