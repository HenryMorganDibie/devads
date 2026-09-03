export const config = {
  port: Number(process.env.AD_SERVER_PORT ?? 4000),
  host: process.env.AD_SERVER_HOST ?? "0.0.0.0",
  defaultDeveloperRevenueShareBps: Number(process.env.DEFAULT_DEVELOPER_REVENUE_SHARE_BPS ?? 6000),
  defaultCpmCents: Number(process.env.DEFAULT_CPM_CENTS ?? 1200),
  defaultPayoutThresholdCents: Number(process.env.DEFAULT_PAYOUT_THRESHOLD_CENTS ?? 2000),
  platformDefaultCurrency: process.env.PLATFORM_DEFAULT_CURRENCY ?? "USD",
  frequencyCap: {
    defaultDailyCapPerCampaign: Number(process.env.DEFAULT_DAILY_CAP_PER_CAMPAIGN ?? 3),
    defaultDailyCapGlobal: Number(process.env.DEFAULT_DAILY_CAP_GLOBAL ?? 10),
  },
  minViewDurationMsForPayableImpression: Number(process.env.MIN_VIEW_DURATION_MS ?? 1500),
};
