const { createSign } = require("node:crypto");
const { readFile } = require("node:fs/promises");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const READ_SHEET_TAB_NAME = process.env.GOOGLE_SHEET_TAB_NAME || "Current Suggestions";
const WRITE_SHEET_TAB_NAME = process.env.GOOGLE_SHEET_WRITE_TAB_NAME || "LinkedIn Story Suggestions";
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "A:O";
const DRIVE_APPROVAL_FOLDER_ID = process.env.GOOGLE_DRIVE_APPROVAL_FOLDER_ID || "";
const PUBLIC_APP_BASE_URL = "https://linkedin-graphic-assistant.vercel.app";
const POSTED_HEADERS = ["Already Posted?", "Posted?"];
const APPROVAL_HEADERS = [
  "Slack Approval Status",
  "Slack Image URL",
  "Slack Headline",
  "Slack Story URL",
  "Slack Requested At",
];
const APPROVAL_RANGE = "I1:M1";
const APPROVAL_ROW_START_COLUMN = "I";
const TOKEN_SCOPE = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
].join(" ");
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ZAPIER_READY_STATUS = "READY_FOR_SLACK";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
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
}

function isTruthy(value) {
  return ["true", "t", "yes", "y", "1"].includes(String(value || "").trim().toLowerCase());
}

function parseUsDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return text;
}

function columnToLetter(columnNumber) {
  let n = columnNumber;
  let result = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }

  return result;
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

async function getServiceAccount() {
  return getServiceAccountJson();
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
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

async function updateSheetValues(accessToken, sheetTitle, cellRange, values) {
  const updateUrl = `${SHEETS_API_BASE}/${encodeURIComponent(SHEET_ID)}/values/${encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!${cellRange}`)}?valueInputOption=RAW`;
  await googleFetch(updateUrl, accessToken, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: `'${sheetTitle.replace(/'/g, "''")}'!${cellRange}`,
      majorDimension: "ROWS",
      values,
    }),
  });
}

