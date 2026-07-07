import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTokenCryptoConfigured } from "@/lib/zenly/crypto";
import { buildSlackAuthUrl, getSlackCredentials, slackRedirectUri } from "@/lib/zenly/slack";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.redirect(new URL("/login?redirect=%2F", request.url));
  }

  const credentials = getSlackCredentials();
  if (!credentials || !isTokenCryptoConfigured()) {
    return NextResponse.json(
      { error: "Slack OAuth is not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and ZENLY_TOKEN_SECRET." },
      { status: 503 },
    );
  }

  const state = randomUUID();
  const origin = new URL(request.url).origin;
  const authUrl = buildSlackAuthUrl({
    clientId: credentials.clientId,
    redirectUri: slackRedirectUri(origin),
    state,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("zenly_slack_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    maxAge: 600,
    path: "/api/zenly/slack",
  });
  return response;
}
