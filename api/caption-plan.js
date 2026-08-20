const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_CAPTION_MODEL = process.env.OPENAI_CAPTION_MODEL || "gpt-5-mini";

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
      if (raw.length > 500000) {
        reject(new Error("Request body is too large"));
      }
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

function splitParagraphs(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\r\n/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeForComparison(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSourceExcerpt(excerpt, sourceText) {
  const value = String(excerpt || "").trim();
  if (!value) {
    return false;
  }

  return sourceText.includes(value);
}

function isWeakCtaTeaser(teaser) {
  const value = String(teaser || "").trim();
  const normalized = normalizeForComparison(value);
  if (!normalized || normalized.split(" ").length > 14) {
    return true;
  }

  if (/\b(said|says|wrote|writes|posted|shared|told)\b/i.test(value) && /\b(post|message|statement|interview|email|x|twitter|instagram|tiktok|linkedin)\b/i.test(value)) {
    return true;
  }

  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}\s+(?:said|wrote|posted|shared|told)\b/.test(value);
}

function getOutputText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((content) => content?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parsePlan(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("OpenAI returned an empty caption plan");
  }

  const jsonText = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(jsonText);
}

function sanitizePlan(plan, sourceText) {
  const paragraphs = Array.isArray(plan?.paragraphs)
    ? plan.paragraphs.map((paragraph) => String(paragraph || "").trim()).filter(Boolean)
    : [];
  const validParagraphs = paragraphs.filter((paragraph) => isSourceExcerpt(paragraph, sourceText)).slice(0, 4);
  const ctaTeaser = String(plan?.ctaTeaser || "").trim();

  if (!validParagraphs.length) {
    throw new Error("OpenAI caption plan did not include source-exact context");
  }

  return {
    paragraphs: validParagraphs,
    ctaTeaser: isWeakCtaTeaser(ctaTeaser) ? "" : ctaTeaser,
  };
}

function buildPlanningPrompt({ headline, fullStoryText, track }) {
  const paragraphs = splitParagraphs(fullStoryText);
  const spans = paragraphs.length > 1 ? paragraphs : splitSentences(fullStoryText);

  return [
    "You are selecting source material for a Business Insider LinkedIn caption.",
    "",
    "Return JSON only, with this shape:",
    "{\"paragraphs\":[\"exact source excerpt\"],\"ctaTeaser\":\"short grounded teaser\"}",
    "",
    "Do not write the final caption.",
    "The final caption will be assembled by code.",
    "",
    "Mission:",
    "- Give readers enough sense of the story to want to read it, without giving everything away.",
    "- Select the context and scene-setting that matter most: person, timing, setting, central tension, and why the turn matters.",
    "- Avoid random details that follow the rule technically but do not help the reader understand the story.",
    "",
    "Rules for paragraphs:",
    "- Every paragraph item must be copied exactly from one source span below.",
    "- The app will reject paragraph items containing words that are not in the pasted story text.",
    "- Do not paraphrase, summarize, bridge, or rewrite paragraph items.",
    "- Any paragraph item containing a quote must include source attribution naming or identifying who said or wrote it.",
    "- Choose 2 to 4 paragraph items.",
    "- For narrative_first, include setup before the turning point so the turn makes sense.",
    "- For quote_first, lead with an attributed quote that is compelling on its own and pivotal to the larger story, then add exact context.",
    "- For hook_first, choose the strongest opening source text and enough follow-through to orient the reader.",
    "",
    "Rules for ctaTeaser:",
    "- Make it specific and grounded in the story, capturing the main topic or point of the story in a phrase or two.",
    "- It can combine exact names/entities from the article with a simple framing phrase if directly supported by the source.",
    "- Good example shape: Lilian Weng's choice to leave Thinking Machines Lab.",
    "- Good example shape for a company strategy story: recent shifts inside Amazon.",
    "- Good example shape for a reorg story: Amazon's AI strategy overhaul.",
    "- Bad examples are vague leftover details like 'the past year', 'a post on X', 'the matter', or 'a specific diagnosis'.",
    "- If using the 'choice to leave' shape, the named person must be the person who is stepping down, leaving, or resigning, not another founder or executive mentioned elsewhere.",
    "- Do not use source-label or attribution fragments like 'said in a post on X'.",
    "- Do not reveal the whole story.",
    "",
    `Caption track: ${track}`,
    `Headline: ${headline || ""}`,
    "",
    "Source spans:",
    spans.map((span, index) => `${index + 1}. ${span}`).join("\n\n"),
  ].join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!OPENAI_API_KEY) {
    sendJson(res, 503, { error: "Missing OPENAI_API_KEY" });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const fullStoryText = String(body.fullStoryText || "").trim();
    if (!fullStoryText) {
      sendJson(res, 400, { error: "Missing fullStoryText" });
      return;
    }

    const prompt = buildPlanningPrompt({
      headline: String(body.headline || "").trim(),
      fullStoryText,
      track: String(body.track || "hook_first").trim(),
    });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_CAPTION_MODEL,
        input: prompt,
        max_output_tokens: 700,
        store: false,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || response.statusText;
      throw new Error(`OpenAI request failed: ${message}`);
    }

    const plan = sanitizePlan(parsePlan(getOutputText(payload)), fullStoryText);
    sendJson(res, 200, {
      ...plan,
      model: OPENAI_CAPTION_MODEL,
    });
  } catch (error) {
    sendJson(res, 503, { error: error.message || "Could not build caption plan" });
  }
};
