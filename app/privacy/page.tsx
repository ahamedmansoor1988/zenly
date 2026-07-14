import Link from "next/link";

export const metadata = {
  title: "Privacy — Zenly",
  description: "Privacy policy for Zenly.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050609] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-[13px] text-white/48 underline underline-offset-2 hover:text-white/70">← Back to Zenly</Link>
        <h1 className="mt-6 text-[32px] font-semibold">Privacy policy</h1>
        <p className="mt-2 text-[13px] text-white/42">Last updated July 2026</p>

        <div className="mt-8 space-y-6 text-[14px] leading-6 text-white/68">
          <section>
            <h2 className="text-[16px] font-semibold text-white">What we collect</h2>
            <p className="mt-2">
              With your permission, Zenly reads: Gmail unread/important/urgent counts (never message content),
              Slack unread message and channel counts (never message content), and in-app keyboard/mouse/trackpad
              activity while Zenly is open. We also store the context scores this produces and any notes you add
              yourself in Memory.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">How it&apos;s used</h2>
            <p className="mt-2">
              Signals are used only to compute your context state and generate resume-work guidance, plans, and
              reviews. Recent aggregate history may be sent to our AI provider (Groq) to write these in natural
              language. Only aggregate scores and counts are sent, never your raw messages.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">Storage & access</h2>
            <p className="mt-2">
              Your data is stored in Supabase, scoped to your account with row-level security — no other user can
              read your data, and we don&apos;t sell or share it with third parties.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">Your control</h2>
            <p className="mt-2">
              You can disconnect Gmail or Slack at any time from Settings, which deletes the stored connection and
              stops further access immediately. You can delete individual rows and tables you created in Memory
              at any time.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">Contact</h2>
            <p className="mt-2">Questions about your data? Reach out through the account you signed in with.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
