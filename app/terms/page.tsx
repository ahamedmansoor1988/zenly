import Link from "next/link";

export const metadata = {
  title: "Terms — Zenly",
  description: "Terms of use for Zenly.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#050609] px-6 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-[13px] text-white/48 underline underline-offset-2 hover:text-white/70">← Back to Zenly</Link>
        <h1 className="mt-6 text-[32px] font-semibold">Terms of use</h1>
        <p className="mt-2 text-[13px] text-white/42">Last updated July 2026</p>

        <div className="mt-8 space-y-6 text-[14px] leading-6 text-white/68">
          <section>
            <h2 className="text-[16px] font-semibold text-white">What Zenly is</h2>
            <p className="mt-2">
              Zenly is a personal wellness companion. It reads signals you choose to connect — Gmail, Slack, and
              in-app activity — to estimate your workload and suggest gentle interventions. It is not a medical
              device and does not provide medical or mental health advice.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">Your account</h2>
            <p className="mt-2">
              You sign in with Google. You&apos;re responsible for keeping your account secure and for any integrations
              (Gmail, Slack) you choose to connect. You can disconnect any integration at any time from Settings.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">Automations</h2>
            <p className="mt-2">
              You can create automations that react to your workload state — for example, sending a browser
              notification or logging a note. You&apos;re in control of what automations exist and can disable or
              delete them at any time.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">No warranty</h2>
            <p className="mt-2">
              Zenly is provided as-is, without warranty of any kind. Workload scores and AI-generated plans and
              reviews are estimates meant to be gently informative, not precise or authoritative measurements of
              your wellbeing.
            </p>
          </section>
          <section>
            <h2 className="text-[16px] font-semibold text-white">Changes</h2>
            <p className="mt-2">These terms may change as Zenly evolves. Continued use after a change means you accept the update.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
