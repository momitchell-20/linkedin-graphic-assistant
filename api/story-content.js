const { createSign } = require("node:crypto");
const { readFile } = require("node:fs/promises");

const SNOWFLAKE_API_URL = process.env.SNOWFLAKE_ACCOUNT_URL
  ? `${String(process.env.SNOWFLAKE_ACCOUNT_URL).replace(/\/+$/g, "")}/api/v2/statements`
  : "";
const SNOWFLAKE_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE || "";
const SNOWFLAKE_ROLE = process.env.SNOWFLAKE_ROLE || "";
const SNOWFLAKE_DATABASE = process.env.SNOWFLAKE_DATABASE || "METRIC_STORES_MODELED";
const SNOWFLAKE_SCHEMA = process.env.SNOWFLAKE_SCHEMA || "CONTENT_V2";
const SNOWFLAKE_JWT_ISSUER = process.env.SNOWFLAKE_JWT_ISSUER || "";
const SNOWFLAKE_JWT_SUBJECT = process.env.SNOWFLAKE_JWT_SUBJECT || "";
const SNOWFLAKE_PRIVATE_KEY_PASSPHRASE = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || "";
const SNOWFLAKE_USER = process.env.SNOWFLAKE_USER || "";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function base64Url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeStoryUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/g, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return raw.replace(/\/+$/g, "");
  }
}

function normalizeStorySlug(value) {
  const normalized = normalizeStoryUrl(value);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    return parsed.pathname.replace(/^\/+/g, "").replace(/\/+$/g, "");
  } catch {
    return normalized.replace(/^\/+/g, "").replace(/\/+$/g, "");
  }
}

async function getPrivateKey() {
  if (process.env.SNOWFLAKE_PRIVATE_KEY) {
    return String(process.env.SNOWFLAKE_PRIVATE_KEY);
  }

  if (process.env.SNOWFLAKE_PRIVATE_KEY_FILE) {
    return readFile(process.env.SNOWFLAKE_PRIVATE_KEY_FILE, "utf8");
  }

  throw new Error("Missing SNOWFLAKE_PRIVATE_KEY or SNOWFLAKE_PRIVATE_KEY_FILE");
}

async function createJwt() {
  const privateKey = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SNOWFLAKE_JWT_ISSUER,
    sub: SNOWFLAKE_JWT_SUBJECT,
    iat: now,
    exp: now + 3600,
  };
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(
    {
      key: privateKey,
      passphrase: SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || undefined,
    },
    "base64",
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${signingInput}.${signature}`;
}

function snowflakeRequestHeaders(jwt) {
  return {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "linkedin-graphic-assistant/1.0",
    "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  };
}

async function snowflakeFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: options.headers?.Authorization || "",
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
      ? payload.message || payload.errorMessage || payload.error || response.statusText
      : response.statusText;
    throw new Error(`Snowflake SQL API request failed: ${message}`);
  }

  return payload;
}

function getResultRows(payload) {
  const rowType = Array.isArray(payload?.resultSetMetaData?.rowType)
    ? payload.resultSetMetaData.rowType
    : [];
  const columns = rowType.map((column) => String(column?.name || "").trim()).filter(Boolean);
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data.map((row) => {
    const entry = {};
    columns.forEach((columnName, index) => {
      entry[columnName] = row?.[index] ?? null;
    });
    return entry;
  });
}

async function runSnowflakeStatement(statement) {
  if (!SNOWFLAKE_API_URL) {
    throw new Error("Missing SNOWFLAKE_ACCOUNT_URL");
  }

  if (!SNOWFLAKE_JWT_ISSUER || !SNOWFLAKE_JWT_SUBJECT || !SNOWFLAKE_USER) {
    throw new Error("Missing Snowflake JWT auth env vars");
  }

  const jwt = await createJwt();
  const requestPayload = {
    statement,
    timeout: 30,
    database: SNOWFLAKE_DATABASE,
    schema: SNOWFLAKE_SCHEMA,
  };

  if (SNOWFLAKE_WAREHOUSE) {
    requestPayload.warehouse = SNOWFLAKE_WAREHOUSE;
  }

  if (SNOWFLAKE_ROLE) {
    requestPayload.role = SNOWFLAKE_ROLE;
  }

  const initialResponse = await snowflakeFetch(SNOWFLAKE_API_URL, {
    method: "POST",
    headers: snowflakeRequestHeaders(jwt),
    body: JSON.stringify(requestPayload),
  });

  if (Array.isArray(initialResponse?.data) && initialResponse.data.length) {
    return initialResponse;
  }

  const statementHandle = initialResponse?.statementHandle || String(initialResponse?.statementStatusUrl || "").split("/").filter(Boolean).pop() || "";
  if (!statementHandle) {
    return initialResponse;
  }

  const statementStatusUrl = `${SNOWFLAKE_API_URL}/${encodeURIComponent(statementHandle)}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await snowflakeFetch(statementStatusUrl, {
      method: "GET",
      headers: snowflakeRequestHeaders(jwt),
    });

    if (Array.isArray(statusResponse?.data) && statusResponse.data.length) {
      return statusResponse;
    }
  }

  throw new Error("Snowflake query timed out before returning data");
}

