const { createSign } = require("node:crypto");
const { readFile } = require("node:fs/promises");

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_SCOPE = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
].join(" ");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getServiceAccountJson() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return Promise.resolve(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    return readFile(filePath, "utf8").then((text) => JSON.parse(text));
  }

  throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE");
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: TOKEN_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payloadJson = await response.json();
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${payloadJson.error_description || payloadJson.error || response.status}`);
  }

  return payloadJson.access_token;
}

async function googleFetch(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && typeof payload === "object"
      ? payload.error?.message || payload.error_description || payload.error || response.statusText
      : response.statusText;
    throw new Error(`Google API request failed: ${message}`);
  }

  return payload;
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "https://linkedin-graphic-assistant.vercel.app");
    const fileId = url.searchParams.get("id");

    if (!fileId) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }

    const serviceAccount = await getServiceAccountJson();
    const accessToken = await getAccessToken(serviceAccount);
    const metadata = await googleFetch(
      `${DRIVE_API_BASE}/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=mimeType,name`,
      accessToken,
    );
    const mimeType = String(metadata?.mimeType || "").trim() || "application/octet-stream";

    const mediaResponse = await fetch(
      `${DRIVE_API_BASE}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!mediaResponse.ok) {
      throw new Error(`Drive media fetch failed: ${mediaResponse.status} ${mediaResponse.statusText}`);
    }

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(buffer);
  } catch (error) {
    sendJson(res, 503, { error: error.message });
  }
};
