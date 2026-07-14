"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronLeft, Leaf, ListChecks, Plus, Settings, Table as TableIcon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Base = { id: string; name: string; description: string | null; icon: string };
type ZTable = { id: string; name: string; icon: string; source: "custom" | "workload_log"; position: number };
type Field = { id: string; name: string; type: string; options: { choices?: Array<{ label: string }> }; position: number };
type Record_ = { id: string; data: Record<string, unknown> };
type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; state: string };
  action: { type: string; message?: string; table_id?: string };
  last_fired_at: string | null;
  fire_count: number;
};

const WORKLOAD_STATES = ["calm", "focused", "busy", "overloaded", "after_hours"];
const FIELD_TYPES = ["text", "long_text", "number", "select", "checkbox", "date", "url"];

function useAuthStatus() {
  const [status, setStatus] = useState<"loading" | "signed_in" | "signed_out">("loading");
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setStatus(data.user ? "signed_in" : "signed_out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setStatus(session?.user ? "signed_in" : "signed_out"));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return status;
}

export function BaseView() {
  const authStatus = useAuthStatus();
  const [bases, setBases] = useState<Base[]>([]);
  const [activeBaseId, setActiveBaseId] = useState<string | null>(null);
  const [tables, setTables] = useState<ZTable[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "automations">("table");
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<Record_[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationForm, setAutomationForm] = useState({ name: "", state: "overloaded", actionType: "browser_notification", message: "", tableId: "" });
  const [savingAutomation, setSavingAutomation] = useState(false);

  const loadTable = useCallback(async (tableId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/zenly/tables/${tableId}`);
      if (response.ok) {
        const json = await response.json();
        setFields(json.fields ?? []);
        setRecords(json.records ?? []);
        setReadOnly(Boolean(json.readOnly));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTables = useCallback(async (baseId: string) => {
    const response = await fetch(`/api/zenly/tables?baseId=${baseId}`);
    if (!response.ok) return;
    const json = await response.json();
    const list: ZTable[] = json.tables ?? [];
    setTables(list);
    if (list.length > 0) {
      setActiveTableId(list[0].id);
      void loadTable(list[0].id);
    }
  }, [loadTable]);

  const loadAutomations = useCallback(async (baseId: string) => {
    const response = await fetch(`/api/zenly/automations?baseId=${baseId}`);
    if (!response.ok) return;
    const json = await response.json();
    setAutomations(json.automations ?? []);
  }, []);

  useEffect(() => {
    if (authStatus !== "signed_in") return;
    fetch("/api/zenly/bases")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const list: Base[] = json?.bases ?? [];
        setBases(list);
        if (list.length > 0) {
          setActiveBaseId(list[0].id);
          void loadTables(list[0].id);
          void loadAutomations(list[0].id);
        }
      });
  }, [authStatus, loadTables, loadAutomations]);

  async function selectTable(tableId: string) {
    setActiveTableId(tableId);
    setView("table");
    await loadTable(tableId);
  }

  async function createTable() {
    if (!activeBaseId || !newTableName.trim()) return;
    const response = await fetch("/api/zenly/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseId: activeBaseId, name: newTableName.trim(), fields: [{ name: "Name", type: "text" }] }),
    });
    if (response.ok) {
      setNewTableName("");
      setAddingTable(false);
      await loadTables(activeBaseId);
    }
  }

  async function addField() {
    if (!activeTableId || !newFieldName.trim()) return;
    const response = await fetch(`/api/zenly/tables/${activeTableId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFieldName.trim(), type: newFieldType }),
    });
    if (response.ok) {
      setNewFieldName("");
      setAddingField(false);
      await loadTable(activeTableId);
    }
  }

  async function addRecord() {
    if (!activeTableId) return;
    const response = await fetch(`/api/zenly/tables/${activeTableId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
    });
    if (response.ok) await loadTable(activeTableId);
  }

  async function updateCell(recordId: string, fieldId: string, value: unknown) {
    setRecords((current) => current.map((r) => (r.id === recordId ? { ...r, data: { ...r.data, [fieldId]: value } } : r)));
    const record = records.find((r) => r.id === recordId);
    const nextData = { ...(record?.data ?? {}), [fieldId]: value };
    await fetch(`/api/zenly/records/${recordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: nextData }),
    });
  }

  async function deleteRecord(recordId: string) {
    setRecords((current) => current.filter((r) => r.id !== recordId));
    await fetch(`/api/zenly/records/${recordId}`, { method: "DELETE" });
  }

  async function createAutomation() {
    if (!activeBaseId || !automationForm.name.trim()) return;
    if (automationForm.actionType === "browser_notification" && !automationForm.message.trim()) return;
    if (automationForm.actionType === "append_record" && !automationForm.tableId) return;

    setSavingAutomation(true);
    const action =
      automationForm.actionType === "browser_notification"
        ? { type: "browser_notification", message: automationForm.message.trim() }
        : { type: "append_record", table_id: automationForm.tableId, values: {} };

    const response = await fetch("/api/zenly/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseId: activeBaseId,
        name: automationForm.name.trim(),
        trigger: { type: "workload_state_entered", state: automationForm.state },
        action,
      }),
    });
    setSavingAutomation(false);
    if (response.ok) {
      setAutomationForm({ name: "", state: "overloaded", actionType: "browser_notification", message: "", tableId: "" });
      await loadAutomations(activeBaseId);
    }
  }

  async function toggleAutomation(id: string, enabled: boolean) {
    setAutomations((current) => current.map((a) => (a.id === id ? { ...a, enabled } : a)));
    await fetch(`/api/zenly/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  async function deleteAutomation(id: string) {
    setAutomations((current) => current.filter((a) => a.id !== id));
    if (activeBaseId) await fetch(`/api/zenly/automations/${id}`, { method: "DELETE" });
  }

  const activeBase = bases.find((b) => b.id === activeBaseId);
  const customTables = tables.filter((t) => t.source === "custom");

  if (authStatus === "loading") {
    return <main className="grid min-h-screen place-items-center bg-[#050609] text-white/50">Loading…</main>;
  }

  if (authStatus === "signed_out") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050609] px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-[20px] font-semibold">Sign in to open Memory</p>
          <p className="mt-2 text-[14px] leading-5 text-white/50">Your work graph, context tables, and approval-based automations live here.</p>
          <a href="/login?redirect=%2Fbase" className="mt-6 inline-block rounded-full bg-white px-5 py-3 text-[13px] font-semibold text-[#11131b] shadow-[0_0_34px_rgba(255,255,255,0.2)]">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050609] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-3">
            <a href="/" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/68 ring-1 ring-white/10" title="Back to Zenly">
              <ChevronLeft size={18} />
            </a>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-[#9ff0bf] ring-1 ring-white/12">
              <Leaf size={16} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-white">{activeBase?.name ?? "Memory"}</p>
              <p className="text-[12px] text-white/42">{activeBase?.description}</p>
            </div>
          </div>
          <a href="/settings" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/68 ring-1 ring-white/10" title="Settings">
            <Settings size={17} />
          </a>
        </header>

        <div className="mt-4 grid flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-3">
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Tables</p>
              <div className="flex flex-col gap-1">
                {tables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => void selectTable(table.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-[14px] px-3 py-2 text-left text-[13px] font-medium text-white/60 transition",
                      view === "table" && activeTableId === table.id && "bg-white/12 text-white",
                    )}
                  >
                    <TableIcon size={14} />
                    {table.name}
                  </button>
                ))}
              </div>
              {addingTable ? (
                <div className="mt-2 flex gap-1 px-1">
                  <input
                    autoFocus
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void createTable()}
                    placeholder="Table name"
                    className="min-w-0 flex-1 rounded-[10px] bg-black/30 px-2 py-1.5 text-[12px] text-white outline-none ring-1 ring-white/10"
                  />
                  <button onClick={() => void createTable()} className="rounded-[10px] bg-white/12 px-2 text-[11px] text-white">Add</button>
                </div>
              ) : (
                <button onClick={() => setAddingTable(true)} className="mt-1 flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-[13px] font-medium text-white/38 hover:text-white/60">
                  <Plus size={14} /> New table
                </button>
              )}
            </div>

            <button
              onClick={() => setView("automations")}
              className={cn(
                "flex items-center gap-2 rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-[13px] font-semibold text-white/68 transition",
                view === "automations" && "bg-white/12 text-white",
              )}
            >
              <ListChecks size={16} /> Automations
            </button>
          </aside>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            {view === "automations" ? (
              <AutomationsPanel
                automations={automations}
                customTables={customTables}
                form={automationForm}
                setForm={setAutomationForm}
                saving={savingAutomation}
                onCreate={createAutomation}
                onToggle={toggleAutomation}
                onDelete={deleteAutomation}
              />
            ) : loading ? (
              <p className="p-6 text-[13px] text-white/42">Loading…</p>
            ) : (
              <TableGrid
                fields={fields}
                records={records}
                readOnly={readOnly}
                addingField={addingField}
                newFieldName={newFieldName}
                newFieldType={newFieldType}
                setAddingField={setAddingField}
                setNewFieldName={setNewFieldName}
                setNewFieldType={setNewFieldType}
                onAddField={addField}
                onAddRecord={addRecord}
                onUpdateCell={updateCell}
                onDeleteRecord={deleteRecord}
              />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function formatCell(field: Field, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "date") {
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  return String(value);
}

function TableGrid({
  fields,
  records,
  readOnly,
  addingField,
  newFieldName,
  newFieldType,
  setAddingField,
  setNewFieldName,
  setNewFieldType,
  onAddField,
  onAddRecord,
  onUpdateCell,
  onDeleteRecord,
}: {
  fields: Field[];
  records: Record_[];
  readOnly: boolean;
  addingField: boolean;
  newFieldName: string;
  newFieldType: string;
  setAddingField: (v: boolean) => void;
  setNewFieldName: (v: string) => void;
  setNewFieldType: (v: string) => void;
  onAddField: () => void;
  onAddRecord: () => void;
  onUpdateCell: (recordId: string, fieldId: string, value: unknown) => void;
  onDeleteRecord: (recordId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field.id} className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-white/42">
                {field.name}
              </th>
            ))}
            {!readOnly && <th className="border-b border-white/10 px-3 py-2 w-8" />}
            {!readOnly && (
              <th className="border-b border-white/10 px-3 py-2 text-left">
                {addingField ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="Field name"
                      className="w-24 rounded-[8px] bg-black/30 px-2 py-1 text-[12px] text-white outline-none ring-1 ring-white/10"
                    />
                    <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} className="rounded-[8px] bg-black/30 px-1 py-1 text-[12px] text-white ring-1 ring-white/10">
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type} className="bg-[#11131b]">{type.replace("_", " ")}</option>
                      ))}
                    </select>
                    <button onClick={onAddField} className="rounded-[8px] bg-white/12 px-2 py-1 text-[11px] text-white">Add</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingField(true)} className="flex items-center gap-1 text-[11px] font-medium text-white/38 hover:text-white/60">
                    <Plus size={13} /> Field
                  </button>
                )}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="group">
              {fields.map((field) => (
                <td key={field.id} className="border-b border-white/5 px-3 py-2 text-white/82">
                  {readOnly ? (
                    formatCell(field, record.data[field.id])
                  ) : (
                    <EditableCell field={field} value={record.data[field.id]} onChange={(value) => onUpdateCell(record.id, field.id, value)} />
                  )}
                </td>
              ))}
              {!readOnly && (
                <td className="border-b border-white/5 px-2 py-2 text-center opacity-0 group-hover:opacity-100">
                  <button onClick={() => onDeleteRecord(record.id)} className="text-white/32 hover:text-white/70">
                    <Trash2 size={13} />
                  </button>
                </td>
              )}
              {!readOnly && <td className="border-b border-white/5" />}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && <p className="p-6 text-center text-[13px] text-white/38">No rows yet.</p>}
      {!readOnly && (
        <button onClick={onAddRecord} className="mt-2 flex items-center gap-2 rounded-[14px] px-3 py-2 text-[13px] font-medium text-white/38 hover:text-white/60">
          <Plus size={14} /> Add row
        </button>
      )}
    </div>
  );
}

function EditableCell({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === "checkbox") {
    return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#9ff0bf]" />;
  }
  if (field.type === "select") {
    const choices = field.options?.choices ?? [];
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-white/82 outline-none">
        <option value="" className="bg-[#11131b]" />
        {choices.map((choice) => (
          <option key={choice.label} value={choice.label} className="bg-[#11131b]">{choice.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === "long_text") {
    return (
      <textarea
        defaultValue={(value as string) ?? ""}
        onBlur={(e) => onChange(e.target.value)}
        rows={1}
        className="w-full min-w-[160px] resize-y bg-transparent text-white/82 outline-none"
      />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      defaultValue={(value as string) ?? ""}
      onBlur={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
      className="w-full min-w-[100px] bg-transparent text-white/82 outline-none"
    />
  );
}

function AutomationsPanel({
  automations,
  customTables,
  form,
  setForm,
  saving,
  onCreate,
  onToggle,
  onDelete,
}: {
  automations: Automation[];
  customTables: ZTable[];
  form: { name: string; state: string; actionType: string; message: string; tableId: string };
  setForm: (updater: (current: typeof form) => typeof form) => void;
  saving: boolean;
  onCreate: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Active automations</p>
        {automations.length === 0 && <p className="text-[13px] text-white/38">No automations yet — create one to have Zenly react automatically to your workload.</p>}
        {automations.map((automation) => (
          <div key={automation.id} className="flex items-center justify-between gap-3 rounded-[18px] bg-black/22 p-3 ring-1 ring-white/8">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{automation.name}</p>
              <p className="truncate text-[11px] text-white/42">
                When state becomes <span className="text-white/68">{automation.trigger.state.replace("_", " ")}</span> →{" "}
                {automation.action.type === "browser_notification" ? `notify: "${automation.action.message}"` : "add a row"}
                {automation.fire_count > 0 && ` · fired ${automation.fire_count}×`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => onToggle(automation.id, !automation.enabled)}
                className={cn("h-6 w-11 shrink-0 rounded-full p-1 transition", automation.enabled ? "bg-[#9ff0bf]" : "bg-white/12")}
              >
                <span className={cn("block h-4 w-4 rounded-full bg-white transition", automation.enabled && "translate-x-5")} />
              </button>
              <button onClick={() => onDelete(automation.id)} className="text-white/32 hover:text-white/70">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[20px] bg-black/22 p-4 ring-1 ring-white/8">
        <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-white">
          <Bell size={14} /> New automation
        </p>
        <div className="space-y-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name (e.g. Overload nudge)"
            className="w-full rounded-[10px] bg-black/30 px-3 py-2 text-[13px] text-white outline-none ring-1 ring-white/10"
          />
          <label className="block text-[11px] text-white/42">When workload state becomes</label>
          <select
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            className="w-full rounded-[10px] bg-black/30 px-3 py-2 text-[13px] text-white ring-1 ring-white/10"
          >
            {WORKLOAD_STATES.map((state) => (
              <option key={state} value={state} className="bg-[#11131b]">{state.replace("_", " ")}</option>
            ))}
          </select>
          <label className="block text-[11px] text-white/42">Then</label>
          <select
            value={form.actionType}
            onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value }))}
            className="w-full rounded-[10px] bg-black/30 px-3 py-2 text-[13px] text-white ring-1 ring-white/10"
          >
            <option value="browser_notification" className="bg-[#11131b]">Send a browser notification</option>
            <option value="append_record" className="bg-[#11131b]">Add a row to a table</option>
          </select>
          {form.actionType === "browser_notification" ? (
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Notification message"
              rows={2}
              className="w-full rounded-[10px] bg-black/30 px-3 py-2 text-[13px] text-white outline-none ring-1 ring-white/10"
            />
          ) : (
            <select
              value={form.tableId}
              onChange={(e) => setForm((f) => ({ ...f, tableId: e.target.value }))}
              className="w-full rounded-[10px] bg-black/30 px-3 py-2 text-[13px] text-white ring-1 ring-white/10"
            >
              <option value="" className="bg-[#11131b]">Choose a table…</option>
              {customTables.map((table) => (
                <option key={table.id} value={table.id} className="bg-[#11131b]">{table.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={onCreate}
            disabled={saving}
            className="w-full rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-[#11131b] shadow-[0_0_24px_rgba(255,255,255,0.16)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create automation"}
          </button>
        </div>
      </div>
    </div>
  );
}
