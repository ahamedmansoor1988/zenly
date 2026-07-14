"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  GitPullRequest,
  History,
  Leaf,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "signed_in" | "signed_out";
type ProviderState = "connected" | "syncing" | "disconnected";
type ProviderId = "gmail" | "slack";
type WorkloadState = "calm" | "focused" | "busy" | "overloaded" | "after_hours";
type SyncStatus = "idle" | "saving" | "saved" | "signed_out" | "error";

type InputActivityStats = {
  activeSeconds: number;
  keyPresses: number;
  mouseClicks: number;
  mouseMoves: number;
  mouseDistance: number;
  wheelEvents: number;
  trackpadGestures: number;
  lastInput: "keyboard" | "mouse" | "trackpad" | "none";
};

type CommunicationSignals = {
  gmailUnread: number;
  gmailImportant: number;
  gmailUrgent: number;
  slackMessages: number;
  slackMentions: number;
  slackPriorityChannels: number;
};

type WorkloadReport = {
  communicationLoad: number;
  activityLoad: number;
  durationLoad: number;
  recoveryCredit: number;
  overloadScore: number;
  state: WorkloadState;
  headline: string;
  message: string;
};

type ProviderAccount = {
  state: ProviderState;
  configured: boolean;
  signals: Record<string, number> | null;
  displayName: string | null;
};

type SnapshotRow = {
  id: string;
  captured_at: string;
  overload_score: number;
  state: WorkloadState;
};

type ContextItem = {
  label: string;
  title: string;
  detail: string;
  meta: string;
  tone: "green" | "amber" | "blue" | "red" | "neutral";
  icon: LucideIcon;
};

const emptyInputStats: InputActivityStats = {
  activeSeconds: 0,
  keyPresses: 0,
  mouseClicks: 0,
  mouseMoves: 0,
  mouseDistance: 0,
  wheelEvents: 0,
  trackpadGestures: 0,
  lastInput: "none",
};

const disconnectedAccount: ProviderAccount = {
  state: "disconnected",
  configured: true,
  signals: null,
  displayName: null,
};

const providerEnvHints: Record<ProviderId, string> = {
  gmail: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and ZENLY_TOKEN_SECRET",
  slack: "SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and ZENLY_TOKEN_SECRET",
};

const engineMap = [
  { name: "Identity", status: "Learning role, cadence, priorities", icon: UserRoundCheck },
  { name: "Context", status: "Combining mail, Slack, activity, and calendar", icon: Brain },
  { name: "Memory", status: "Capturing decisions, commitments, and handoffs", icon: Database },
  { name: "Intelligence", status: "Ranking what matters before recommending", icon: Sparkles },
  { name: "Execution", status: "Approval required before any external action", icon: Zap },
  { name: "Trust", status: "Every recommendation shows source and confidence", icon: ShieldCheck },
];

const sourceReadiness = [
  { name: "Gmail", icon: Mail, state: "connected-input" },
  { name: "Slack", icon: MessageSquareText, state: "connected-input" },
  { name: "Calendar", icon: CalendarDays, state: "simulated" },
  { name: "GitHub", icon: GitPullRequest, state: "simulated" },
  { name: "Docs", icon: FileText, state: "simulated" },
];

