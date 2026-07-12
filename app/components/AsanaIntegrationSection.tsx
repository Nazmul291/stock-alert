import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { ConnectRow, inputStyle, helpText } from "./IntegrationControls";
import { AsanaEventRow } from "./AsanaEventRow";
import type { AsanaMapping } from "../lib/integrations-data.server";

// Asana — connected via OAuth (same new-tab pattern as Slack, since Asana's
// consent screen can't render inside Shopify's iframe either), then per-event
// project/section mappings live inline once connected.
export function AsanaIntegrationSection({
  canAsana, connected, userName, workspaceName, asanaConnectToken, mappingByEvent, retry,
}: {
  canAsana: boolean;
  connected: boolean;
  userName: string | null;
  workspaceName: string | null;
  asanaConnectToken: string;
  mappingByEvent: Record<string, AsanaMapping | undefined>;
  retry: () => void;
}) {
  const asanaDisconnectFetcher = useFetcher();
  const asanaDisconnecting = asanaDisconnectFetcher.state !== "idle";
  const asanaProjectsFetcher = useFetcher<{ projects: { gid: string; name: string }[] }>();
  const asanaWorkspacesFetcher = useFetcher<{ workspaces: { gid: string; name: string }[] }>();
  const [asanaWorkspacePickerOpen, setAsanaWorkspacePickerOpen] = useState(false);
  const asanaSelectWorkspaceFetcher = useFetcher();

  useEffect(() => {
    if (connected) {
      asanaProjectsFetcher.load("/api/asana/projects");
    }
    // Only re-fetch when the connection state itself changes — not on every
    // render (asanaProjectsFetcher's identity is stable across renders from
    // useFetcher, but including it would still be fine; omitted deliberately
    // to only react to the thing that actually invalidates the project list).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, workspaceName]);

  useEffect(() => {
    const d = asanaDisconnectFetcher.data as any;
    if (d?.intent === "disconnect_asana" && d?.success) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asanaDisconnectFetcher.data]);

  useEffect(() => {
    const d = asanaSelectWorkspaceFetcher.data as any;
    if (d?.intent === "select_asana_workspace" && d?.success) {
      setAsanaWorkspacePickerOpen(false);
      retry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asanaSelectWorkspaceFetcher.data]);

  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Asana">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Create a task for each stock event in an Asana project of your choice.{" "}
          {!canAsana && <><span style={{ color: "#9ca3af" }}>Requires Professional plan.</span> <s-link href="/app/billing">Upgrade →</s-link></>}
        </p>

        <ConnectRow
          icon={
            <img
              src="https://d3ki9tyy5l5ruj.cloudfront.net/obj/df5bcec7e9873dddebdd1328901c287f0f069750/asana-logo-favicon@3x.png"
              alt=""
              width={20}
              height={20}
              loading="lazy"
              style={{ display: "block" }}
            />
          }
          title="Asana"
          badge={!canAsana ? "Pro" : null}
          connected={canAsana && connected}
          locked={!canAsana}
          lockedNode={<s-link href="/app/billing">Upgrade to Pro →</s-link>}
          connectLabel="Connect"
          hideEdit
          onConnect={() => {
            window.open(`/api/asana/connect?token=${encodeURIComponent(asanaConnectToken)}`, "_blank", "noopener,noreferrer");
          }}
          onDisconnect={() => {
            if (confirm("Disconnect Asana? Tasks will stop being created until you reconnect.")) {
              asanaDisconnectFetcher.submit({ intent: "disconnect_asana" }, { method: "post" });
            }
          }}
          disconnecting={asanaDisconnecting}
          connectedLabel={
            <>
              Connected as <strong>{userName}</strong> in <strong>{workspaceName}</strong>.{" "}
              <button
                type="button"
                onClick={() => {
                  setAsanaWorkspacePickerOpen((v) => !v);
                  if (!asanaWorkspacesFetcher.data) asanaWorkspacesFetcher.load("/api/asana/workspaces");
                }}
                style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" }}
              >
                Change workspace
              </button>
            </>
          }
        />

        {canAsana && connected && asanaWorkspacePickerOpen && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <select
              style={{ ...inputStyle(), width: "auto", flex: 1 }}
              defaultValue=""
              onChange={(e) => {
                const opt = e.target.selectedOptions[0];
                asanaSelectWorkspaceFetcher.submit(
                  { intent: "select_asana_workspace", workspaceGid: e.target.value, workspaceName: opt?.text ?? "" },
                  { method: "post" },
                );
              }}
            >
              <option value="" disabled>
                {asanaWorkspacesFetcher.state !== "idle" ? "Loading workspaces…" : "Choose a workspace"}
              </option>
              {(asanaWorkspacesFetcher.data?.workspaces ?? []).map((w) => (
                <option key={w.gid} value={w.gid}>{w.name}</option>
              ))}
            </select>
            <p style={{ ...helpText, margin: 0 }}>Switching clears existing project/group selections below.</p>
          </div>
        )}

        {canAsana && connected && (
          <div style={{ marginTop: 8 }}>
            <AsanaEventRow
              eventType="low_stock"
              label="Low stock"
              projects={asanaProjectsFetcher.data?.projects ?? []}
              mapping={mappingByEvent.low_stock}
            />
            <AsanaEventRow
              eventType="out_of_stock"
              label="Out of stock"
              projects={asanaProjectsFetcher.data?.projects ?? []}
              mapping={mappingByEvent.out_of_stock}
            />
            <AsanaEventRow
              eventType="restock"
              label="Restock"
              projects={asanaProjectsFetcher.data?.projects ?? []}
              mapping={mappingByEvent.restock}
            />
          </div>
        )}
      </s-section>
    </div>
  );
}
