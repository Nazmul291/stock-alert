import { getCachedSettings, getCachedSession } from "./shop-cache.server";

type IntegrationsValues = {
  emailNotifications: boolean;
  notificationEmail: string;
  slackConnected: boolean;
  slackTeamName: string;
  slackChannelName: string;
  whatsappNotifications: boolean;
  whatsappPhone: string;
  whatsappPhoneVerified: boolean;
  outboundWebhookUrl: string;
  klaviyoEnabled: boolean;
};

export type IntegrationsData = {
  plan: string;
  storeEmail: string | null;
  settings: IntegrationsValues;
};

export async function loadIntegrationsData(shop: string): Promise<IntegrationsData> {
  const [settings, storeSession] = await Promise.all([
    getCachedSettings(shop),
    getCachedSession(shop),
  ]);

  return {
    plan: storeSession?.plan ?? "basic",
    storeEmail: storeSession?.email ?? null,
    settings: settings
      ? {
          emailNotifications: settings.emailNotifications,
          notificationEmail: settings.notificationEmail ?? "",
          // The raw webhook URL never needs to reach the client now that
          // connecting happens via OAuth — only whether it's connected, plus
          // the display fields for "Connected to #channel in Team".
          slackConnected: !!settings.slackWebhookUrl,
          slackTeamName: settings.slackTeamName ?? "",
          slackChannelName: settings.slackChannelName ?? "",
          whatsappNotifications: settings.whatsappNotifications,
          whatsappPhone: settings.whatsappPhone ?? "",
          whatsappPhoneVerified: settings.whatsappPhoneVerified,
          outboundWebhookUrl: settings.outboundWebhookUrl ?? "",
          // Same reasoning as slackWebhookUrl above — the API key is entered
          // through a modal now and never needs to round-trip back to the
          // client, so only whether Klaviyo is connected is sent.
          klaviyoEnabled: settings.klaviyoEnabled,
        }
      : {
          emailNotifications: true,
          notificationEmail: "",
          slackConnected: false,
          slackTeamName: "",
          slackChannelName: "",
          whatsappNotifications: false,
          whatsappPhone: "",
          whatsappPhoneVerified: false,
          outboundWebhookUrl: "",
          klaviyoEnabled: false,
        },
  };
}
