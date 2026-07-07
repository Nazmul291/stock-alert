import prisma from "../db.server";
import { refreshAsanaAccessToken } from "./asana-oauth.server";

const API_BASE = "https://app.asana.com/api/1.0";

// Carries the HTTP status so callers can tell "task gid no longer exists"
// (404 — e.g. the merchant deleted it in Asana) apart from other failures.
export class AsanaApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Access tokens expire in ~1 hour. Every other function below takes an
// already-valid token as a parameter — callers get one from here first, which
// refreshes and persists a new token whenever the stored one is at or near
// expiry, so the rest of this module never has to think about refresh.
export async function getValidAsanaAccessToken(shop: string): Promise<string | null> {
  const settings = await prisma.storeSettings.findUnique({ where: { shop } });
  if (!settings?.asanaAccessToken || !settings.asanaRefreshToken) return null;

  const expiresAt = settings.asanaTokenExpiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > 2 * 60 * 1000) {
    return settings.asanaAccessToken;
  }

  const refreshed = await refreshAsanaAccessToken(settings.asanaRefreshToken);
  if (!refreshed.ok || !refreshed.access_token) {
    console.error("[Asana] token refresh failed:", refreshed.error);
    return null;
  }

  await prisma.storeSettings.update({
    where: { shop },
    data: {
      asanaAccessToken: refreshed.access_token,
      // Asana doesn't always rotate the refresh token — keep the existing one
      // if a new one wasn't returned.
      asanaRefreshToken: refreshed.refresh_token ?? settings.asanaRefreshToken,
      asanaTokenExpiresAt: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000),
    },
  });
  return refreshed.access_token;
}

async function asanaGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.errors?.[0]?.message || `Asana API error ${res.status}`);
  }
  return json;
}

export async function fetchWorkspaces(accessToken: string): Promise<{ gid: string; name: string }[]> {
  const json = await asanaGet("/users/me?opt_fields=workspaces.gid,workspaces.name", accessToken);
  return json?.data?.workspaces ?? [];
}

export async function fetchProjects(accessToken: string, workspaceGid: string): Promise<{ gid: string; name: string }[]> {
  const json = await asanaGet(
    `/workspaces/${workspaceGid}/projects?opt_fields=name&archived=false`,
    accessToken,
  );
  return json?.data ?? [];
}

export async function fetchSections(accessToken: string, projectGid: string): Promise<{ gid: string; name: string }[]> {
  const json = await asanaGet(`/projects/${projectGid}/sections?opt_fields=name`, accessToken);
  return json?.data ?? [];
}

// Two calls when a section is given: Asana's documented reliable way to land
// a task in a specific section is creating it in the project first, then
// adding it to the section, rather than relying on `memberships` at creation.
// Returns the created task's gid so callers can track it as a parent for
// "daily"/"lifetime" task modes (see createAsanaSubtask below).
export async function createAsanaTask(
  accessToken: string,
  workspaceGid: string,
  projectGid: string,
  sectionGid: string | null,
  name: string,
  notes: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { name, notes, workspace: workspaceGid, projects: [projectGid] } }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new AsanaApiError(json?.errors?.[0]?.message || `Asana API error ${res.status}`, res.status);
  }
  const taskGid = json?.data?.gid;

  if (sectionGid) {
    const sectionRes = await fetch(`${API_BASE}/sections/${sectionGid}/addTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { task: taskGid } }),
    });
    if (!sectionRes.ok) {
      const err = await sectionRes.json().catch(() => ({}));
      throw new AsanaApiError(err?.errors?.[0]?.message || `Asana API error ${sectionRes.status}`, sectionRes.status);
    }
  }

  return taskGid;
}

// Used by "daily"/"lifetime" task modes to append an event onto a shared
// parent task instead of creating a standalone one.
export async function createAsanaSubtask(
  accessToken: string,
  parentTaskGid: string,
  name: string,
  notes: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/tasks/${parentTaskGid}/subtasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { name, notes } }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new AsanaApiError(json?.errors?.[0]?.message || `Asana API error ${res.status}`, res.status);
  }
}