async function getSpreadsheetMetadata(accessToken) {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(SHEET_ID)}?fields=sheets(properties(sheetId,title))`;
  const payload = await googleFetch(url, accessToken);
  return payload.sheets || [];
}

function resolveSheetTitle(sheets, desiredTitle, label) {
  const sheet = sheets.find(
    (item) => String(item?.properties?.title || "").trim() === desiredTitle,
  );

  if (!sheet) {
    throw new Error(`Could not find the ${label} tab named "${desiredTitle}"`);
  }

  return sheet.properties.title;
}

function buildApprovalDataUrl(base64Image) {
  const match = String(base64Image || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("imageDataUrl must be a base64 data URL");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function buildMultipartBody(metadata, mimeType, buffer) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    buffer,
    `\r\n--${boundary}--`,
  ];

  return {
    boundary,
    body: Buffer.concat(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part)))),
  };
}

function normalizeRows(values) {
  const headers = values[0] || [];
  const rows = values.slice(1);
  const headerIndex = new Map(headers.map((header, index) => [String(header).trim(), index]));

  const activeStories = [];

  rows.forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (!Array.isArray(row) || !row.some((cell) => String(cell || "").trim())) {
      return;
    }

    const get = (header) => row[headerIndex.get(header)] ?? "";
    const posted = POSTED_HEADERS.some((header) => isTruthy(get(header)));

    if (posted) {
      return;
    }

    const story = {
      id: get("Post URI (Current)") || get("Link Current") || `row-${rowNumber}`,
      rowNumber,
      publishDate: parseUsDate(get("Pub Date")),
      headline: String(get("Headline") || "").trim(),
      vertical: String(get("Vertical") || row[5] || get("Main Edit Vertical") || "").trim(),
      url: String(get("Link Current") || "").trim(),
      subs: Number(String(get("# of Subs") || "0").replace(/[^0-9]/g, "")) || 0,
      postUri: String(get("Post URI (Current)") || "").trim(),
      fullStoryText: String(
        get("Full Story Text")
          || get("Story Text")
          || get("Article Body")
          || get("Body")
          || get("Content")
          || "",
      ).trim(),
      editorialCreditList: String(get("Editorial Credit List") || "").trim(),
      mainEditVertical: String(get("Main Edit Vertical") || "").trim(),
      alreadyPosted: isTruthy(get("Already Posted?")),
      suggestedByOtherSheet: isTruthy(get("suggested by other sheet?")),
      posted,
      approvalStatus: String(get("Slack Approval Status") || "").trim(),
      approvalImageUrl: String(get("Slack Image URL") || "").trim(),
      approvalHeadline: String(get("Slack Headline") || "").trim(),
      approvalStoryUrl: String(get("Slack Story URL") || "").trim(),
      approvalRequestedAt: String(get("Slack Requested At") || "").trim(),
    };

    if (!story.headline || !story.url || !story.publishDate) {
      return;
    }

    activeStories.push(story);
  });

  activeStories.sort((a, b) => {
    if (b.subs !== a.subs) {
      return b.subs - a.subs;
    }
    return b.publishDate.localeCompare(a.publishDate);
  });
  return activeStories;
}

function buildStoryStatusMap(values) {
  const headers = values[0] || [];
  const rows = values.slice(1);
  const headerIndex = new Map(headers.map((header, index) => [String(header).trim(), index]));
  const statuses = new Map();

  rows.forEach((row) => {
    if (!Array.isArray(row) || !row.some((cell) => String(cell || "").trim())) {
      return;
    }

    const storyId = String(row[headerIndex.get("Post URI (Current)")] || "").trim();
    const linkCurrent = String(row[headerIndex.get("Link Current")] || "").trim();
    const lookupKeys = [storyId, linkCurrent].filter(Boolean);

    if (!lookupKeys.length) {
      return;
    }

    const status = {
      posted: POSTED_HEADERS.some((header) => isTruthy(row[headerIndex.get(header)])),
      approvalStatus: String(row[headerIndex.get("Slack Approval Status")] || "").trim(),
      approvalImageUrl: String(row[headerIndex.get("Slack Image URL")] || "").trim(),
      approvalHeadline: String(row[headerIndex.get("Slack Headline")] || "").trim(),
      approvalStoryUrl: String(row[headerIndex.get("Slack Story URL")] || "").trim(),
      approvalRequestedAt: String(row[headerIndex.get("Slack Requested At")] || "").trim(),
    };

    lookupKeys.forEach((key) => {
      statuses.set(key, status);
    });
  });

  return statuses;
}

async function getActiveStories() {
  if (!SHEET_ID) {
    throw new Error("Missing GOOGLE_SHEET_ID");
  }

  const serviceAccount = await getServiceAccount();
  const accessToken = await getAccessToken(serviceAccount);
  const sheets = await getSpreadsheetMetadata(accessToken);
  const readSheetTitle = resolveSheetTitle(sheets, READ_SHEET_TAB_NAME, "read");
  const writeSheetTitle = resolveSheetTitle(sheets, WRITE_SHEET_TAB_NAME, "write");
  const readRange = `${encodeURIComponent(`'${readSheetTitle.replace(/'/g, "''")}'!${SHEET_RANGE}`)}`;
  const writeRange = `${encodeURIComponent(`'${writeSheetTitle.replace(/'/g, "''")}'!${SHEET_RANGE}`)}`;

  const [readValuesPayload, writeValuesPayload] = await Promise.all([
    googleFetch(`${SHEETS_API_BASE}/${encodeURIComponent(SHEET_ID)}/values/${readRange}`, accessToken),
    googleFetch(`${SHEETS_API_BASE}/${encodeURIComponent(SHEET_ID)}/values/${writeRange}`, accessToken),
  ]);

  const readValues = Array.isArray(readValuesPayload.values) ? readValuesPayload.values : [];
  const writeValues = Array.isArray(writeValuesPayload.values) ? writeValuesPayload.values : [];
  const writeStatuses = buildStoryStatusMap(writeValues);
  const stories = normalizeRows(readValues).map((story) => {
    const status = writeStatuses.get(story.id) || writeStatuses.get(story.postUri) || writeStatuses.get(story.url);
    return {
      ...story,
      posted: Boolean(status?.posted ?? story.posted),
      approvalStatus: status?.approvalStatus || story.approvalStatus,
      approvalImageUrl: status?.approvalImageUrl || story.approvalImageUrl,
      approvalHeadline: status?.approvalHeadline || story.approvalHeadline,
      approvalStoryUrl: status?.approvalStoryUrl || story.approvalStoryUrl,
      approvalRequestedAt: status?.approvalRequestedAt || story.approvalRequestedAt,
    };
  });

  return {
    sheetTitle: readSheetTitle,
    stories,
  };
}

function findRowNumber(values, headerIndex, body) {
  const lookup = String(body?.storyId || body?.postUri || body?.linkCurrent || "").trim();
  if (!lookup) {
    return null;
  }

  const matchIndex = values.slice(1).findIndex((row) => {
    const postUri = String(row[headerIndex.get("Post URI (Current)")] || "").trim();
    const linkCurrent = String(row[headerIndex.get("Link Current")] || "").trim();
    return postUri === lookup || linkCurrent === lookup;
  });

  return matchIndex >= 0 ? matchIndex + 2 : null;
}

async function markStoryPosted(body) {
  const serviceAccount = await getServiceAccount();
  const accessToken = await getAccessToken(serviceAccount);
  const sheets = await getSpreadsheetMetadata(accessToken);
  const sheetTitle = resolveSheetTitle(sheets, WRITE_SHEET_TAB_NAME, "write");
  const range = `${encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!${SHEET_RANGE}`)}`;
  const valuesPayload = await googleFetch(`${SHEETS_API_BASE}/${encodeURIComponent(SHEET_ID)}/values/${range}`, accessToken);
  const values = Array.isArray(valuesPayload.values) ? valuesPayload.values : [];

  if (!values.length) {
    throw new Error("The Google Sheet returned no data");
  }

  const headers = values[0];
  const headerIndex = new Map(headers.map((header, index) => [String(header).trim(), index]));
  const postedColumnIndex = headerIndex.get("Posted?");
  const alreadyPostedColumnIndex = headerIndex.get("Already Posted?");
  const targetPostedColumnIndex = postedColumnIndex ?? alreadyPostedColumnIndex;
  if (targetPostedColumnIndex == null) {
    throw new Error('Could not find an "Already Posted?" or "Posted?" column in the sheet');
  }

  const rowNumber = findRowNumber(values, headerIndex, body);

  if (!rowNumber || Number.isNaN(rowNumber)) {
    throw new Error("Could not find a row for the requested story");
  }

  const cell = `${columnToLetter(targetPostedColumnIndex + 1)}${rowNumber}`;
  await updateSheetValues(accessToken, sheetTitle, cell, [[true]]);

  return { sheetTitle, rowNumber };
}

