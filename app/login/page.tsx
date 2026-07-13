"use client";
import { Leaf, HeartPulse, Timer, Waves } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const features = [
  { icon: HeartPulse, title: "Overload radar", desc: "Gmail, Slack, and activity signals become one gentle workload score." },
  { icon: Timer, title: "Protected focus", desc: "Quiet focus blocks and soft nudges before tension builds." },
  { icon: Waves, title: "Soft landings", desc: "Wind-down sounds and a calm review to close the day." },
];

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient();
    const redirectParam = new URLSearchParams(window.location.search).get("redirect");
    const next = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : "/";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050609] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-18%] top-[-24%] h-[620px] w-[620px] rounded-full bg-[#79edaa]/25 blur-[140px]" />
        <div className="absolute right-[-14%] top-[-6%] h-[620px] w-[620px] rounded-full bg-[#bda7ff]/28 blur-[140px]" />
        <div className="absolute bottom-[-28%] left-[30%] h-[660px] w-[660px] rounded-full bg-[#ffb66f]/18 blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-12">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2">
          <div className="hidden lg:block">
            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-white/10 text-[#9ff0bf] shadow-[0_0_34px_rgba(159,240,191,0.2)] ring-1 ring-white/12">
                <Leaf size={22} />
              </span>
              <span className="text-[26px] font-semibold tracking-tight">Zenly</span>
            </div>
            <h1 className="max-w-md text-[40px] font-semibold leading-[1.08]">
              A calmer shape for your workday.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-6 text-white/60">
              Zenly watches the pressure building in your inbox, your Slack, and your hands on the keyboard — and steps in gently before it spills over.
            </p>
            <div className="mt-10 space-y-5">
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-white/80 ring-1 ring-white/10">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-white">{title}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-white/50">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[400px]">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.07] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-white/10 text-[#9ff0bf] ring-1 ring-white/12">
                  <Leaf size={20} />
                </span>
                <span className="text-[22px] font-semibold tracking-tight">Zenly</span>
              </div>

              <h2 className="text-[26px] font-semibold">Welcome back</h2>
              <p className="mt-2 text-[14px] leading-5 text-white/55">
                Sign in to save your workload history and let Zenly plan a softer day.
              </p>

              <button
                onClick={signInWithGoogle}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-3.5 text-[14px] font-semibold text-[#11131b] shadow-[0_0_36px_rgba(255,255,255,0.22)] transition hover:shadow-[0_0_48px_rgba(255,255,255,0.3)]"
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                  <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                  <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
                  <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
                </svg>
                Continue with Google
              </button>

              <p className="mt-6 text-center text-[11px] leading-4 text-white/35">
                By continuing you agree to our{" "}
                <a href="/terms" className="underline underline-offset-2 hover:text-white/60">Terms</a>
                {" & "}
                <a href="/privacy" className="underline underline-offset-2 hover:text-white/60">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
