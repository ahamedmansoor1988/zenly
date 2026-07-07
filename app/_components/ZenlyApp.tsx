"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CirclePause,
  CirclePlay,
  Droplets,
  Eye,
  Headphones,
  HeartPulse,
  Home,
  Leaf,
  Mail,
  MessageSquareText,
  Moon,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type TabId = "morning" | "focus" | "nudges" | "sounds" | "night";
type ProviderState = "connected" | "syncing" | "disconnected";
type WorkloadState = "calm" | "focused" | "busy" | "overloaded" | "after_hours";
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

const tabs = [
  { id: "morning" as const, label: "Morning", icon: Home },
  { id: "focus" as const, label: "Focus", icon: Timer },
  { id: "nudges" as const, label: "Nudges", icon: Leaf },
  { id: "sounds" as const, label: "Sounds", icon: Waves },
  { id: "night" as const, label: "Night", icon: HeartPulse },
];

const focusModes = [
  { label: "Focus", minutes: 25, color: "#bda7ff", glow: "rgba(189,167,255,0.72)" },
  { label: "Break", minutes: 5, color: "#82d9ff", glow: "rgba(130,217,255,0.68)" },
  { label: "Long", minutes: 15, color: "#ffb66f", glow: "rgba(255,182,111,0.7)" },
];

const planItems = [
  { time: "09:15", title: "Clear urgent signals", desc: "Review the highest-signal Gmail and Slack items." },
  { time: "10:00", title: "Protected focus", desc: "Start one quiet 25 minute block before context switching." },
  { time: "11:30", title: "Body reset", desc: "Stretch, hydrate, and rest your eyes." },
  { time: "17:40", title: "Soft close", desc: "Review the day and choose a wind-down sound." },
];

const sounds = [
  { name: "Lo-fi", tone: "Focus", glow: "from-[#bda7ff] to-[#79edaa]" },
  { name: "Binaural", tone: "Deep", glow: "from-[#82d9ff] to-[#d6a7ff]" },
  { name: "Cafe", tone: "Warm", glow: "from-[#ffb66f] to-[#ffe28f]" },
  { name: "Rain", tone: "Night", glow: "from-[#77d2ff] to-[#9ff0bf]" },
];

