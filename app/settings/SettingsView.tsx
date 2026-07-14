"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, LogOut, Mail, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AccountStatus = { loading: boolean; connected: boolean; configured: boolean; displayName: string | null };

const emptyStatus: AccountStatus = { loading: true, connected: false, configured: true, displayName: null };

export function SettingsView() {
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_in" | "signed_out">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [gmail, setGmail] = useState<AccountStatus>(emptyStatus);
  const [slack, setSlack] = useState<AccountStatus>(emptyStatus);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setAuthStatus(data.user ? "signed_in" : "signed_out");
      setEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "signed_in") return;

    fetch("/api/zenly/gmail/signals")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return setGmail({ loading: false, connected: false, configured: true, displayName: null });
        setGmail({ loading: false, connected: Boolean(json.connected), configured: json.configured !== false, displayName: json.displayName ?? null });
      });

    fetch("/api/zenly/slack/signals")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return setSlack({ loading: false, connected: false, configured: true, displayName: null });
        setSlack({ loading: false, connected: Boolean(json.connected), configured: json.configured !== false, displayName: json.displayName ?? null });
      });
  }, [authStatus]);

  async function disconnect(provider: "gmail" | "slack") {
    await fetch(`/api/zenly/${provider}/signals`, { method: "DELETE" });
    if (provider === "gmail") setGmail({ loading: false, connected: false, configured: true, displayName: null });
    else setSlack({ loading: false, connected: false, configured: true, displayName: null });
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (authStatus === "loading") {
    return <main className="grid min-h-screen place-items-center bg-[#050609] text-white/50">Loading…</main>;
  }

  if (authStatus === "signed_out") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050609] px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-[20px] font-semibold">Sign in to manage settings</p>
          <a href="/login?redirect=%2Fsettings" className="mt-6 inline-block rounded-full bg-white px-5 py-3 text-[13px] font-semibold text-[#11131b] shadow-[0_0_34px_rgba(255,255,255,0.2)]">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050609] text-white">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-4 sm:px-6">
        <header className="flex items-center gap-3 py-2">
          <a href="/" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white/68 ring-1 ring-white/10" title="Back to Zenly">
            <ChevronLeft size={18} />
          </a>
          <div>
            <p className="text-[15px] font-semibold text-white">Settings</p>
            <p className="text-[12px] text-white/42">{email}</p>
          </div>
        </header>

        <div className="mt-6 space-y-4">
          <section className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4">
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Connected context sources</p>

            <AccountRow
              icon={Mail}
              name="Gmail"
              status={gmail}
              connectHref="/api/zenly/gmail/connect"
              onDisconnect={() => void disconnect("gmail")}
            />
            <div className="my-2 h-px bg-white/8" />
            <AccountRow
              icon={MessageSquareText}
              name="Slack"
              status={slack}
              connectHref="/api/zenly/slack/connect"
              onDisconnect={() => void disconnect("slack")}
            />
          </section>

          <section className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4">
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Account</p>
            <button
              onClick={() => void signOut()}
              disabled={signingOut}
              className="flex w-full items-center justify-between rounded-[16px] bg-black/24 px-4 py-3 text-left ring-1 ring-white/8 disabled:opacity-60"
            >
              <span className="text-[13px] font-medium text-white">{signingOut ? "Signing out…" : "Sign out"}</span>
              <LogOut size={16} className="text-white/48" />
            </button>
          </section>

          <p className="px-1 text-[11px] leading-4 text-white/32">
            <a href="/terms" className="underline underline-offset-2 hover:text-white/60">Terms</a>
            {" · "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-white/60">Privacy Policy</a>
          </p>
        </div>
      </div>
    </main>
  );
}

function AccountRow({
  icon: Icon,
  name,
  status,
  connectHref,
  onDisconnect,
}: {
  icon: typeof Mail;
  name: string;
  status: AccountStatus;
  connectHref: string;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] px-1 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-white">{name}</p>
          <p className="truncate text-[12px] text-white/42">
            {status.loading ? "Checking…" : status.connected ? status.displayName ?? "Connected" : !status.configured ? "Not configured yet" : "Not connected"}
          </p>
        </div>
      </div>
      {!status.loading && (
        status.connected ? (
          <button onClick={onDisconnect} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/68 ring-1 ring-white/10">
            Disconnect
          </button>
        ) : status.configured ? (
          <a href={connectHref} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#11131b]">
            Connect
          </a>
        ) : (
          <span className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/32">Unavailable</span>
        )
      )}
    </div>
  );
}
