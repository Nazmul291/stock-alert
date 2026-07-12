import { useEffect } from "react";
import { useFetcher } from "react-router";
import { ConnectRow } from "../IntegrationControls";

// Slack — connected via OAuth, not a manual webhook-URL paste.
export function SlackIntegrationSection({
  connected, channelName, teamName, canSlack, slackConnectToken, retry,
}: {
  connected: boolean;
  channelName: string | null;
  teamName: string | null;
  canSlack: boolean;
  slackConnectToken: string;
  retry: () => void;
}) {
  const disconnectFetcher = useFetcher();
  const disconnecting = disconnectFetcher.state !== "idle";

  useEffect(() => {
    const d = disconnectFetcher.data as any;
    if (d?.intent === "disconnect_slack" && d?.success) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnectFetcher.data]);

  return (
    <ConnectRow
      icon={
        <img
          src="https://a.slack-edge.com/e6a93c1/img/icons/favicon-32.png"
          alt=""
          width={20}
          height={20}
          loading="lazy"
          style={{ display: "block" }}
        />
      }
      title="Slack"
      badge={!canSlack ? "Pro" : null}
      connected={canSlack && connected}
      locked={!canSlack}
      lockedNode={<s-link href="/app/billing">Upgrade to Pro →</s-link>}
      connectLabel="Connect"
      hideEdit
      onConnect={() => {
        window.open(`/api/slack/connect?token=${encodeURIComponent(slackConnectToken)}`, "_blank", "noopener,noreferrer");
      }}
      onDisconnect={() => {
        if (confirm("Disconnect Slack? Alerts will stop sending until you reconnect.")) {
          disconnectFetcher.submit({ intent: "disconnect_slack" }, { method: "post" });
        }
      }}
      disconnecting={disconnecting}
      connectedLabel={
        <>Connected to <strong>#{channelName}</strong> in <strong>{teamName}</strong>.</>
      }
    />
  );
}
