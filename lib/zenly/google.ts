const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export type GmailTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
};

export type GmailSignalCounts = {
  unread: number;
  important: number;
  urgent: number;
};

export class GmailApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function gmailRedirectUri(origin: string) {
  return `${origin}/api/zenly/gmail/callback`;
}

export function buildGmailAuthUrl({ clientId, redirectUri, state }: { clientId: string; redirectUri: string; state: string }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function requestTokens(body: URLSearchParams): Promise<GmailTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GmailApiError(json.error_description ?? "Google token request failed", response.status, json.error);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    scopes: typeof json.scope === "string" ? json.scope.split(" ") : [],
  };
}

export function exchangeGmailCode({ code, redirectUri, clientId, clientSecret }: { code: string; redirectUri: string; clientId: string; clientSecret: string }) {
  return requestTokens(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
}

export function refreshGmailToken({ refreshToken, clientId, clientSecret }: { refreshToken: string; clientId: string; clientSecret: string }) {
  return requestTokens(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  );
}

async function gmailGet(accessToken: string, path: string) {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GmailApiError(json.error?.message ?? "Gmail API request failed", response.status, json.error?.status);
  }
  return json;
}

export async function fetchGmailProfile(accessToken: string): Promise<{ emailAddress: string | null }> {
  const profile = await gmailGet(accessToken, "/profile");
  return { emailAddress: profile.emailAddress ?? null };
}

export async function fetchGmailSignals(accessToken: string): Promise<GmailSignalCounts> {
  const urgentQuery = encodeURIComponent("is:unread is:important newer_than:1d");
  const [inbox, important, urgent] = await Promise.all([
    gmailGet(accessToken, "/labels/INBOX"),
    gmailGet(accessToken, "/labels/IMPORTANT"),
    gmailGet(accessToken, `/messages?q=${urgentQuery}&maxResults=1`),
  ]);

  return {
    unread: inbox.messagesUnread ?? 0,
    important: important.messagesUnread ?? 0,
    urgent: urgent.resultSizeEstimate ?? 0,
  };
}