async function fetchPostContentByUrl(url) {
  const normalizedUrl = normalizeStoryUrl(url);
  if (!normalizedUrl) {
    throw new Error("Missing story url");
  }

  const slug = normalizeStorySlug(normalizedUrl);
  const escapedUrl = normalizedUrl.replace(/'/g, "''");
  const escapedSlug = slug.replace(/'/g, "''");

  const exactUrlQuery = `
    select
      latest.post_content as post_content,
      latest.post_content_raw as post_content_raw,
      latest.post_uri as post_uri,
      latest.post_history_id as post_history_id,
      latest.post_id as post_id
    from METRIC_STORES_MODELED.CONTENT_V2.POSTS_LOOKUP_URL_PUBLISHED_V2 as lookup
    join METRIC_STORES_MODELED.CONTENT_V2.POSTS_LATEST_V2 as latest
      on lookup.post_history_id = latest.post_history_id
     and lookup.post_id = latest.post_id
    where lookup.post_url = '${escapedUrl}'
    limit 1
  `;

  const exactUrlRows = getResultRows(await runSnowflakeStatement(exactUrlQuery));
  if (exactUrlRows.length) {
    return {
      normalizedUrl,
      slug,
      ...exactUrlRows[0],
    };
  }

  const slugQuery = `
    select
      post_content,
      post_content_raw,
      post_uri,
      post_history_id,
      post_id
    from METRIC_STORES_MODELED.CONTENT_V2.POSTS_LATEST_V2
    where post_uri = '${escapedSlug}'
       or post_uri_site = '${escapedSlug}'
       or post_uri_external = '${escapedSlug}'
    limit 1
  `;

  const slugRows = getResultRows(await runSnowflakeStatement(slugQuery));
  if (slugRows.length) {
    return {
      normalizedUrl,
      slug,
      ...slugRows[0],
    };
  }

  throw new Error("No matching Snowflake story was found for that URL");
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    let body = {};
    try {
      body = await new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => {
          raw += chunk;
        });
        req.on("end", () => {
          if (!raw) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Request body must be valid JSON"));
          }
        });
        req.on("error", reject);
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    const storyUrl = String(body?.url || body?.storyUrl || "").trim();
    if (!storyUrl) {
      sendJson(res, 400, { error: "Missing url" });
      return;
    }

    const result = await fetchPostContentByUrl(storyUrl);
    const fullStoryText = String(result.post_content || result.post_content_raw || "").trim();
    if (!fullStoryText) {
      throw new Error("Snowflake returned an empty story body");
    }

    sendJson(res, 200, {
      url: storyUrl,
      normalizedUrl: result.normalizedUrl,
      slug: result.slug,
      postUri: result.post_uri || "",
      postHistoryId: result.post_history_id || "",
      postId: result.post_id || "",
      fullStoryText,
    });
  } catch (error) {
    sendJson(res, 503, { error: error.message });
  }
};
