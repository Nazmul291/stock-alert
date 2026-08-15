import { getCachedSettings, getCachedSession } from "./shop-cache.server";

type SettingsValues = {
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  lowStockThreshold: number;
  digestEnabled: boolean;
  digestFrequency: string;
  digestTimezone: string;
  digestHour: number;
  digestDayOfWeek: number;
  brandLogoUrl: string;
  brandColor: string;
  brandSenderName: string;
  supplierLeadTimeDays: number;
  monitoringFilter: string;
  monitoringCollectionId: string;
  monitoringTags: string;
  limitedEditionTag: string;
  deadStockThresholdDays: number;
  alertDeliveryMode: string;
  alertBatchHour: number;
  lowStockMuted: boolean;
  outOfStockMuted: boolean;
  restockMuted: boolean;
};

export type SettingsData = {
  shop: string;
  plan: string;
  settings: SettingsValues;
};

export async function loadSettingsData(shop: string): Promise<SettingsData> {
  const [settings, storeSession] = await Promise.all([
    getCachedSettings(shop),
    getCachedSession(shop),
  ]);

  return {
    shop,
    plan: storeSession?.plan ?? "basic",
    settings: settings
      ? {
          autoHideEnabled: settings.autoHideEnabled,
          autoRepublishEnabled: settings.autoRepublishEnabled,
          lowStockThreshold: settings.lowStockThreshold,
          digestEnabled: settings.digestEnabled,
          digestFrequency: settings.digestFrequency,
          digestTimezone: settings.digestTimezone ?? "UTC",
          digestHour: settings.digestHour ?? 8,
          digestDayOfWeek: settings.digestDayOfWeek ?? 1,
          brandLogoUrl: settings.brandLogoUrl ?? "",
          brandColor: settings.brandColor ?? "#4f46e5",
          brandSenderName: settings.brandSenderName ?? "",
          supplierLeadTimeDays: settings.supplierLeadTimeDays ?? 7,
          monitoringFilter: settings.monitoringFilter ?? "all",
          monitoringCollectionId: settings.monitoringCollectionId ?? "",
          monitoringTags: settings.monitoringTags ?? "",
          limitedEditionTag: settings.limitedEditionTag ?? "limited-edition",
          deadStockThresholdDays: settings.deadStockThresholdDays ?? 60,
          alertDeliveryMode: settings.alertDeliveryMode ?? "daily",
          alertBatchHour: settings.alertBatchHour ?? 23,
          lowStockMuted: settings.lowStockMuted ?? false,
          outOfStockMuted: settings.outOfStockMuted ?? false,
          restockMuted: settings.restockMuted ?? false,
        }
      : {
          autoHideEnabled: false,
          autoRepublishEnabled: false,
          lowStockThreshold: 5,
          digestEnabled: true,
          digestFrequency: "weekly",
          digestTimezone: "UTC",
          digestHour: 8,
          digestDayOfWeek: 1,
          brandLogoUrl: "",
          brandColor: "#4f46e5",
          brandSenderName: "",
          supplierLeadTimeDays: 7,
          monitoringFilter: "all",
          monitoringCollectionId: "",
          monitoringTags: "",
          limitedEditionTag: "limited-edition",
          deadStockThresholdDays: 60,
          alertDeliveryMode: "daily",
          alertBatchHour: 23,
          lowStockMuted: false,
          outOfStockMuted: false,
          restockMuted: false,
        },
  };
}
