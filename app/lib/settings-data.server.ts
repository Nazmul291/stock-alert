import { getCachedSettings, getCachedSession } from "./shop-cache.server";

type SettingsValues = {
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  lowStockThreshold: number;
  emailNotifications: boolean;
  slackNotifications: boolean;
  notificationEmail: string;
  slackWebhookUrl: string;
  whatsappNotifications: boolean;
  whatsappPhone: string;
  whatsappPhoneNumberId: string;
  whatsappAccessToken: string;
  digestEnabled: boolean;
  digestFrequency: string;
  brandLogoUrl: string;
  brandColor: string;
  brandSenderName: string;
  outboundWebhookUrl: string;
  supplierLeadTimeDays: number;
  monitoringFilter: string;
  monitoringCollectionId: string;
  monitoringTags: string;
};

export type SettingsData = {
  shop: string;
  plan: string;
  storeEmail: string | null;
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
    storeEmail: storeSession?.email ?? null,
    settings: settings
      ? {
          autoHideEnabled: settings.autoHideEnabled,
          autoRepublishEnabled: settings.autoRepublishEnabled,
          lowStockThreshold: settings.lowStockThreshold,
          emailNotifications: settings.emailNotifications,
          slackNotifications: settings.slackNotifications,
          notificationEmail: settings.notificationEmail ?? "",
          slackWebhookUrl: settings.slackWebhookUrl ?? "",
          whatsappNotifications: settings.whatsappNotifications,
          whatsappPhone: settings.whatsappPhone ?? "",
          whatsappPhoneNumberId: settings.whatsappPhoneNumberId ?? "",
          whatsappAccessToken: settings.whatsappAccessToken ?? "",
          digestEnabled: settings.digestEnabled,
          digestFrequency: settings.digestFrequency,
          brandLogoUrl: settings.brandLogoUrl ?? "",
          brandColor: settings.brandColor ?? "#4f46e5",
          brandSenderName: settings.brandSenderName ?? "",
          outboundWebhookUrl: settings.outboundWebhookUrl ?? "",
          supplierLeadTimeDays: settings.supplierLeadTimeDays ?? 7,
          monitoringFilter: settings.monitoringFilter ?? "all",
          monitoringCollectionId: settings.monitoringCollectionId ?? "",
          monitoringTags: settings.monitoringTags ?? "",
        }
      : {
          autoHideEnabled: false,
          autoRepublishEnabled: false,
          lowStockThreshold: 5,
          emailNotifications: true,
          slackNotifications: false,
          notificationEmail: "",
          slackWebhookUrl: "",
          whatsappNotifications: false,
          whatsappPhone: "",
          whatsappPhoneNumberId: "",
          whatsappAccessToken: "",
          digestEnabled: true,
          digestFrequency: "weekly",
          brandLogoUrl: "",
          brandColor: "#4f46e5",
          brandSenderName: "",
          outboundWebhookUrl: "",
          supplierLeadTimeDays: 7,
          monitoringFilter: "all",
          monitoringCollectionId: "",
          monitoringTags: "",
        },
  };
}
