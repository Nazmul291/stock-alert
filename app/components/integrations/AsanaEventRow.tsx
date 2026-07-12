import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { fieldLabel, inputStyle, helpText } from "../IntegrationControls";
import type { AsanaMapping } from "../../lib/integrations-data.server";

// One row per stock event — project is always required. The "Group" select
// is always visible but stays disabled until a project with sections is
// picked (an empty sections list means the task is just created directly in
// the project), so the layout doesn't jump around while it loads. Each row
// auto-saves on change via its own fetcher, independent of the big
// dirty-tracking Form used for outboundWebhookUrl.
export function AsanaEventRow({
  eventType, label, projects, mapping,
}: {
  eventType: "low_stock" | "out_of_stock" | "restock";
  label: string;
  projects: { gid: string; name: string }[];
  mapping: AsanaMapping | undefined;
}) {
  const [projectGid, setProjectGid] = useState(mapping?.projectGid ?? "");
  const [sectionGid, setSectionGid] = useState(mapping?.sectionGid ?? "");
  const [taskMode, setTaskMode] = useState(mapping?.taskMode ?? "multi_task");
  const sectionsFetcher = useFetcher<{ sections: { gid: string; name: string }[]; error?: string }>();
  const saveFetcher = useFetcher();

  useEffect(() => {
    if (projectGid) {
      sectionsFetcher.load(`/api/asana/sections?projectGid=${encodeURIComponent(projectGid)}`);
    }
    // Only re-fetch when the selected project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectGid]);

  const sections = sectionsFetcher.data?.sections ?? [];
  const sectionsError = sectionsFetcher.data?.error;
  const sectionsLoading = !!projectGid && sectionsFetcher.state !== "idle" && !sectionsFetcher.data;
  const groupDisabled = !projectGid || sectionsLoading || sections.length === 0;
  const groupPlaceholder = !projectGid
    ? "Pick a project first"
    : sectionsLoading
    ? "Loading groups…"
    : "No group (top of project)";

  function save(newProjectGid: string, newSectionGid: string, newTaskMode: string) {
    const project = projects.find((p) => p.gid === newProjectGid);
    const section = sections.find((s) => s.gid === newSectionGid);
    saveFetcher.submit(
      {
        intent: "save_asana_mapping",
        eventType,
        projectGid: newProjectGid,
        projectName: project?.name ?? "",
        sectionGid: newSectionGid,
        sectionName: section?.name ?? "",
        taskMode: newTaskMode,
      },
      { method: "post" },
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
      <div>
        <label style={fieldLabel}>{label} — Project</label>
        <select
          style={inputStyle()}
          value={projectGid}
          onChange={(e) => {
            const newProjectGid = e.target.value;
            setProjectGid(newProjectGid);
            setSectionGid("");
            save(newProjectGid, "", taskMode);
          }}
        >
          <option value="">Not set</option>
          {projects.map((p) => (
            <option key={p.gid} value={p.gid}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={fieldLabel}>Group</label>
        <select
          style={{ ...inputStyle(), ...(groupDisabled ? { background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" } : {}) }}
          value={sectionGid}
          disabled={groupDisabled}
          onChange={(e) => {
            const newSectionGid = e.target.value;
            setSectionGid(newSectionGid);
            save(projectGid, newSectionGid, taskMode);
          }}
        >
          <option value="">{groupPlaceholder}</option>
          {sections.map((s) => (
            <option key={s.gid} value={s.gid}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={fieldLabel}>Task creation</label>
        <select
          style={inputStyle()}
          value={taskMode}
          onChange={(e) => {
            const newTaskMode = e.target.value;
            setTaskMode(newTaskMode);
            save(projectGid, sectionGid, newTaskMode);
          }}
        >
          <option value="multi_task">One task per event</option>
          <option value="daily">One task per day (events as subtasks)</option>
          <option value="lifetime">One task forever (events as subtasks)</option>
        </select>
      </div>
      {projectGid && sections.length === 0 && sectionsError && (
        <p style={{ ...helpText, color: "#b91c1c", gridColumn: "1 / -1", margin: 0 }}>{sectionsError}</p>
      )}
    </div>
  );
}
