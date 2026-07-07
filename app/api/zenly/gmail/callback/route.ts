import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/zenly/crypto";
import { exchangeGmailCode, fetchGmailProfile, getGoogleCredentials, gmailRedirectUri } from "@/lib/zenly/google";

export const dynamic = "force-dynamic";

function redirectHome(request: NextRequest, result: "connected" | "error") {
  const response = NextResponse.redirect(new URL(`/?zenly_gmail=${result}`, request.url));
  response.cookies.delete("zenly_gmail_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.redirect(new URL("/login?redirect=%2F", request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("zenly_gmail_oauth_state")?.value;
  const credentials = getGoogleCredentials();

  if (!credentials || !code || !state || !expectedState || state !== expectedState) {
    return redirectHome(request, "error");
  }

  try {
    const tokens = await exchangeGmailCode({
      code,
      redirectUri: gmailRedirectUri(origin),
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });
    const profile = await fetchGmailProfile(tokens.accessToken);

    const { error } = await supabase.from("zenly_connected_accounts").upsert(
      {
        user_id: data.user.id,
        provider: "gmail",
        provider_account_id: profile.emailAddress,
        display_name: profile.emailAddress,
        access_token_encrypted: encryptToken(tokens.accessToken),
        refresh_token_encrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        scopes: tokens.scopes,
        expires_at: tokens.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

    if (error) {
      return redirectHome(request, "error");
    }
    return redirectHome(request, "connected");
  } catch {
    return redirectHome(request, "error");
  }
}
