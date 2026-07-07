export type NightReview = {
  score: number;
  insights: string[];
  windDown: string;
};

export type SnapshotForReview = {
  captured_at: string;
  overload_score: number;
  state: string;
};

export type NightReviewContext = {
  localTime: string;
  snapshots: SnapshotForReview[];
  focus: { sessions: number; minutes: number; breaks: number };
};

export type DayStats = {
  snapshotCount: number;
  averageScore: number;
  peakScore: number;
  peakTime: string | null;
  stateMinutes: Record<string, number>;
  overloadedShare: number;
};

function computeDayStats(snapshots: SnapshotForReview[]): DayStats {
  if (snapshots.length === 0) {
    return { snapshotCount: 0, averageScore: 0, peakScore: 0, peakTime: null, stateMinutes: {}, overloadedShare: 0 };
  }

  const sorted = [...snapshots].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
  const scores = sorted.map((s) => s.overload_score);
  const averageScore = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const peakScore = Math.max(...scores);
  const peakSnapshot = sorted.find((s) => s.overload_score === peakScore) ?? null;

  const stateMinutes: Record<string, number> = {};
  let overloadedCount = 0;
  for (const snapshot of sorted) {
    stateMinutes[snapshot.state] = (stateMinutes[snapshot.state] ?? 0) + 1;
    if (snapshot.state === "overloaded" || snapshot.state === "after_hours") overloadedCount += 1;
  }

  return {
    snapshotCount: sorted.length,
    averageScore,
    peakScore,
    peakTime: peakSnapshot ? new Date(peakSnapshot.captured_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null,
    stateMinutes,
    overloadedShare: overloadedCount / sorted.length,
  };
}

function heuristicScore(stats: DayStats): number {
  if (stats.snapshotCount === 0) return 70;
  const base = 100 - stats.averageScore * 0.6 - stats.overloadedShare * 30;
  return Math.round(Math.min(96, Math.max(20, base)));
}

function describeDay(context: NightReviewContext, stats: DayStats): string {
  if (stats.snapshotCount === 0) {
    return `Local time: ${context.localTime}\nNo workload snapshots were recorded today.\nFocus: ${context.focus.sessions} sessions, ${context.focus.minutes} minutes, ${context.focus.breaks} breaks.`;
  }

  const stateBreakdown = Object.entries(stats.stateMinutes)
    .map(([state, count]) => `${state.replace("_", " ")}: ${count}`)
    .join(", ");

  return [
    `Local time: ${context.localTime}`,
    `Snapshots recorded today: ${stats.snapshotCount}`,
    `Average overload score: ${Math.round(stats.averageScore)}/100`,
    `Peak overload score: ${Math.round(stats.peakScore)}/100${stats.peakTime ? ` around ${stats.peakTime}` : ""}`,
    `Share of day spent overloaded or after-hours: ${Math.round(stats.overloadedShare * 100)}%`,
    `State breakdown (snapshot counts): ${stateBreakdown}`,
    `Focus sessions: ${context.focus.sessions}, focus minutes: ${context.focus.minutes}, breaks taken: ${context.focus.breaks}`,
  ].join("\n");
}

function parseReview(raw: string): NightReview | null {
  const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const review = parsed as { score?: unknown; insights?: unknown; windDown?: unknown };

  const score = typeof review.score === "number" ? review.score : Number(review.score);
  if (!Number.isFinite(score)) return null;

  if (!Array.isArray(review.insights)) return null;
  const insights = review.insights.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 4).map((item) => item.slice(0, 140));
  if (insights.length < 2) return null;

  if (typeof review.windDown !== "string" || review.windDown.length === 0) return null;

  return { score: Math.round(Math.min(100, Math.max(0, score))), insights, windDown: review.windDown.slice(0, 120) };
}

export async function generateNightReview(context: NightReviewContext): Promise<NightReview> {
  const stats = computeDayStats(context.snapshots);
  const fallback: NightReview = {
    score: heuristicScore(stats),
    insights:
      stats.snapshotCount === 0
        ? ["No workload data was captured today.", "Tomorrow, keep Zenly open to build a real picture of your day."]
        : [
            `Overload peaked around ${Math.round(stats.peakScore)}/100${stats.peakTime ? ` near ${stats.peakTime}` : ""}.`,
            `${Math.round(stats.overloadedShare * 100)}% of tracked moments were overloaded or after-hours.`,
          ],
    windDown: "Rain is ready for wind down.",
  };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are Zenly, a calm wellness companion. Write a short, honest night review of someone's workday based on their actual workload signal history.

Rules:
- "score" is a 0-100 "day quality" score: higher means the day stayed calm and sustainable, lower means it was overloaded or ran into after-hours. Base it on the data given, not guesses.
- "insights" is 2-3 short factual observations about what actually happened today (peak overload time, how much of the day was overloaded, focus consistency). Be specific and grounded in the numbers given. No hustle language, no exclamation marks.
- "windDown" is one short, warm sentence recommending a specific wind-down action for tonight.
- If there is no data for today, say so honestly rather than inventing details.

Output ONLY valid JSON, no text before or after, in this exact shape:
{"score": <number 0-100>, "insights": ["...", "..."], "windDown": "..."}`,
          },
          {
            role: "user",
            content: describeDay(context, stats),
          },
        ],
      }),
    });

    if (!response.ok) return fallback;
    const json = await response.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallback;
    return parseReview(content) ?? fallback;
  } catch {
    return fallback;
  }
}
