export type PlanItem = {
  time: string;
  title: string;
  desc: string;
};

export type GeneratedPlan = {
  headline: string;
  items: PlanItem[];
};

export type PlanContext = {
  localTime: string;
  state: string;
  overloadScore: number;
  communicationLoad: number;
  activityLoad: number;
  durationLoad: number;
  gmailSignals: { unread: number; important: number; urgent: number } | null;
  slackSignals: { messages: number; mentions: number; priorityChannels: number } | null;
  focus: { sessions: number; minutes: number; breaks: number };
  recentStates: string[];
};

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

function describeSignals(context: PlanContext) {
  const lines = [
    `Local time: ${context.localTime}`,
    `Workload state: ${context.state} (overload score ${Math.round(context.overloadScore)}/100)`,
    `Communication load ${Math.round(context.communicationLoad)}, activity load ${Math.round(context.activityLoad)}, duration load ${Math.round(context.durationLoad)}`,
    `Focus so far: ${context.focus.sessions} sessions, ${context.focus.minutes} focus minutes, ${context.focus.breaks} breaks`,
  ];
  if (context.gmailSignals) {
    lines.push(`Gmail: ${context.gmailSignals.unread} unread, ${context.gmailSignals.important} important, ${context.gmailSignals.urgent} urgent`);
  }
  if (context.slackSignals) {
    lines.push(`Slack: ${context.slackSignals.messages} unread messages, ${context.slackSignals.mentions} direct/DM, ${context.slackSignals.priorityChannels} busy channels`);
  }
  if (context.recentStates.length > 0) {
    lines.push(`Recent workload states (newest first): ${context.recentStates.join(", ")}`);
  }
  return lines.join("\n");
}

function parsePlan(raw: string): GeneratedPlan | null {
  const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const plan = parsed as { headline?: unknown; items?: unknown };
  if (typeof plan.headline !== "string" || !Array.isArray(plan.items)) return null;

  const items = plan.items
    .filter(
      (item): item is PlanItem =>
        Boolean(item) &&
        typeof (item as PlanItem).time === "string" &&
        TIME_PATTERN.test((item as PlanItem).time) &&
        typeof (item as PlanItem).title === "string" &&
        typeof (item as PlanItem).desc === "string",
    )
    .slice(0, 6)
    .map((item) => ({
      time: item.time.padStart(5, "0"),
      title: item.title.slice(0, 60),
      desc: item.desc.slice(0, 160),
    }));

  if (items.length < 3) return null;
  return { headline: plan.headline.slice(0, 80), items };
}

export async function generatePlan(context: PlanContext): Promise<GeneratedPlan | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are Zenly, a calm wellness companion for communication-heavy workdays. Given a person's current workload signals, produce a short plan for the rest of their day that protects focus and recovery.

Rules:
- 4 or 5 plan items, all at times AFTER the given local time, in chronological order, ending by 18:30 unless the person is already working after hours.
- Each item is one concrete, gentle action. Mix signal triage (email/Slack), one protected focus block, one body reset (stretch/eyes/hydrate/walk), and a soft close for the day.
- If overload is high, lead with a two-minute reset before anything else. If workload is calm, favor deep focus.
- Warm, quiet tone. No hustle language, no exclamation marks.

Output ONLY valid JSON, no text before or after, in this exact shape:
{"headline":"<max 8 words>","items":[{"time":"HH:MM","title":"<max 5 words>","desc":"<one sentence, max 18 words>"}]}`,
        },
        {
          role: "user",
          content: describeSignals(context),
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  return parsePlan(content);
}
