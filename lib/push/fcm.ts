import { importPKCS8, SignJWT } from "jose";

type Credentials = {
  project_id: string;
  client_email: string;
  private_key: string;
};
let cachedToken: { value: string; expires: number } | undefined;
let tokenRequest: Promise<string> | undefined;

function credentials(): Credentials {
  const value = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!value) throw new Error("Missing FCM_SERVICE_ACCOUNT_JSON");
  let parsed: Credentials;
  try {
    parsed = JSON.parse(value) as Credentials;
  } catch {
    throw new Error("Invalid Firebase service account JSON");
  }
  if (
    !parsed.project_id ||
    !/^[a-z0-9-]+$/.test(parsed.project_id) ||
    !parsed.client_email ||
    !parsed.private_key
  )
    throw new Error("Invalid Firebase service account configuration");
  return parsed;
}

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    const account = credentials();
    const key = await importPKCS8(
      account.private_key.replace(/\\n/g, "\n"),
      "RS256",
    );
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Firebase authentication failed (${response.status})`);
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token || !body.expires_in)
      throw new Error("Firebase returned an invalid access token");
    cachedToken = {
      value: body.access_token,
      expires: Date.now() + Math.max(0, body.expires_in - 120) * 1000,
    };
    return body.access_token;
  })().finally(() => {
    tokenRequest = undefined;
  });
  return tokenRequest;
}

export function isPushTokenValid(token: string, environment: string) {
  return environment === "fcm"
    ? /^[A-Za-z0-9_:.-]{32,4096}$/.test(token)
    : /^[a-f0-9]{32,512}$/.test(token);
}

export async function prepareAndroidPush() {
  await accessToken();
}

export async function sendAndroidPush(input: {
  token: string;
  title: string;
  body: string;
  target: string;
  collapseId: string;
  ttlSeconds?: number;
}) {
  const authorization = await accessToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${credentials().project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
      },
      // Data-only messages keep foreground/background taps on the same native path.
      // ttl=0 prevents a completed task or yesterday's reminder arriving later.
      body: JSON.stringify({
        message: {
          token: input.token,
          data: { title: input.title, body: input.body, target: input.target },
          android: {
            priority: "HIGH",
            ttl: `${input.ttlSeconds ?? 0}s`,
            collapse_key: input.collapseId,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (response.ok) return { status: 200 };
  if (response.status === 401) cachedToken = undefined;
  const body = await response.json().catch(() => null);
  const code = body?.error?.details?.find(
    (detail: { errorCode?: string }) => detail.errorCode,
  )?.errorCode;
  return {
    status: response.status,
    reason:
      code === "UNREGISTERED" ? "BadDeviceToken" : (code ?? "FCM_REJECTED"),
  };
}