const tabCopy = {
  morning: {
    label: "Morning",
    title: "A clear start for a full day.",
    desc: "Connect your inbox and workspace, then turn the noisy parts of the morning into a calm plan.",
  },
  focus: {
    label: "Focus",
    title: "Let the next block be simple.",
    desc: "Pick a mode, start the timer, and keep the rest of the interface quiet.",
  },
  nudges: {
    label: "Nudges",
    title: "Tiny resets before tension builds.",
    desc: "Keep stretch, eye, and hydration prompts available without making them loud.",
  },
  sounds: {
    label: "Sounds",
    title: "Pick a sound and let it carry you.",
    desc: "Choose a focus or night soundscape with a gentle visual rhythm.",
  },
  night: {
    label: "Night",
    title: "Let the day close softly.",
    desc: "Review what worked, what drained attention, and what tomorrow should protect.",
  },
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

function getTodayActivityKey() {
  return `zenly-input-activity-${new Date().toISOString().slice(0, 10)}`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
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
  focusMinutes,
  breaks,
}: {
  signals: CommunicationSignals;
  inputStats: InputActivityStats;
  focusMinutes: number;
  breaks: number;
}): WorkloadReport {
  const communicationLoad = getCommunicationLoad(signals);
  const activityLoad = getActivityLoad(inputStats);
  const durationLoad = clamp(inputStats.activeSeconds / 45 + focusMinutes * 0.9);
  const recoveryCredit = clamp(breaks * 12);
  const hour = new Date().getHours();
  const afterHours = hour < 8 || hour >= 18;
  const overloadScore = clamp(communicationLoad * 0.38 + activityLoad * 0.34 + durationLoad * 0.28 - recoveryCredit * 0.35);

  if (afterHours && overloadScore >= 35) {
    return {
      communicationLoad,
      activityLoad,
      durationLoad,
      recoveryCredit,
      overloadScore,
      state: "after_hours",
      headline: "After-hours pressure",
      message: "Work is still pulling on you. Queue a wind-down sound and close only the urgent loops.",
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
      headline: "Overload building",
      message: "You are carrying message pressure and active work at once. Take two minutes, then clear only urgent items.",
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
      headline: "Busy but manageable",
      message: "A short reset would keep this from spilling over. Stretch or rest your eyes before the next block.",
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
      headline: "Focused stretch",
      message: "You are in a strong work rhythm. Keep notifications quiet and take an eye reset after this block.",
    };
  }

  return {
    communicationLoad,
    activityLoad,
    durationLoad,
    recoveryCredit,
    overloadScore,
    state: "calm",
    headline: "Calm workload",
    message: "Signals are light right now. This is a good window for focused work or a clean planning pass.",
  };
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
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      window.localStorage.setItem(getTodayActivityKey(), JSON.stringify(stats));
    }, 250);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [stats]);

  useEffect(() => {
    function markActivity() {
      lastActivityAt.current = Date.now();
    }

    function onKeyDown() {
      markActivity();
      setStats((current) => ({
        ...current,
        keyPresses: current.keyPresses + 1,
        lastInput: "keyboard",
      }));
    }

    function onPointerDown(event: PointerEvent) {
      markActivity();
      lastPointer.current = { x: event.clientX, y: event.clientY };
      if (event.pointerType === "mouse" || event.pointerType === "") {
        setStats((current) => ({
          ...current,
          mouseClicks: current.mouseClicks + 1,
          lastInput: "mouse",
        }));
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

      setStats((current) => ({
        ...current,
        activeSeconds: current.activeSeconds + 1,
      }));
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

  return {
    stats,
    reset: () => {
      window.localStorage.removeItem(getTodayActivityKey());
      lastActivityAt.current = 0;
      lastPointer.current = null;
      lastPointerMoveAt.current = 0;
      setStats(emptyInputStats);
    },
  };
}

type AuthStatus = "loading" | "signed_in" | "signed_out";
type SyncStatus = "idle" | "saving" | "saved" | "signed_out" | "error";
type SnapshotRow = {
  id: string;
  captured_at: string;
  overload_score: number;
  state: WorkloadState;
};

function useSupabaseUser() {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setStatus(data.user ? "signed_in" : "signed_out");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session?.user ? "signed_in" : "signed_out");
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return status;
}

type ProviderId = "gmail" | "slack";
type ProviderAccount = {
  state: ProviderState;
  configured: boolean;
  signals: Record<string, number> | null;
  displayName: string | null;
};

const disconnectedAccount: ProviderAccount = { state: "disconnected", configured: true, signals: null, displayName: null };

const providerEnvHints: Record<ProviderId, string> = {
  gmail: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and ZENLY_TOKEN_SECRET",
  slack: "SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and ZENLY_TOKEN_SECRET",
};

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

  const previousState = useRef(workload.state);
  useEffect(() => {
    const entered = workload.state;
    if (previousState.current === entered) return;
    previousState.current = entered;
    if (entered === "busy" || entered === "overloaded" || entered === "after_hours") {
      void saveSnapshot({ force: true });
    }
  }, [saveSnapshot, workload.state]);

  return { status, lastSavedAt, saveSnapshot };
}

function GlowCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.075] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function IntegrationCard({
  provider,
  state,
  detail,
  icon: Icon,
  glow,
  metrics,
  onConnect,
}: {
  provider: string;
  state: ProviderState;
  detail?: string;
  icon: LucideIcon;
  glow: string;
  metrics: string[];
  onConnect: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/24 p-4 ring-1 ring-white/[0.03]">
      <div className={cn("absolute -right-10 -top-12 h-28 w-28 rounded-full blur-3xl", glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/12">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-white">{provider}</p>
            <p className={cn("mt-0.5 truncate text-[12px] font-medium text-white/52", !detail && "capitalize")}>
              {state === "disconnected" ? "Connect account" : detail ?? state}
            </p>
          </div>
        </div>
        <button onClick={onConnect} className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-[#11131b] shadow-[0_0_26px_rgba(255,255,255,0.24)]">
          {state === "disconnected" ? "Connect" : "Sync"}
        </button>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {metrics.map((metric) => (
          <span key={metric} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/48 ring-1 ring-white/10">
            {metric}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProgressRing({ progress, color, glow, label }: { progress: number; color: string; glow: string; label: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-black/28 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09),0_0_70px_rgba(189,167,255,0.2)]">
      <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 150 150" aria-hidden="true">
        <circle cx="75" cy="75" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="75"
          cy="75"
          r={radius}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="transition-all duration-500"
          style={{ filter: `drop-shadow(0 0 16px ${glow}) drop-shadow(0 0 34px ${glow})` }}
        />
      </svg>
      <div className="text-center">
        <p className="text-[29px] font-semibold leading-none text-white">{label}</p>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">remaining</p>
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <div className="flex h-16 items-center gap-1.5">
      {Array.from({ length: 22 }).map((_, index) => (
        <span
          key={index}
          className="w-1.5 rounded-full bg-[#82d9ff] opacity-85 animate-[zenlyWave_1.35s_ease-in-out_infinite]"
          style={{
            height: `${14 + ((index * 13) % 34)}px`,
            animationDelay: `${index * 0.045}s`,
            boxShadow: "0 0 18px rgba(130,217,255,0.5)",
          }}
        />
      ))}
    </div>
  );
}

export function ZenlyApp() {
  const [activeTab, setActiveTab] = useState<TabId>("morning");
  const [planBuilt, setPlanBuilt] = useState(false);
  const [planBuilding, setPlanBuilding] = useState(false);
  const [plan, setPlan] = useState<{ headline: string | null; items: typeof planItems }>({ headline: null, items: planItems });
  const [gmailState, setGmailState] = useState<ProviderState>("disconnected");
  const [slackState, setSlackState] = useState<ProviderState>("disconnected");
  const [modeIndex, setModeIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(focusModes[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(2);
  const [breaks, setBreaks] = useState(1);
  const [nudges, setNudges] = useState({ stretch: true, eyes: true, hydrate: true });
  const [sound, setSound] = useState("Lo-fi");
  const [volume, setVolume] = useState(58);
  const { stats: inputStats, reset: resetInputStats } = useInputActivity();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const lastWorkloadAlert = useRef("");

  const activeMode = focusModes[modeIndex];
  const totalSeconds = activeMode.minutes * 60;
  const progress = 1 - secondsLeft / totalSeconds;
  const timeLabel = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const focusMinutes = useMemo(() => sessions * 25 + Math.floor((totalSeconds - secondsLeft) / 60), [secondsLeft, sessions, totalSeconds]);
  const copy = tabCopy[activeTab];
  const inputMinutes = Math.floor(inputStats.activeSeconds / 60);
  const inputLoad = Math.min(
    100,
    Math.round(inputStats.keyPresses * 0.4 + inputStats.mouseClicks * 1.4 + inputStats.trackpadGestures * 0.8 + inputStats.mouseDistance / 420),
  );
  const authStatus = useSupabaseUser();
  const { account: gmailAccount, refresh: refreshGmail, connect: connectGmail } = useProviderAccount("gmail", authStatus);
  const { account: slackAccount, refresh: refreshSlack, connect: connectSlack } = useProviderAccount("slack", authStatus);
  const usingRealProviders = authStatus === "signed_in";
  const gmailCardState = usingRealProviders ? gmailAccount.state : gmailState;
  const slackCardState = usingRealProviders ? slackAccount.state : slackState;
  const communicationSignals = useMemo<CommunicationSignals>(() => {
    const realGmail = gmailAccount.signals;
    const realSlack = slackAccount.signals;
    return {
      gmailUnread: realGmail ? realGmail.unread ?? 0 : gmailState === "connected" ? 24 : 0,
      gmailImportant: realGmail ? realGmail.important ?? 0 : gmailState === "connected" ? 7 : 0,
      gmailUrgent: realGmail ? realGmail.urgent ?? 0 : gmailState === "connected" ? 3 : 0,
      slackMessages: realSlack ? realSlack.messages ?? 0 : slackState === "connected" ? 18 : 0,
      slackMentions: realSlack ? realSlack.mentions ?? 0 : slackState === "connected" ? 3 : 0,
      slackPriorityChannels: realSlack ? realSlack.priorityChannels ?? 0 : slackState === "connected" ? 2 : 0,
    };
  }, [gmailAccount.signals, gmailState, slackAccount.signals, slackState]);
  const workload = useMemo(
    () => getWorkloadReport({ signals: communicationSignals, inputStats, focusMinutes, breaks }),
    [breaks, communicationSignals, focusMinutes, inputStats],
  );
  const { status: syncStatus, lastSavedAt, saveSnapshot } = useWorkloadSync({
    authStatus,
    workload,
    signals: communicationSignals,
    inputStats,
  });
  const workloadHistory = useWorkloadHistory(authStatus === "signed_in", lastSavedAt);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setRunning(false);
          setSessions((value) => (modeIndex === 0 ? value + 1 : value));
          setBreaks((value) => (modeIndex === 0 ? value : value + 1));
          void saveSnapshot({ force: true });
          return totalSeconds;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [modeIndex, running, saveSnapshot, totalSeconds]);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setNotificationsEnabled(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (workload.state !== "overloaded" && workload.state !== "after_hours") return;
    if (inputStats.activeSeconds < 60) return;

    const alertKey = `${workload.state}-${Math.floor(inputStats.activeSeconds / 600)}`;
    if (lastWorkloadAlert.current === alertKey) return;
    lastWorkloadAlert.current = alertKey;

    new Notification(workload.headline, {
      body: workload.message,
      silent: true,
    });
  }, [inputStats.activeSeconds, notificationsEnabled, workload.headline, workload.message, workload.state]);

  function chooseMode(index: number) {
    setModeIndex(index);
    setSecondsLeft(focusModes[index].minutes * 60);
    setRunning(false);
  }

  async function buildPlan() {
    if (authStatus !== "signed_in") {
      setPlanBuilt(true);
      return;
    }
    setPlanBuilding(true);
    try {
      const response = await fetch("/api/zenly/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localTime: new Date().toTimeString().slice(0, 5),
          state: workload.state,
          overloadScore: workload.overloadScore,
          communicationLoad: workload.communicationLoad,
          activityLoad: workload.activityLoad,
          durationLoad: workload.durationLoad,
          gmailSignals: {
            unread: communicationSignals.gmailUnread,
            important: communicationSignals.gmailImportant,
            urgent: communicationSignals.gmailUrgent,
          },
          slackSignals: {
            messages: communicationSignals.slackMessages,
            mentions: communicationSignals.slackMentions,
            priorityChannels: communicationSignals.slackPriorityChannels,
          },
          focus: { sessions, minutes: focusMinutes, breaks },
        }),
      });
      const json = response.ok ? await response.json() : null;
      if (json?.plan?.items?.length) {
        setPlan({ headline: json.plan.headline ?? null, items: json.plan.items });
      }
    } catch {
      // fall back to the default plan below
    }
    setPlanBuilding(false);
    setPlanBuilt(true);
  }

  function simulateConnect(provider: "gmail" | "slack") {
    if (provider === "gmail") {
      setGmailState("syncing");
      window.setTimeout(() => setGmailState("connected"), 800);
      return;
    }
    setSlackState("syncing");
    window.setTimeout(() => setSlackState("connected"), 800);
  }

  async function enableWorkloadAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050609] text-white tracking-normal">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-16%] top-[-22%] h-[680px] w-[680px] rounded-full bg-[#79edaa]/28 blur-[145px]" />
        <div className="absolute right-[-12%] top-[-4%] h-[680px] w-[680px] rounded-full bg-[#bda7ff]/32 blur-[145px]" />
        <div className="absolute bottom-[-26%] left-[34%] h-[720px] w-[720px] rounded-full bg-[#ffb66f]/22 blur-[155px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.2))]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[calc(100vh-32px)] gap-4 lg:grid-cols-[86px_minmax(0,1fr)_292px]">
          <aside className="hidden flex-col justify-between rounded-[34px] border border-white/10 bg-white/[0.07] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl lg:flex">
            <div className="flex h-14 w-14 items-center justify-center rounded-[24px] bg-white/12 text-[#9ff0bf] shadow-[0_0_34px_rgba(159,240,191,0.18)] ring-1 ring-white/12">
              <Leaf size={20} />
            </div>
            <nav className="flex flex-col gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "group flex h-14 w-14 items-center justify-center rounded-[22px] text-white/42 transition",
                      selected && "bg-white/14 text-white shadow-[0_0_34px_rgba(255,255,255,0.14)] ring-1 ring-white/10",
                    )}
                    aria-label={tab.label}
                    aria-pressed={selected}
                    title={tab.label}
                  >
                    <Icon size={20} />
                  </button>
                );
              })}
            </nav>
            <button className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-white text-[#11131b] shadow-[0_0_30px_rgba(255,255,255,0.22)]">
              <Plus size={20} />
            </button>
          </aside>

          <section className="relative overflow-hidden rounded-[42px] border border-white/10 bg-[linear-gradient(145deg,rgba(121,237,170,0.18),rgba(189,167,255,0.19)_44%,rgba(255,182,111,0.13)_76%,rgba(255,255,255,0.06)_100%)] p-5 shadow-[0_36px_130px_rgba(0,0,0,0.42),0_0_90px_rgba(189,167,255,0.12)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_4%,rgba(159,240,191,0.34),transparent_26%),radial-gradient(circle_at_84%_8%,rgba(130,217,255,0.26),transparent_30%),radial-gradient(circle_at_52%_104%,rgba(255,182,111,0.22),transparent_32%)] blur-[3px]" />
            <div className="relative flex min-h-full flex-col">
              <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div className="max-w-2xl">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/52">{copy.label}</p>
                  <h1 className="mt-3 text-[38px] font-semibold leading-[1.04] text-white sm:text-[56px]">{copy.title}</h1>
                  <p className="mt-4 max-w-xl text-[15px] leading-6 text-white/66">{copy.desc}</p>
                </div>
                {activeTab === "morning" && (
                  <button
                    onClick={() => void buildPlan()}
                    disabled={planBuilding}
                    className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-3 text-[13px] font-semibold text-[#11131b] shadow-[0_0_36px_rgba(255,255,255,0.22)] disabled:opacity-70"
                  >
                    <Sparkles size={16} className={cn(planBuilding && "animate-spin")} />
                    {planBuilding ? "Building…" : "Build plan"}
                  </button>
                )}
              </header>

              <div className="mt-7 flex-1">
                {activeTab === "morning" && (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <GlowCard className="min-h-[420px]">
                      {plan.headline && planBuilt && (
                        <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.16em] text-white/55">{plan.headline}</p>
                      )}
                      <div className="grid gap-3">
                        {plan.items.map((item, index) => (
                          <div
                            key={`${item.time}-${index}`}
                            className={cn("grid grid-cols-[58px_minmax(0,1fr)] gap-4 transition duration-500", planBuilt ? "translate-y-0 opacity-100" : "translate-y-2 opacity-55")}
                            style={{ transitionDelay: `${index * 80}ms` }}
                          >
                            <span className="pt-4 font-mono text-[12px] font-medium text-white/42">{item.time}</span>
                            <div className="rounded-[22px] bg-black/24 p-4 ring-1 ring-white/8">
                              <p className="text-[15px] font-semibold text-white">{item.title}</p>
                              <p className="mt-1 text-[13px] leading-5 text-white/50">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlowCard>

                    <div className="space-y-3">
                      <IntegrationCard
                        provider="Gmail"
                        state={gmailCardState}
                        detail={usingRealProviders ? gmailAccount.displayName ?? undefined : undefined}
                        icon={Mail}
                        glow="bg-[#ff8f7a]/32"
                        metrics={gmailCardState !== "disconnected" ? [`${communicationSignals.gmailUnread} unread`, `${communicationSignals.gmailImportant} important`, `${communicationSignals.gmailUrgent} urgent`] : ["Inbox", "Urgent", "Important"]}
                        onConnect={
                          usingRealProviders
                            ? gmailAccount.state === "disconnected"
                              ? connectGmail
                              : () => void refreshGmail()
                            : () => simulateConnect("gmail")
                        }
                      />
                      <IntegrationCard
                        provider="Slack"
                        state={slackCardState}
                        detail={usingRealProviders ? slackAccount.displayName ?? undefined : undefined}
                        icon={MessageSquareText}
                        glow="bg-[#82d9ff]/34"
                        metrics={slackCardState !== "disconnected" ? [`${communicationSignals.slackMessages} messages`, `${communicationSignals.slackMentions} mentions`, `${communicationSignals.slackPriorityChannels} priority`] : ["Mentions", "Channels", "DMs"]}
                        onConnect={
                          usingRealProviders
                            ? slackAccount.state === "disconnected"
                              ? connectSlack
                              : () => void refreshSlack()
                            : () => simulateConnect("slack")
                        }
                      />
                    </div>
                  </div>
                )}

                {activeTab === "focus" && (
                  <GlowCard className="grid min-h-[430px] place-items-center">
                    <div className="flex flex-col items-center gap-6 text-center">
                      <ProgressRing progress={progress} color={activeMode.color} glow={activeMode.glow} label={timeLabel} />
                      <div className="flex rounded-full bg-black/24 p-1 ring-1 ring-white/10">
                        {focusModes.map((mode, index) => (
                          <button key={mode.label} onClick={() => chooseMode(index)} className={cn("rounded-full px-4 py-2 text-[13px] font-medium text-white/50", modeIndex === index && "bg-white/14 text-white shadow-[0_0_24px_rgba(255,255,255,0.1)]")}>
                            {mode.minutes} min
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setRunning((value) => !value)} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#11131b] shadow-[0_0_32px_rgba(255,255,255,0.22)]">
                          {running ? <CirclePause size={22} /> : <CirclePlay size={22} />}
                        </button>
                        <button onClick={() => setSecondsLeft(totalSeconds)} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/12">
                          <RotateCcw size={18} />
                        </button>
                      </div>
                    </div>
                  </GlowCard>
                )}

                {activeTab === "nudges" && (
                  <GlowCard className="min-h-[430px]">
                    <div className="grid gap-3">
                      {[
                        ["stretch", "Stretch", "Release neck and shoulders", Leaf],
                        ["eyes", "Eyes", "Look away for twenty seconds", Eye],
                        ["hydrate", "Hydrate", "Take a slow water break", Droplets],
                      ].map(([key, title, desc, Icon]) => (
                        <button key={key as string} onClick={() => setNudges((value) => ({ ...value, [key as keyof typeof nudges]: !value[key as keyof typeof nudges] }))} className="flex w-full items-center justify-between rounded-[24px] bg-black/22 p-4 text-left ring-1 ring-white/8">
                          <span className="flex items-center gap-4">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
                              <Icon size={19} />
                            </span>
                            <span>
                              <span className="block text-[15px] font-semibold text-white">{title as string}</span>
                              <span className="text-[13px] text-white/48">{desc as string}</span>
                            </span>
                          </span>
                          <span className={cn("h-8 w-14 shrink-0 rounded-full p-1 transition", nudges[key as keyof typeof nudges] ? "bg-[#9ff0bf] shadow-[0_0_24px_rgba(159,240,191,0.34)]" : "bg-white/12")}>
                            <span className={cn("block h-6 w-6 rounded-full bg-white transition", nudges[key as keyof typeof nudges] && "translate-x-6")} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </GlowCard>
                )}

                {activeTab === "sounds" && (
                  <GlowCard className="min-h-[430px]">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                      <div>
                        <p className="text-[14px] text-white/48">Now playing</p>
                        <h3 className="mt-1 text-[34px] font-semibold text-white">{sound}</h3>
                        <Waveform />
                        <input aria-label="Volume" value={volume} onChange={(event) => setVolume(Number(event.target.value))} type="range" min="0" max="100" className="mt-2 w-full accent-[#82d9ff]" />
                      </div>
                      <div className="grid gap-3">
                        {sounds.map((item) => (
                          <button key={item.name} onClick={() => setSound(item.name)} className={cn("rounded-[22px] bg-gradient-to-br p-4 text-left text-[#11131b] shadow-[0_0_32px_rgba(255,255,255,0.06)]", item.glow, sound === item.name && "ring-2 ring-white/50")}>
                            <span className="block text-[15px] font-semibold">{item.name}</span>
                            <span className="text-[12px] text-black/52">{item.tone}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </GlowCard>
                )}

                {activeTab === "night" && (
                  <GlowCard className="min-h-[430px]">
                    <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
                      <div className="bg-[linear-gradient(180deg,#242739,#ffb66f_82%)] p-6 text-white shadow-[0_0_60px_rgba(255,182,111,0.2)]">
                        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-white/48">Night score</p>
                        <p className="mt-7 text-[66px] font-light leading-none">75<span className="text-[26px]">%</span></p>
                      </div>
                      <div className="space-y-3">
                        {["Best work landed before noon.", "Tomorrow gets two protected focus blocks.", "Rain is ready for wind down."].map((insight) => (
                          <div key={insight} className="rounded-[22px] bg-black/22 p-4 text-[14px] font-medium text-white ring-1 ring-white/8">{insight}</div>
                        ))}
                        <button onClick={() => { setSound("Rain"); setActiveTab("sounds"); }} className="w-full rounded-full bg-white px-5 py-3 text-left text-[13px] font-semibold text-[#11131b] shadow-[0_0_34px_rgba(255,255,255,0.2)]">
                          Wind down with Rain
                        </button>
                      </div>
                    </div>
                  </GlowCard>
                )}
              </div>
            </div>
          </section>

          <aside className="grid gap-4 lg:grid-rows-[minmax(0,1.25fr)_auto_auto]">
            <GlowCard className="bg-[linear-gradient(180deg,rgba(130,217,255,0.2),rgba(159,240,191,0.11)_58%,rgba(255,255,255,0.07))]">
              <div className="absolute right-[-42px] top-[-42px] h-36 w-36 rounded-full bg-[#9ff0bf]/30 blur-3xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] text-white/48">Workload</p>
                    <p className="mt-1 text-[44px] font-light leading-none text-white">
                      {Math.round(workload.overloadScore)}<span className="text-[20px] text-white/42">/100</span>
                    </p>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize ring-1",
                    workload.state === "overloaded" || workload.state === "after_hours"
                      ? "bg-[#ffb66f]/20 text-[#ffcf9f] ring-[#ffb66f]/30"
                      : workload.state === "focused"
                        ? "bg-[#bda7ff]/20 text-[#d8ccff] ring-[#bda7ff]/30"
                        : "bg-[#9ff0bf]/18 text-[#c9ffd1] ring-[#9ff0bf]/28",
                  )}>
                    {workload.state.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#9ff0bf] shadow-[0_0_20px_rgba(159,240,191,0.62)]" style={{ width: `${workload.overloadScore}%` }} />
                </div>
                {workloadHistory.length > 1 && (
                  <div className="mt-3 flex h-8 items-end gap-1" aria-label="Recent workload history">
                    {[...workloadHistory].reverse().map((snapshot) => (
                      <span
                        key={snapshot.id}
                        title={`${Math.round(snapshot.overload_score)}/100 · ${snapshot.state.replace("_", " ")}`}
                        className={cn(
                          "min-w-1 flex-1 rounded-full",
                          snapshot.state === "overloaded" || snapshot.state === "after_hours" ? "bg-[#ffb66f]/80" : "bg-[#9ff0bf]/70",
                        )}
                        style={{ height: `${Math.max(12, snapshot.overload_score)}%` }}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-5 rounded-[24px] bg-black/24 p-4 ring-1 ring-white/8">
                  <p className="text-[15px] font-semibold text-white">{workload.headline}</p>
                  <p className="mt-2 text-[13px] leading-5 text-white/56">{workload.message}</p>
                  {!notificationsEnabled && (
                    <button onClick={enableWorkloadAlerts} className="mt-4 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-[#11131b] shadow-[0_0_24px_rgba(255,255,255,0.16)]">
                      Enable alerts
                    </button>
                  )}
                  <p className="mt-3 text-[11px] leading-4 text-white/38">
                    {syncStatus === "signed_out" ? (
                      <a href="/login?redirect=%2F" className="text-white/68 underline underline-offset-2 hover:text-white">
                        Sign in to save workload history →
                      </a>
                    ) : syncStatus === "error" ? (
                      "Snapshot sync failed. Retrying soon."
                    ) : syncStatus === "saving" ? (
                      "Saving snapshot…"
                    ) : lastSavedAt ? (
                      `Snapshot saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    ) : (
                      "Snapshots save automatically while you work."
                    )}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    [Math.round(workload.communicationLoad), "comm"],
                    [Math.round(workload.activityLoad), "activity"],
                    [Math.round(workload.durationLoad), "duration"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-[16px] bg-black/22 p-3 text-center ring-1 ring-white/8">
                      <p className="text-[18px] font-semibold text-white">{value}</p>
                      <p className="text-[10px] text-white/42">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </GlowCard>

            <GlowCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-white/48">Current focus</p>
                  <p className="mt-1 text-[28px] font-semibold text-white">{timeLabel}</p>
                </div>
                <Headphones size={22} className="text-white/48" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  [sessions, "sessions"],
                  [focusMinutes, "minutes"],
                  [breaks, "breaks"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-[16px] bg-black/22 p-3 text-center ring-1 ring-white/8">
                    <p className="text-[18px] font-semibold text-white">{value}</p>
                    <p className="text-[10px] text-white/42">{label}</p>
                  </div>
                ))}
              </div>
            </GlowCard>

            <GlowCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] text-white/48">Input load</p>
                  <p className="mt-1 text-[28px] font-semibold text-white">
                    {inputLoad}<span className="text-[15px] text-white/42">/100</span>
                  </p>
                </div>
                <button onClick={resetInputStats} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/68 ring-1 ring-white/10">
                  Reset
                </button>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#9ff0bf] shadow-[0_0_18px_rgba(159,240,191,0.58)]" style={{ width: `${inputLoad}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-[16px] bg-black/22 p-3 ring-1 ring-white/8">
                  <p className="text-[17px] font-semibold text-white">{inputStats.keyPresses}</p>
                  <p className="text-[10px] text-white/42">keys</p>
                </div>
                <div className="rounded-[16px] bg-black/22 p-3 ring-1 ring-white/8">
                  <p className="text-[17px] font-semibold text-white">{inputStats.mouseClicks}</p>
                  <p className="text-[10px] text-white/42">clicks</p>
                </div>
                <div className="rounded-[16px] bg-black/22 p-3 ring-1 ring-white/8">
                  <p className="text-[17px] font-semibold text-white">{inputStats.trackpadGestures}</p>
                  <p className="text-[10px] text-white/42">trackpad</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-white/38">
                {inputMinutes} active min in Zenly. Last input: {inputStats.lastInput}. Browser-only estimate.
              </p>
            </GlowCard>

            <nav className="flex items-center justify-between gap-2 rounded-full border border-white/10 bg-white/[0.075] p-2 shadow-[0_26px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl lg:hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex min-h-11 flex-1 items-center justify-center rounded-full px-3 py-2 text-white/48 transition",
                      selected && "bg-white/14 text-white shadow-[0_0_30px_rgba(255,255,255,0.12)]",
                    )}
                    aria-label={tab.label}
                    aria-pressed={selected}
                  >
                    <Icon size={17} />
                  </button>
                );
              })}
            </nav>

            <GlowCard className="hidden lg:block">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
                  <Moon size={18} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">Tonight</p>
                  <p className="text-[13px] text-white/48">Rain queued for wind down</p>
                </div>
              </div>
            </GlowCard>
          </aside>
        </div>
      </div>
    </main>
  );
}
