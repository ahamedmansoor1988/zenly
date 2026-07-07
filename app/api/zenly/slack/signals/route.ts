import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken, isTokenCryptoConfigured } from "@/lib/zenly/crypto";
import { fetchSlackSignals, getSlackCredentials, refreshSlackToken, SlackApiError } from "@/lib/zenly/slack";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const credentials = getSlackCredentials();
  if (!credentials || !isTokenCryptoConfigured()) {
    return NextResponse.json({ configured: false, connected: false });
  }

  const { data: account, error: accountError } = await supabase
    .from("zenly_connected_accounts")
    .select("id, display_name, access_token_encrypted, refresh_token_encrypted, expires_at, last_synced_at")
    .eq("user_id", authData.user.id)
    .eq("provider", "slack")
    .maybeSingle();

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }
  if (!account?.access_token_encrypted) {
    return NextResponse.json({ configured: true, connected: false });
  }

  let accessToken: string;
  let refreshToken: string | null = null;
  try {
    accessToken = decryptToken(account.access_token_encrypted);
    refreshToken = account.refresh_token_encrypted ? decryptToken(account.refresh_token_encrypted) : null;
  } catch {
    await supabase.from("zenly_connected_accounts").delete().eq("id", account.id);
    return NextResponse.json({ configured: true, connected: false });
  }

  async function refreshAccessToken() {
    if (!refreshToken || !account || !credentials) return false;
    try {
      const tokens = await refreshSlackToken({
        refreshToken,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      });
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken ?? refreshToken;
      await supabase
        .from("zenly_connected_accounts")
        .update({
          access_token_encrypted: encryptToken(tokens.accessToken),
          refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
          expires_at: tokens.expiresAt ? tokens.expiresAt.toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      return true;
    } catch {
      await supabase.from("zenly_connected_accounts").delete().eq("id", account.id);
      return false;
    }
  }

  // Slack user tokens only expire when token rotation is enabled for the app.
  const expiresSoon = account.expires_at ? new Date(account.expires_at).getTime() - Date.now() < 60_000 : false;
  if (expiresSoon && !(await refreshAccessToken())) {
    return NextResponse.json({ configured: true, connected: false });
  }

  let signals;
  try {
    signals = await fetchSlackSignals(accessToken);
  } catch (error) {
    if (error instanceof SlackApiError && error.isAuthError) {
      if (refreshToken && (await refreshAccessToken())) {
        try {
          signals = await fetchSlackSignals(accessToken);
        } catch {
          return NextResponse.json({ error: "Slack API request failed" }, { status: 502 });
        }
      } else {
        if (!refreshToken) {
          await supabase.from("zenly_connected_accounts").delete().eq("id", account.id);
        }
        return NextResponse.json({ configured: true, connected: false });
      }
    } else {
      return NextResponse.json({ error: "Slack API request failed" }, { status: 502 });
    }
  }

  const syncedAt = new Date().toISOString();
  await supabase
    .from("zenly_connected_accounts")
    .update({ signal_snapshot: signals, last_synced_at: syncedAt, updated_at: syncedAt })
    .eq("id", account.id);

  return NextResponse.json({
    configured: true,
    connected: true,
    displayName: account.display_name,
    lastSyncedAt: syncedAt,
    signals,
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { error } = await supabase
    .from("zenly_connected_accounts")
    .delete()
    .eq("user_id", authData.user.id)
    .eq("provider", "slack");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ connected: false });
}
