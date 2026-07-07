const SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_API = "https://slack.com/api";

export const SLACK_USER_SCOPES = "channels:read,groups:read,im:read,mpim:read";

const AUTH_ERROR_CODES = new Set(["invalid_auth", "token_revoked", "token_expired", "account_inactive", "not_authed"]);

export type SlackTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
  teamName: string | null;
  slackUserId: string | null;
};

export type SlackSignalCounts = {
  messages: number;
  mentions: number;
  priorityChannels: number;
};

export class SlackApiError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }

  get isAuthError() {
    return AUTH_ERROR_CODES.has(this.code);
  }
}

export function getSlackCredentials() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function slackRedirectUri(origin: string) {
  return `${origin}/api/zenly/slack/callback`;
}

export function buildSlackAuthUrl({ clientId, redirectUri, state }: { clientId: string; redirectUri: string; state: string }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    user_scope: SLACK_USER_SCOPES,
    state,
  });
  return `${SLACK_AUTH_URL}?${params.toString()}`;
}

async function slackCall(path: string, init: RequestInit) {
  const response = await fetch(`${SLACK_API}/${path}`, { ...init, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!json.ok) {
    throw new SlackApiError(`Slack API ${path} failed: ${json.error ?? response.status}`, json.error ?? "unknown_error");
  }
  return json;
}

function parseAuthedUser(json: {
  authed_user?: { id?: string; access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  team?: { name?: string };
}): SlackTokens {
  const user = json.authed_user;
  if (!user?.access_token) {
    throw new SlackApiError("Slack response did not include a user token", "no_user_token");
  }
  return {
    accessToken: user.access_token,
    refreshToken: user.refresh_token ?? null,
    expiresAt: user.expires_in ? new Date(Date.now() + user.expires_in * 1000) : null,
    scopes: typeof user.scope === "string" ? user.scope.split(",") : [],
    teamName: json.team?.name ?? null,
    slackUserId: user.id ?? null,
  };
}

export async function exchangeSlackCode({ code, redirectUri, clientId, clientSecret }: { code: string; redirectUri: string; clientId: string; clientSecret: string }) {
  const json = await slackCall("oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
  });
  return parseAuthedUser(json);
}

export async function refreshSlackToken({ refreshToken, clientId, clientSecret }: { refreshToken: string; clientId: string; clientSecret: string }) {
  const json = await slackCall("oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  return parseAuthedUser(json);
}

function slackGet(accessToken: string, method: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return slackCall(`${method}?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

type SlackConversation = {
  id: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_member?: boolean;
  is_archived?: boolean;
};

const MAX_CONVERSATIONS_CHECKED = 30;
const PRIORITY_UNREAD_THRESHOLD = 5;

export async function fetchSlackSignals(accessToken: string): Promise<SlackSignalCounts> {
  const list = await slackGet(accessToken, "conversations.list", {
    types: "public_channel,private_channel,im,mpim",
    exclude_archived: "true",
    limit: "200",
  });

  const conversations = (list.channels ?? []) as SlackConversation[];
  const direct = conversations.filter((c) => c.is_im || c.is_mpim);
  const channels = conversations.filter((c) => !c.is_im && !c.is_mpim && c.is_member);
  const candidates = [...direct, ...channels].slice(0, MAX_CONVERSATIONS_CHECKED);

  const infos = await Promise.all(
    candidates.map((conversation) =>
      slackGet(accessToken, "conversations.info", { channel: conversation.id }).catch((error) => {
        if (error instanceof SlackApiError && error.isAuthError) throw error;
        return null;
      }),
    ),
  );

  let messages = 0;
  let mentions = 0;
  let priorityChannels = 0;

  infos.forEach((info, index) => {
    const unread = info?.channel?.unread_count_display ?? 0;
    if (unread <= 0) return;
    const conversation = candidates[index];
    messages += unread;
    if (conversation.is_im || conversation.is_mpim) {
      mentions += unread;
    } else if (unread >= PRIORITY_UNREAD_THRESHOLD) {
      priorityChannels += 1;
    }
  });

  return { messages, mentions, priorityChannels };
}