function getTodayActivityKey() {
  return `zenly-context-activity-${new Date().toISOString().slice(0, 10)}`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getCommunicationLoad(signals: CommunicationSignals) {
  return clamp(
    signals.gmailUnread * 0.7 +
      signals.gmailImportant * 3 +
      signals.gmailUrgent * 5 +
      signals.slackMessages * 0.8 +
      signals.slackMentions * 8 +
      signals.slackPriorityChannels * 6,
  );
}

function getActivityLoad(stats: InputActivityStats) {
  return clamp(stats.keyPresses * 0.4 + stats.mouseClicks * 1.4 + stats.trackpadGestures * 0.8 + stats.mouseDistance / 420);
}

function getWorkloadReport({
  signals,
  inputStats,
}: {
  signals: CommunicationSignals;
  inputStats: InputActivityStats;
}): WorkloadReport {
  const communicationLoad = getCommunicationLoad(signals);
  const activityLoad = getActivityLoad(inputStats);
  const durationLoad = clamp(inputStats.activeSeconds / 45);
  const recoveryCredit = 0;
  const hour = new Date().getHours();
  const afterHours = hour < 8 || hour >= 18;
  const overloadScore = clamp(communicationLoad * 0.42 + activityLoad * 0.34 + durationLoad * 0.24);

  if (afterHours && overloadScore >= 35) {
    return {
      communicationLoad,
      activityLoad,
      durationLoad,
      recoveryCredit,
      overloadScore,
      state: "after_hours",
      headline: "After-hours context is active",
      message: "Zenly will separate urgent loops from everything that can wait until the next work window.",
    };
  }

  if (overloadScore >= 70) {
    return {
      communicationLoad,
      activityLoad,
      durationLoad,
      recoveryCredit,
      overloadScore,
      state: "overloaded",
      headline: "Too many active signals",
      message: "Start with the waiting-on-you items, then protect a focus block before opening more threads.",
    };
  }

  if (overloadScore >= 45) {
    return {
      communicationLoad,
      activityLoad,
      durationLoad,
      recoveryCredit,
      overloadScore,
      state: "busy",
      headline: "Context load is rising",
      message: "Zenly found enough new signal to justify a guided resume before switching projects.",
    };
  }

  if (activityLoad >= 35 && communicationLoad < 35) {
    return {
      communicationLoad,
      activityLoad,
      durationLoad,
      recoveryCredit,
      overloadScore,
      state: "focused",
      headline: "Focus state detected",
      message: "You appear to be in a work block. Keep inbound updates batched unless something is urgent.",
    };
  }

  return {
    communicationLoad,
    activityLoad,
    durationLoad,
    recoveryCredit,
    overloadScore,
    state: "calm",
    headline: "Context is stable",
    message: "Signals are light. This is a good time to continue the current project without scanning every app.",
  };
}

function useSupabaseUser() {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    let subscription: { subscription: { unsubscribe: () => void } } | null = null;

    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setStatus("signed_out");
    }, 1800);

    try {
      const supabase = createClient();

      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (!cancelled) setStatus(data.user ? "signed_in" : "signed_out");
        })
        .catch(() => {
          if (!cancelled) setStatus("signed_out");
        });

      const authListener = supabase.auth.onAuthStateChange((_event, session) => {
        if (!cancelled) setStatus(session?.user ? "signed_in" : "signed_out");
      });
      subscription = authListener.data;
    } catch {
      setStatus("signed_out");
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      subscription?.subscription.unsubscribe();
    };
  }, []);

  return status;
}

function useInputActivity() {
  const [stats, setStats] = useState<InputActivityStats>(emptyInputStats);
  const lastActivityAt = useRef(0);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const lastPointerMoveAt = useRef(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(getTodayActivityKey());
    if (!saved) return;

    try {
      setStats({ ...emptyInputStats, ...JSON.parse(saved) });
    } catch {
      window.localStorage.removeItem(getTodayActivityKey());
    }
  }, []);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      window.localStorage.setItem(getTodayActivityKey(), JSON.stringify(stats));
    }, 250);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [stats]);

  useEffect(() => {
    function markActivity() {
      lastActivityAt.current = Date.now();
    }

    function onKeyDown() {
      markActivity();
      setStats((current) => ({ ...current, keyPresses: current.keyPresses + 1, lastInput: "keyboard" }));
    }

    function onPointerDown(event: PointerEvent) {
      markActivity();
      lastPointer.current = { x: event.clientX, y: event.clientY };
      if (event.pointerType === "mouse" || event.pointerType === "") {
        setStats((current) => ({ ...current, mouseClicks: current.mouseClicks + 1, lastInput: "mouse" }));
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== "mouse" && event.pointerType !== "") return;
      const now = Date.now();
      if (now - lastPointerMoveAt.current < 120) return;
      lastPointerMoveAt.current = now;
      markActivity();
      setStats((current) => {
        const previous = lastPointer.current;
        const distance = previous ? Math.hypot(event.clientX - previous.x, event.clientY - previous.y) : 0;
        lastPointer.current = { x: event.clientX, y: event.clientY };
        return {
          ...current,
          mouseMoves: current.mouseMoves + 1,
          mouseDistance: current.mouseDistance + Math.min(distance, 220),
          lastInput: "mouse",
        };
      });
    }

    function onWheel(event: WheelEvent) {
      markActivity();
      const preciseDelta = event.deltaMode === 0 && Math.abs(event.deltaY) < 80;
      const horizontalScroll = Math.abs(event.deltaX) > 0;
      const likelyTrackpad = preciseDelta || horizontalScroll;
      setStats((current) => ({
        ...current,
        wheelEvents: current.wheelEvents + 1,
        trackpadGestures: likelyTrackpad ? current.trackpadGestures + 1 : current.trackpadGestures,
        lastInput: likelyTrackpad ? "trackpad" : "mouse",
      }));
    }

    const activeTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityAt.current > 15000) return;
      setStats((current) => ({ ...current, activeSeconds: current.activeSeconds + 1 }));
    }, 1000);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      window.clearInterval(activeTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return stats;
}