async function queueStoryForApproval(body) {
  const serviceAccount = await getServiceAccount();
  const accessToken = await getAccessToken(serviceAccount);
  const sheets = await getSpreadsheetMetadata(accessToken);
  const sheetTitle = resolveSheetTitle(sheets, WRITE_SHEET_TAB_NAME, "write");
  const range = `${encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!${SHEET_RANGE}`)}`;
  const valuesPayload = await googleFetch(`${SHEETS_API_BASE}/${encodeURIComponent(SHEET_ID)}/values/${range}`, accessToken);
  const values = Array.isArray(valuesPayload.values) ? valuesPayload.values : [];

  if (!values.length) {
    throw new Error("The Google Sheet returned no data");
  }

  const headers = values[0];
  const headerIndex = new Map(headers.map((header, index) => [String(header).trim(), index]));
  const rowNumber = findRowNumber(values, headerIndex, body);

  if (!rowNumber || Number.isNaN(rowNumber)) {
    throw new Error("Could not find a row for the requested story");
  }

  const storyHeadline = String(body?.headline || "").trim();
  const storyUrl = String(body?.storyUrl || body?.linkCurrent || "").trim();
  const imageDataUrl = String(body?.imageDataUrl || "").trim();

  if (!storyHeadline) {
    throw new Error("Missing headline in request body");
  }

  if (!storyUrl) {
    throw new Error("Missing storyUrl or linkCurrent in request body");
  }

  if (!imageDataUrl) {
    throw new Error("Missing imageDataUrl in request body");
  }

  const fileName = `linkedin-story-approval-row-${rowNumber}.png`;
  const upload = await uploadApprovalImage(accessToken, imageDataUrl, fileName);

  const approvalHeadersRange = APPROVAL_RANGE;
  await updateSheetValues(accessToken, sheetTitle, approvalHeadersRange, [APPROVAL_HEADERS]);

  const approvalRowRange = `${APPROVAL_ROW_START_COLUMN}${rowNumber}:M${rowNumber}`;
  await updateSheetValues(accessToken, sheetTitle, approvalRowRange, [[
    ZAPIER_READY_STATUS,
    upload.permalink,
    storyHeadline,
    storyUrl,
    new Date().toISOString(),
  ]]);

  return {
    sheetTitle,
    rowNumber,
    imageUrl: upload.permalink,
    fileId: upload.fileId,
  };
}

async function uploadApprovalImage(accessToken, imageDataUrl, fileName) {
  if (!DRIVE_APPROVAL_FOLDER_ID) {
    throw new Error("Missing GOOGLE_DRIVE_APPROVAL_FOLDER_ID");
  }

  const { mimeType, buffer } = buildApprovalDataUrl(imageDataUrl);
  const multipart = buildMultipartBody({
    name: fileName,
    parents: [DRIVE_APPROVAL_FOLDER_ID],
  }, mimeType, buffer);
  const createResponse = await googleFetch(`${DRIVE_UPLOAD_BASE}?uploadType=multipart&supportsAllDrives=true`, accessToken, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${multipart.boundary}`,
    },
    body: multipart.body,
  });

  if (!createResponse?.id) {
    throw new Error("Google Drive upload did not return a file id");
  }

  const permalink = `${PUBLIC_APP_BASE_URL}/api/drive-image?id=${encodeURIComponent(createResponse.id)}`;

  return {
    fileId: createResponse.id,
    permalink,
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await getActiveStories();
      sendJson(res, 200, {
        source: "google-sheets",
        sheetTitle: result.sheetTitle,
        stories: result.stories,
      });
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);

      if (body?.action === "queueApproval") {
        const result = await queueStoryForApproval(body);
        sendJson(res, 200, {
          ok: true,
          sheetTitle: result.sheetTitle,
          rowNumber: result.rowNumber,
          imageUrl: result.imageUrl,
          fileId: result.fileId,
        });
        return;
      }

      const result = await markStoryPosted(body);
      sendJson(res, 200, {
        ok: true,
        sheetTitle: result.sheetTitle,
        rowNumber: result.rowNumber,
      });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 503, {
      error: error.message,
    });
  }
};
