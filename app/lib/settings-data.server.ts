import { getCachedSettings, getCachedSession } from "./shop-cache.server";

type SettingsValues = {
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  lowStockThreshold: number;
  digestEnabled: boolean;
  digestFrequency: string;
  brandLogoUrl: string;
  brandColor: string;
  brandSenderName: string;
  supplierLeadTimeDays: number;
  monitoringFilter: string;
  monitoringCollectionId: string;
  monitoringTags: string;
  limitedEditionTag: string;
  deadStockThresholdDays: number;
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
          brandLogoUrl: settings.brandLogoUrl ?? "",
          brandColor: settings.brandColor ?? "#4f46e5",
          brandSenderName: settings.brandSenderName ?? "",
          supplierLeadTimeDays: settings.supplierLeadTimeDays ?? 7,
          monitoringFilter: settings.monitoringFilter ?? "all",
          monitoringCollectionId: settings.monitoringCollectionId ?? "",
          monitoringTags: settings.monitoringTags ?? "",
          limitedEditionTag: settings.limitedEditionTag ?? "limited-edition",
          deadStockThresholdDays: settings.deadStockThresholdDays ?? 60,
        }
      : {
          autoHideEnabled: false,
          autoRepublishEnabled: false,
          lowStockThreshold: 5,
          digestEnabled: true,
          digestFrequency: "weekly",
          brandLogoUrl: "",
          brandColor: "#4f46e5",
          brandSenderName: "",
          supplierLeadTimeDays: 7,
          monitoringFilter: "all",
          monitoringCollectionId: "",
          monitoringTags: "",
          limitedEditionTag: "limited-edition",
          deadStockThresholdDays: 60,
        },
  };
}