function useProviderAccount(provider: ProviderId, authStatus: AuthStatus) {
  const [account, setAccount] = useState<ProviderAccount>(disconnectedAccount);

  const refresh = useCallback(async () => {
    setAccount((current) => (current.state === "connected" ? { ...current, state: "syncing" } : current));
    try {
      const response = await fetch(`/api/zenly/${provider}/signals`);
      if (!response.ok) {
        setAccount(disconnectedAccount);
        return;
      }
      const json = await response.json();
      if (!json.connected) {
        setAccount({ ...disconnectedAccount, configured: json.configured !== false });
        return;
      }
      setAccount({
        state: "connected",
        configured: true,
        signals: json.signals,
        displayName: json.displayName ?? null,
      });
    } catch {
      setAccount(disconnectedAccount);
    }
  }, [provider]);

  useEffect(() => {
    if (authStatus !== "signed_in") {
      setAccount(disconnectedAccount);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has(`zenly_${provider}`)) {
      params.delete(`zenly_${provider}`);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    }

    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [authStatus, provider, refresh]);

  const connect = useCallback(() => {
    if (!account.configured) {
      window.alert(`${provider === "gmail" ? "Gmail" : "Slack"} OAuth is not configured yet. Set ${providerEnvHints[provider]} in .env.local.`);
      return;
    }
    window.location.assign(`/api/zenly/${provider}/connect`);
  }, [account.configured, provider]);

  return { account, refresh, connect };
}

function useWorkloadHistory(enabled: boolean, lastSavedAt: Date | null) {
  const [history, setHistory] = useState<SnapshotRow[]>([]);

  useEffect(() => {
    if (!enabled) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    fetch("/api/zenly/workload")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (cancelled || !Array.isArray(json?.snapshots)) return;
        setHistory(json.snapshots);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled, lastSavedAt]);

  return history;
}

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const SNAPSHOT_MIN_GAP_MS = 15 * 1000;

function useWorkloadSync({
  authStatus,
  workload,
  signals,
  inputStats,
}: {
  authStatus: AuthStatus;
  workload: WorkloadReport;
  signals: CommunicationSignals;
  inputStats: InputActivityStats;
}) {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const latest = useRef({ workload, signals, inputStats });
  const lastSaveTime = useRef(0);
  const activeSecondsAtLastSave = useRef(0);
  const signedOut = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    latest.current = { workload, signals, inputStats };
  }, [workload, signals, inputStats]);

  useEffect(() => {
    if (authStatus === "signed_in") {
      signedOut.current = false;
      setStatus((current) => (current === "signed_out" ? "idle" : current));
      return;
    }
    if (authStatus === "signed_out") {
      signedOut.current = true;
      setStatus("signed_out");
    }
  }, [authStatus]);

  const saveSnapshot = useCallback(
    async ({ force = false, keepalive = false }: { force?: boolean; keepalive?: boolean } = {}) => {
      if (signedOut.current || inFlight.current) return;

      const { workload, signals, inputStats } = latest.current;
      const now = Date.now();
      const minGap = force ? SNAPSHOT_MIN_GAP_MS : SNAPSHOT_INTERVAL_MS;
      if (now - lastSaveTime.current < minGap) return;
      if (!force && inputStats.activeSeconds === activeSecondsAtLastSave.current) return;
      if (inputStats.activeSeconds < 30 && workload.state === "calm") return;

      inFlight.current = true;
      setStatus("saving");

      try {
        const response = await fetch("/api/zenly/workload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive,
          body: JSON.stringify({
            source: "web",
            capturedAt: new Date().toISOString(),
            communicationLoad: workload.communicationLoad,
            activityLoad: workload.activityLoad,
            durationLoad: workload.durationLoad,
            recoveryCredit: workload.recoveryCredit,
            overloadScore: workload.overloadScore,
            state: workload.state,
            gmailSignals: {
              unread: signals.gmailUnread,
              important: signals.gmailImportant,
              urgent: signals.gmailUrgent,
            },
            slackSignals: {
              messages: signals.slackMessages,
              mentions: signals.slackMentions,
              priorityChannels: signals.slackPriorityChannels,
            },
            inputActivity: {
              activeSeconds: inputStats.activeSeconds,
              keyPresses: inputStats.keyPresses,
              mouseClicks: inputStats.mouseClicks,
              trackpadGestures: inputStats.trackpadGestures,
            },
            recommendation: {
              headline: workload.headline,
              message: workload.message,
            },
          }),
        });

        if (response.status === 401) {
          signedOut.current = true;
          setStatus("signed_out");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          return;
        }

        lastSaveTime.current = now;
        activeSecondsAtLastSave.current = inputStats.activeSeconds;
        setLastSavedAt(new Date());
        setStatus("saved");
      } catch {
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void saveSnapshot();
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [saveSnapshot]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      void saveSnapshot({ force: true, keepalive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [saveSnapshot]);

  return { status, lastSavedAt, saveSnapshot };
}

function buildSignals(gmail: ProviderAccount, slack: ProviderAccount): CommunicationSignals {
  return {
    gmailUnread: Number(gmail.signals?.unread ?? 0),
    gmailImportant: Number(gmail.signals?.important ?? 0),
    gmailUrgent: Number(gmail.signals?.urgent ?? 0),
    slackMessages: Number(slack.signals?.messages ?? 0),
    slackMentions: Number(slack.signals?.mentions ?? 0),
    slackPriorityChannels: Number(slack.signals?.priorityChannels ?? 0),
  };
}

function buildContextItems(signals: CommunicationSignals, workload: WorkloadReport): ContextItem[] {
  const urgentCount = signals.gmailUrgent + signals.slackMentions;
  const inboxTotal = signals.gmailUnread + signals.slackMessages;
  const priorityThreads = signals.gmailImportant + signals.slackPriorityChannels;

  return [
    {
      label: "Where you left off",
      title: workload.state === "focused" ? "Continue the active work block" : "Return to the current operating context",
      detail:
        workload.state === "focused"
          ? "Your recent activity suggests you were already deep in execution. Resume without opening new sources first."
          : "Zenly has enough signal to rebuild your work state before you switch tabs.",
      meta: `${Math.round(workload.activityLoad)} activity load`,
      tone: "blue",
      icon: History,
    },
    {
      label: "What changed",
      title: inboxTotal > 0 ? `${pluralize(inboxTotal, "new signal")} across Gmail and Slack` : "No major inbound changes detected",
      detail:
        inboxTotal > 0
          ? "Inbound updates have been grouped so you can scan them by importance instead of source."
          : "Connected sources are quiet. Simulated sources are waiting for integrations.",
      meta: `${signals.gmailUnread} mail / ${signals.slackMessages} Slack`,
      tone: inboxTotal > 20 ? "amber" : "green",
      icon: Bell,
    },
    {
      label: "What should happen next",
      title: urgentCount > 0 ? "Clear waiting-on-you items first" : "Resume the highest-priority project",
      detail:
        urgentCount > 0
          ? "Mentions and urgent mail are the only items elevated above project work."
          : "No urgent interruption is winning right now. Zenly recommends one focused continuation pass.",
      meta: `${urgentCount} urgent`,
      tone: urgentCount > 0 ? "red" : "green",
      icon: Target,
    },
    {
      label: "Who is waiting",
      title: priorityThreads > 0 ? `${pluralize(priorityThreads, "priority thread")} need review` : "No priority owner is blocked",
      detail:
        priorityThreads > 0
          ? "These are the people-facing threads Zenly would review before expanding the rest of the inbox."
          : "No connected source currently suggests someone is blocked on your response.",
      meta: `${signals.gmailImportant} important / ${signals.slackPriorityChannels} channels`,
      tone: priorityThreads > 0 ? "amber" : "neutral",
      icon: UserRoundCheck,
    },
    {
      label: "Attention today",
      title: workload.headline,
      detail: workload.message,
      meta: `${Math.round(workload.overloadScore)} context load`,
      tone: workload.overloadScore >= 70 ? "red" : workload.overloadScore >= 45 ? "amber" : "green",
      icon: Brain,
    },
  ];
}

function formatTime(value: Date | null) {
  if (!value) return "Not saved yet";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(value);
}

export function ZenlyApp() {
  const authStatus = useSupabaseUser();
  const inputStats = useInputActivity();
  const gmail = useProviderAccount("gmail", authStatus);
  const slack = useProviderAccount("slack", authStatus);

  const signals = useMemo(() => buildSignals(gmail.account, slack.account), [gmail.account, slack.account]);
  const workload = useMemo(() => getWorkloadReport({ signals, inputStats }), [signals, inputStats]);
  const sync = useWorkloadSync({ authStatus, workload, signals, inputStats });
  const history = useWorkloadHistory(authStatus === "signed_in", sync.lastSavedAt);
  const contextItems = useMemo(() => buildContextItems(signals, workload), [signals, workload]);

  const connectedSources = Number(gmail.account.state === "connected") + Number(slack.account.state === "connected");
  const engineConfidence = clamp(48 + connectedSources * 16 + Math.min(history.length, 4) * 4 + Math.round(workload.communicationLoad / 8), 0, 96);
  const primaryItem = contextItems[2];

  const resumeWork = useCallback(() => {
    void sync.saveSnapshot({ force: true });
    document.getElementById("zenly-next-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sync]);

  if (authStatus === "loading") {
    return <main className="grid min-h-screen place-items-center bg-[#050609] text-white/50">Loading Zenly...</main>;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050609] text-white tracking-normal">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-16%] top-[-22%] h-[680px] w-[680px] rounded-full bg-[#79edaa]/28 blur-[145px]" />
        <div className="absolute right-[-12%] top-[-4%] h-[680px] w-[680px] rounded-full bg-[#bda7ff]/32 blur-[145px]" />
        <div className="absolute bottom-[-26%] left-[34%] h-[720px] w-[720px] rounded-full bg-[#ffb66f]/22 blur-[155px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.2))]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[26px] border border-white/[0.08] bg-white/[0.065] p-3 shadow-[0_24px_72px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
          <a href="/" className="flex items-center gap-3" aria-label="Zenly home">
            <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-white/10 text-[#9ff0bf] shadow-[0_0_34px_rgba(159,240,191,0.16)] ring-1 ring-white/10">
              <Leaf size={19} />
            </span>
            <span>
              <span className="block text-[18px] font-semibold leading-none text-white">Zenly</span>
              <span className="block text-[12px] text-white/48">Continuous work context</span>
            </span>
          </a>

          <nav className="flex items-center gap-2">
            <a href="/base" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-[#11131b] shadow-[0_0_30px_rgba(255,255,255,0.18)]">
              <Database size={15} />
              Memory
            </a>
            <a href="/settings" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/58 ring-1 ring-white/10 transition hover:bg-white/14 hover:text-white" title="Settings">
              <Settings size={15} />
            </a>
          </nav>
        </header>

        {authStatus === "signed_out" && (
          <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.075] px-4 py-3 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
            <div>
              <p className="text-[14px] font-semibold text-white">Sign in to connect your real work context.</p>
              <p className="text-[12px] text-white/48">Until then, Zenly can show the operating model but cannot sync personal sources.</p>
            </div>
            <a href="/login" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-[#11131b] shadow-[0_0_26px_rgba(255,255,255,0.18)]">
              Sign in
              <ArrowRight size={14} />
            </a>
          </section>
        )}

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(121,237,170,0.16),rgba(189,167,255,0.15)_44%,rgba(255,182,111,0.1)_76%,rgba(255,255,255,0.055)_100%)] p-5 shadow-[0_32px_110px_rgba(0,0,0,0.42),0_0_80px_rgba(189,167,255,0.08)] md:grid md:grid-cols-[minmax(0,1fr)_260px] md:gap-5 lg:p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_4%,rgba(159,240,191,0.34),transparent_26%),radial-gradient(circle_at_84%_8%,rgba(130,217,255,0.26),transparent_30%),radial-gradient(circle_at_52%_104%,rgba(255,182,111,0.22),transparent_32%)] blur-[3px]" />
              <div className="min-w-0">
                <div className="relative mb-5 flex flex-wrap items-center gap-2">
                  <StatusPill tone={workload.overloadScore >= 70 ? "red" : workload.overloadScore >= 45 ? "amber" : "green"}>
                    {Math.round(engineConfidence)}% context confidence
                  </StatusPill>
                  <StatusPill tone="neutral">{connectedSources}/2 live sources</StatusPill>
                  <StatusPill tone="neutral">Saved {formatTime(sync.lastSavedAt)}</StatusPill>
                </div>

                <p className="relative text-[12px] font-semibold uppercase tracking-[0.16em] text-white/52">Resume Work</p>
                <h1 className="relative mt-3 max-w-2xl text-[30px] font-semibold leading-[1.06] text-white sm:text-[40px] lg:text-[42px]">
                  Here is everything you need to continue your work.
                </h1>
                <p className="relative mt-4 max-w-2xl text-[14px] leading-6 text-white/62">
                  Zenly observes work signals, rebuilds the current context, and recommends the next move before asking you to open another app.
                </p>

                <div className="relative mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={resumeWork}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-[#11131b] shadow-[0_0_30px_rgba(255,255,255,0.18)] transition hover:shadow-[0_0_40px_rgba(255,255,255,0.26)]"
                  >
                    Resume Work
                    <ArrowRight size={16} />
                  </button>
                  <button
                    onClick={() => {
                      void gmail.refresh();
                      void slack.refresh();
                      void sync.saveSnapshot({ force: true });
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-5 text-[13px] font-semibold text-white/72 ring-1 ring-white/10 backdrop-blur-xl transition hover:bg-white/14 hover:text-white"
                  >
                    <RefreshCw size={16} />
                    Refresh Context
                  </button>
                </div>
              </div>

              <div className="relative mt-5 rounded-[24px] border border-white/[0.08] bg-black/24 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.03] backdrop-blur-2xl md:mt-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/48">Next best action</p>
                <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#9ff0bf] ring-1 ring-white/10">
                  <primaryItem.icon size={20} />
                </div>
                <h2 className="mt-4 text-[19px] font-semibold leading-6 text-white">{primaryItem.title}</h2>
                <p className="mt-3 text-[13px] leading-5 text-white/56">{primaryItem.detail}</p>
                <div className="mt-5 grid grid-cols-2 gap-2 text-[12px]">
                  <Metric label="Urgent" value={String(signals.gmailUrgent + signals.slackMentions)} />
                  <Metric label="Load" value={String(Math.round(workload.overloadScore))} />
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.07] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Resume briefing</p>
                  <h2 className="mt-1 text-[22px] font-semibold text-white">A clean read of what matters now.</h2>
                </div>
                <StatusPill tone="neutral">{Math.round(engineConfidence)}% confidence</StatusPill>
              </div>
              <div className="mt-5 divide-y divide-white/[0.06]">
                {contextItems.map((item) => (
                  <BriefingRow key={item.label} item={item} />
                ))}
              </div>
            </section>

            <section id="zenly-next-actions" className="rounded-[28px] border border-white/[0.08] bg-white/[0.07] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Recommended sequence</p>
                  <h2 className="mt-1 text-[22px] font-semibold text-white">Do the least switching first.</h2>
                </div>
                <StatusPill tone={sync.status === "error" ? "red" : sync.status === "saved" ? "green" : "neutral"}>
                  {sync.status === "saving" ? "Saving" : sync.status === "saved" ? "Synced" : sync.status === "error" ? "Sync issue" : "Ready"}
                </StatusPill>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="divide-y divide-white/[0.06]">
                  <ActionRow
                    step="01"
                    title={signals.gmailUrgent + signals.slackMentions > 0 ? "Answer urgent people-facing loops" : "Stay with the active project"}
                    detail={
                      signals.gmailUrgent + signals.slackMentions > 0
                        ? "Handle mentions and urgent mail before opening broad inboxes."
                        : "No urgent source is currently stronger than project continuation."
                    }
                    icon={UserRoundCheck}
                  />
                  <ActionRow
                    step="02"
                    title={signals.gmailUnread + signals.slackMessages > 0 ? "Review grouped changes" : "Skip the inbox scan"}
                    detail={
                      signals.gmailUnread + signals.slackMessages > 0
                        ? "Read by importance, not by app. Zenly keeps Gmail and Slack in one context queue."
                        : "Connected work sources are quiet enough to avoid a context reset."
                    }
                    icon={Search}
                  />
                  <ActionRow
                    step="03"
                    title="Commit the next work state"
                    detail="Save the decision, handoff, or next task into Memory so tomorrow starts with context."
                    icon={CheckCircle2}
                  />
                </div>

                <div className="rounded-[22px] bg-black/20 p-4 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Trust layer</p>
                  <h3 className="mt-1 text-[16px] font-semibold text-white">Why this is recommended</h3>
                  <div className="mt-4 space-y-2">
                    <TrustRow label="Evidence" value={`${signals.gmailUnread} Gmail, ${signals.slackMessages} Slack, ${Math.round(inputStats.activeSeconds / 60)}m activity`} />
                    <TrustRow label="Confidence" value={`${Math.round(engineConfidence)}%`} />
                    <TrustRow label="Action policy" value="Recommend first, execute after approval" />
                    <TrustRow label="Memory policy" value="Ask before learning durable preferences" />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.07] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Live inputs</p>
                  <h2 className="mt-1 text-[20px] font-semibold text-white">Sources</h2>
                </div>
                <Clock3 size={18} className="text-white/42" />
              </div>
              <div className="mt-4 space-y-2">
                <SourceRow name="Gmail" icon={Mail} account={gmail.account} onConnect={gmail.connect} />
                <SourceRow name="Slack" icon={MessageSquareText} account={slack.account} onConnect={slack.connect} />
                {sourceReadiness.slice(2).map((source) => (
                  <StaticSourceRow key={source.name} name={source.name} icon={source.icon} />
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.07] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Context Engine</p>
              <div className="mt-4 space-y-3">
                {engineMap.map((engine) => (
                  <EngineRow key={engine.name} {...engine} />
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.07] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Memory trail</p>
                  <h2 className="mt-1 text-[20px] font-semibold text-white">Recent context states</h2>
                </div>
                <History size={18} className="text-white/42" />
              </div>
              <div className="mt-4 space-y-2">
                {history.slice(0, 5).length > 0 ? (
                  history.slice(0, 5).map((row) => <HistoryRow key={row.id} row={row} />)
                ) : (
                  <p className="rounded-[18px] bg-black/22 p-3 text-[13px] leading-5 text-white/48 ring-1 ring-white/8">
                    Zenly will start saving context states after you sign in and activity produces meaningful signal.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatusPill({ tone, children }: { tone: "green" | "amber" | "red" | "neutral" | "blue"; children: React.ReactNode }) {
  const classes = {
    green: "bg-[#9ff0bf]/14 text-[#d5ffde] ring-[#9ff0bf]/22",
    amber: "bg-[#ffb66f]/14 text-[#ffe4c7] ring-[#ffb66f]/22",
    red: "bg-[#ff8f7a]/14 text-[#ffd6cf] ring-[#ff8f7a]/22",
    blue: "bg-white/10 text-white/58 ring-white/10",
    neutral: "bg-white/10 text-white/58 ring-white/10",
  };
  return <span className={cn("inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium ring-1 backdrop-blur-xl", classes[tone])}>{children}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-black/22 p-3 text-center ring-1 ring-white/8">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/42">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none text-white">{value}</p>
    </div>
  );
}

function BriefingRow({ item }: { item: ContextItem }) {
  const Icon = item.icon;

  return (
    <article className="grid gap-3 py-4 sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-start">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-white/68 ring-1 ring-white/10">
        <Icon size={17} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">{item.label}</p>
        <h3 className="mt-1 text-[15px] font-semibold leading-5 text-white">{item.title}</h3>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-white/54">{item.detail}</p>
      </div>
      <span className="w-fit rounded-full bg-black/18 px-3 py-1.5 text-[11px] font-medium leading-none text-white/52 ring-1 ring-white/[0.06]">
        {item.meta}
      </span>
    </article>
  );
}

function ActionRow({ step, title, detail, icon: Icon }: { step: string; title: string; detail: string; icon: LucideIcon }) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[42px_1fr_32px]">
      <span className="font-mono text-[12px] font-medium text-white/42">{step}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-white/68 ring-1 ring-white/10">
            <Icon size={15} />
          </span>
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-white/52 sm:ml-10">{detail}</p>
      </div>
      <ArrowRight size={17} className="hidden self-center text-white/36 sm:block" />
    </div>
  );
}

function TrustRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.055] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">{label}</p>
      <p className="mt-1 text-[13px] leading-5 text-white/84">{value}</p>
    </div>
  );
}

function SourceRow({
  name,
  icon: Icon,
  account,
  onConnect,
}: {
  name: string;
  icon: LucideIcon;
  account: ProviderAccount;
  onConnect: () => void;
}) {
  const connected = account.state === "connected" || account.state === "syncing";
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/22 p-3 ring-1 ring-white/[0.03]">
      <div className="relative flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[16px] bg-white/10 text-white/68 ring-1 ring-white/10">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white">{name}</p>
          <p className="truncate text-[12px] font-medium text-white/52">
            {connected ? account.displayName ?? "Connected" : account.configured ? "Not connected" : "Not configured"}
          </p>
        </div>
      </div>
      {connected ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#9ff0bf] shadow-[0_0_18px_rgba(159,240,191,0.8)]" />
      ) : (
        <button onClick={onConnect} className="inline-flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[12px] font-semibold text-[#11131b] shadow-[0_0_24px_rgba(255,255,255,0.18)] transition hover:shadow-[0_0_32px_rgba(255,255,255,0.24)]">
          Connect
        </button>
      )}
      </div>
    </div>
  );
}

function StaticSourceRow({ name, icon: Icon }: { name: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[22px] border border-white/[0.08] bg-black/22 p-3 ring-1 ring-white/[0.03]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-[16px] bg-white/10 text-white/58 ring-1 ring-white/10">
          <Icon size={16} />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-white">{name}</p>
          <p className="text-[12px] text-white/48">Waiting for connector</p>
        </div>
      </div>
      <span className="inline-flex h-8 items-center rounded-full bg-white/10 px-3 text-[11px] font-medium text-white/48 ring-1 ring-white/10">Soon</span>
    </div>
  );
}

function EngineRow({ name, status, icon: Icon }: { name: string; status: string; icon: LucideIcon }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-white/72 ring-1 ring-white/10">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white">{name} Engine</p>
        <p className="text-[12px] leading-5 text-white/48">{status}</p>
      </div>
    </div>
  );
}

function HistoryRow({ row }: { row: SnapshotRow }) {
  const date = new Date(row.captured_at);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-black/22 p-3 ring-1 ring-white/[0.07]">
      <div>
        <p className="text-[13px] font-semibold capitalize text-white">{row.state.replace("_", " ")}</p>
        <p className="text-[12px] text-white/48">{Number.isNaN(date.getTime()) ? "Saved context" : formatTime(date)}</p>
      </div>
      <span className="inline-flex h-8 items-center rounded-full bg-white/10 px-3 text-[12px] font-semibold text-white/68 ring-1 ring-white/10">{Math.round(row.overload_score)}</span>
    </div>
  );
}
