const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const photoInput = document.getElementById("photoInput");
const headlineInput = document.getElementById("headlineInput");
const headlineSizeInput = document.getElementById("headlineSizeInput");
const headlinePositionInputs = document.querySelectorAll('input[name="headlinePosition"]');
const imageZoomInput = document.getElementById("imageZoomInput");
const recenterButton = document.getElementById("recenterButton");
const bannerHeightInput = document.getElementById("bannerHeightInput");
const fadePositionInput = document.getElementById("fadePositionInput");
const fadeDirectionInputs = document.querySelectorAll('input[name="fadeDirection"]');
const bannerPositionInputs = document.querySelectorAll('input[name="bannerPosition"]');
const exportButton = document.getElementById("exportButton");
const resetButton = document.getElementById("resetButton");
const canvasFrame = canvas.parentElement;
const storiesTbody = document.getElementById("storiesTbody");
const storiesSearchInput = document.getElementById("storiesSearchInput");
const storiesCount = document.getElementById("storiesCount");
const storiesUpdatedNote = document.getElementById("storiesUpdatedNote");
const refreshStoriesButton = document.getElementById("refreshStoriesButton");
const captionOutput = document.getElementById("captionOutput");
const captionPromptPreview = document.getElementById("captionPromptPreview");
const captionPromptOutput = document.getElementById("captionPromptOutput");
const captionPhotoCreditInput = document.getElementById("captionPhotoCreditInput");
const captionTrackLabel = document.getElementById("captionTrackLabel");
const captionGenerateButton = document.getElementById("captionGenerateButton");
const captionCopyButton = document.getElementById("captionCopyButton");
const captionTrackButtons = document.querySelectorAll("[data-caption-track]");
const captionPronounButtons = document.querySelectorAll("[data-caption-pronoun]");
const storiesPanel = document.querySelector(".stories");
const previewPanel = document.querySelector(".preview");
const STORIES_API_PATH = "/api/stories";
const STORY_CONTENT_API_PATH = "/api/story-content";
const DEFAULT_CAPTION_TRACK_ORDER = ["hook_first", "narrative_first", "quote_first"];
// Calibrated from the sample caption set: most captions sit in a ~120-180 word band.
const DEFAULT_CAPTION_LENGTH_MIN = 120;
const DEFAULT_CAPTION_LENGTH_MAX = 180;

const WIDTH = 1200;
const HEIGHT = 1500;
const TOP_BAR_HEIGHT = Math.round(HEIGHT * 0.098);
const PSD_REF_WIDTH = 1080;
const PSD_REF_HEIGHT = 1350;
const PSD_LOGO_BOUNDS = {
  left: 452,
  top: 40,
  right: 629,
  bottom: 101,
};
const PSD_LOGO_WIDTH = PSD_LOGO_BOUNDS.right - PSD_LOGO_BOUNDS.left;
const PSD_LOGO_HEIGHT = PSD_LOGO_BOUNDS.bottom - PSD_LOGO_BOUNDS.top;
const LOGO_DRAW_WIDTH = (PSD_LOGO_WIDTH / PSD_REF_WIDTH) * WIDTH;
const LOGO_DRAW_HEIGHT = (PSD_LOGO_HEIGHT / PSD_REF_HEIGHT) * HEIGHT;
const LOGO_TOP_OFFSET = (PSD_LOGO_BOUNDS.top / PSD_REF_HEIGHT) * HEIGHT;
const TOP_HEADLINE_GAP = 40;
const TOP_CAPTION_BOTTOM_PAD = 36;
const FADE_HEIGHT_MAX = 0.794;
const DEFAULT_FONT_FAMILY = '"Garnett Regular", "Avenir Next", Avenir, Inter, system-ui, sans-serif';
const PT_TO_PX = (96 / 72) * 2.5;

const defaults = {
  headline: "Meta's AI advertising dreams have become a nightmare for brands",
  topLabel: "BUSINESS INSIDER",
  headlineSizePt: "18.5",
  headlinePosition: "bottom",
  bannerHeightPx: String(TOP_BAR_HEIGHT),
  fadePosition: "0.50",
  topBar: false,
};

const FONT_FALLBACK = DEFAULT_FONT_FAMILY;

const mockStories = [
  {
    id: "story-1",
    publishDate: "2026-07-19",
    vertical: "Retail",
    headline: "Why retail leaders are rethinking store footprints after a strong summer",
    url: "https://example.com/stories/retail-footprints",
    subs: 182400,
  },
  {
    id: "story-2",
    publishDate: "2026-07-18",
    vertical: "Work & Life",
    headline: "The hidden workflow change that cut meeting time across three teams",
    url: "https://example.com/stories/workflow-change",
    subs: 96450,
  },
  {
    id: "story-3",
    publishDate: "2026-07-17",
    vertical: "Logistics",
    headline: "A small logistics tweak is making distributed teams faster to respond",
    url: "https://example.com/stories/logistics-tweak",
    subs: 124800,
  },
  {
    id: "story-4",
    publishDate: "2026-07-16",
    vertical: "Leadership",
    headline: "How one operator used a simple dashboard to spot churn before it spread",
    url: "https://example.com/stories/churn-dashboard",
    subs: 138200,
  },
  {
    id: "story-5",
    publishDate: "2026-07-15",
    vertical: "Media",
    headline: "New data shows which headlines get saved, shared, and revisited",
    url: "https://example.com/stories/headline-data",
    subs: 205600,
  },
  {
    id: "story-6",
    publishDate: "2026-07-14",
    vertical: "Operations",
    headline: "The new playbook for turning one spreadsheet into a weekly story queue",
    url: "https://example.com/stories/story-queue",
    subs: 87500,
  },
];

const state = {
  photo: null,
  logoBlack: null,
  logoWhite: null,
  fontFamily: FONT_FALLBACK,
  imageZoom: 1,
  imageOffsetX: 0,
  imageOffsetY: 0,
  headlineOffsetY: 0,
  stories: [],
  storiesSource: "mock",
  captionStory: null,
  captionTrackChoice: "hook_first",
  captionPronounChoice: "they_their",
  captionDraft: null,
};

let dragDepth = 0;
let imageDrag = null;
let headlineDrag = null;

function getSelectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "white";
}

function ptToPx(pt) {
  return Number(pt) * PT_TO_PX;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value || "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatSubs(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getSubsVisualization(stories) {
  const values = stories.map((story) => Number(story.subs || 0)).filter((value) => Number.isFinite(value) && value >= 0);
  const maxSubs = Math.max(1, ...values);
  return (story) => {
    const subs = Number(story.subs || 0);
    const ratio = Math.max(0, Math.min(1, subs / maxSubs));
    const barWidth = Math.max(18, Math.round(18 + ratio * 82));
    const barOpacity = (0.25 + ratio * 0.75).toFixed(2);
    return {
      subs,
      barWidth,
      barOpacity,
    };
  };
}

function getStoryById(storyId) {
  return state.stories.find((story) => story.id === storyId);
}

function getCaptionAssistant() {
  return window.LinkedInCaptionAssistant || null;
}

function getCaptionTrackOrder() {
  return getCaptionAssistant()?.trackOrder || DEFAULT_CAPTION_TRACK_ORDER;
}

function setCaptionTrackChoice(track) {
  state.captionTrackChoice = track;
  captionTrackButtons.forEach((button) => {
    const isActive = button.getAttribute("data-caption-track") === track;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setCaptionPronounChoice(pronounChoice) {
  const normalized = ["she_her", "he_his", "they_their"].includes(pronounChoice)
    ? pronounChoice
    : "they_their";
  state.captionPronounChoice = normalized;
  captionPronounButtons.forEach((button) => {
    const isActive = button.getAttribute("data-caption-pronoun") === normalized;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setCaptionGeneratingState(isGenerating) {
  captionGenerateButton.disabled = isGenerating;
  captionGenerateButton.textContent = isGenerating ? "Planning caption..." : "Generate caption";
}

async function fetchCaptionPlan(payload, trackChoice) {
  try {
    const response = await fetch("/api/caption-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        headline: payload.headline,
        fullStoryText: payload.fullStoryText,
        track: trackChoice,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const plan = await response.json();
    const paragraphs = Array.isArray(plan?.paragraphs)
      ? plan.paragraphs.map((paragraph) => String(paragraph || "").trim()).filter(Boolean)
      : [];
    return {
      selectedParagraphs: paragraphs,
      ctaTeaser: String(plan?.ctaTeaser || "").trim(),
      model: String(plan?.model || "").trim(),
    };
  } catch {
    return null;
  }
}

function renderCaptionSelection(story) {
  state.captionStory = story || null;
  state.captionDraft = null;

  if (!story) {
    captionTrackLabel.textContent = "Ready for pasted text";
    captionPhotoCreditInput.value = "";
    captionOutput.value = "";
    captionOutput.placeholder = "Click Generate caption after pasting the full story text.";
    captionOutput.classList.add("is-empty");
    captionPromptPreview.value = "";
    captionPromptPreview.placeholder = "The prompt will show up here.";
    captionPromptOutput.value = "";
    captionPromptOutput.placeholder = "Paste the full story text here";
    captionGenerateButton.disabled = false;
    captionGenerateButton.textContent = "Generate caption";
    captionCopyButton.disabled = true;
    return;
  }

  captionTrackLabel.textContent = `Loaded: ${story.headline}`;
  captionPhotoCreditInput.value = "";
  captionOutput.value = "";
  captionOutput.placeholder = "Click Generate caption after pasting the full story text.";
  captionOutput.classList.add("is-empty");
  captionPromptPreview.value = "";
  captionPromptPreview.placeholder = "The prompt will show up here.";
  captionPromptOutput.value = "";
  captionPromptOutput.placeholder = "Paste the full story text here";
  captionGenerateButton.disabled = false;
  captionGenerateButton.textContent = "Generate caption";
  captionCopyButton.disabled = true;
  window.setTimeout(() => {
    captionPromptOutput.focus({ preventScroll: true });
  }, 0);
}

async function captureStoryApprovalImage(story) {
  const originalHeadline = headlineInput.value;
  headlineInput.value = story.headline;
  renderScene();

  try {
    return canvas.toDataURL("image/png");
  } finally {
    headlineInput.value = originalHeadline;
    renderScene();
  }
}

async function queueStoryForApproval(story, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Queuing...";

  try {
    const imageDataUrl = await captureStoryApprovalImage(story);
    const response = await fetch(STORIES_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "queueApproval",
        storyId: story.id,
        rowNumber: story.rowNumber,
        postUri: story.postUri,
        linkCurrent: story.url,
        storyUrl: story.url,
        headline: story.headline,
        imageDataUrl,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || `Stories endpoint returned ${response.status}`);
    }

    await loadStories();
    storiesUpdatedNote.textContent = "Queued for Slack approval. Slack can unfurl the proxy image link.";
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    storiesUpdatedNote.textContent = error.message || "Could not queue the story for Slack approval.";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function getFilteredStories() {
  const query = (storiesSearchInput.value || "").trim().toLowerCase();
  const stories = [...state.stories].sort((a, b) => {
      if ((b.subs || 0) !== (a.subs || 0)) {
        return (b.subs || 0) - (a.subs || 0);
      }
      return b.publishDate.localeCompare(a.publishDate);
    });

  if (!query) {
    return stories;
  }

  return stories.filter((story) => {
    return [story.publishDate, story.vertical, story.headline, story.url, String(story.subs)]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function renderStories() {
  const stories = getFilteredStories();
  storiesCount.textContent = String(stories.length);
  storiesUpdatedNote.textContent = state.storiesSource === "sheets"
    ? ""
    : stories.length
      ? "Mock feed only for now."
      : "No stories match that filter.";

  if (!stories.length) {
    storiesTbody.innerHTML = `
      <tr>
        <td colspan="6" class="stories-empty">
          No stories match this filter. Clear the search to see the mock queue.
        </td>
      </tr>
    `;
    return;
  }

  const getSubsStyle = getSubsVisualization(stories);
  storiesTbody.innerHTML = stories
    .map((story) => {
      const subsStyle = getSubsStyle(story);
      return `
        <tr data-story-id="${escapeHtml(story.id)}">
          <td class="story-date">${formatDate(story.publishDate)}</td>
          <td class="story-vertical">${escapeHtml(story.vertical || "—")}</td>
          <td class="story-headline">${escapeHtml(story.headline)}</td>
          <td class="story-url">
            <a href="${escapeHtml(story.url)}" target="_blank" rel="noreferrer">${escapeHtml(story.url)}</a>
          </td>
          <td class="story-subs">
            <div class="story-subs-cell">
              <div class="story-subs-bar" aria-hidden="true">
                <span style="width: ${subsStyle.barWidth}%; opacity: ${subsStyle.barOpacity};"></span>
              </div>
              <span class="story-subs-value">${formatSubs(story.subs)}</span>
            </div>
          </td>
          <td class="story-action">
            <div class="story-actions">
              <button
                type="button"
                class="secondary compact-copy story-approval"
                data-queue-approval="${escapeHtml(story.id)}"
                ${
                  state.storiesSource !== "sheets"
                    ? "disabled title=\"Connect Google Sheets to queue approvals.\""
                    : story.approvalStatus
                      ? `disabled title=\"Already queued for Slack approval: ${escapeHtml(story.approvalStatus)}\"`
                      : ""
                }
              >
                ${story.approvalStatus ? "Queued" : "Send to Slack"}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function setStories(stories, source) {
  state.stories = stories;
  state.storiesSource = source;
  renderStories();
  syncStoriesPanelHeight();
}

function syncStoriesPanelHeight() {
  if (!storiesPanel || !previewPanel) {
    return;
  }

  const previewHeight = Math.round(previewPanel.getBoundingClientRect().height);
  if (previewHeight > 0) {
    storiesPanel.style.height = `${previewHeight}px`;
  }
}

async function loadStories(forceRefresh = false) {
  try {
    const storiesUrl = forceRefresh ? `${STORIES_API_PATH}?refresh=${Date.now()}` : STORIES_API_PATH;
    const response = await fetch(storiesUrl, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Stories endpoint returned ${response.status}`);
    }

    const payload = await response.json();
    const stories = Array.isArray(payload.stories) ? payload.stories : [];
    setStories(stories, "sheets");
    return;
  } catch {
    state.stories = mockStories;
    state.storiesSource = "mock";
    renderStories();
    syncStoriesPanelHeight();
    storiesUpdatedNote.textContent = "Could not load Google Sheets data. Using mock fallback.";
  }
}

async function refreshStoriesFromSheet() {
  const originalLabel = refreshStoriesButton?.textContent || "Refresh sheet";
  if (refreshStoriesButton) {
    refreshStoriesButton.disabled = true;
    refreshStoriesButton.textContent = "Refreshing...";
  }

  storiesUpdatedNote.textContent = "Refreshing from Google Sheets...";

  try {
    await loadStories(true);
    if (state.storiesSource === "sheets") {
      storiesUpdatedNote.textContent = "Synced with Google Sheets.";
    }
  } catch (error) {
    storiesUpdatedNote.textContent = error.message || "Could not refresh Google Sheets data.";
  } finally {
    if (refreshStoriesButton) {
      refreshStoriesButton.disabled = false;
      refreshStoriesButton.textContent = originalLabel;
    }
  }
}

function setCaptionLoadingState(isLoading, story) {
  captionGenerateButton.disabled = isLoading;
  captionGenerateButton.textContent = isLoading ? "Loading story text..." : "Generate caption";
}

async function buildCaptionForStory(story) {
  renderCaptionSelection(story);
  setCaptionLoadingState(true, story);

  try {
    const response = await fetch(STORY_CONTENT_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        url: story.url,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || `Story content endpoint returned ${response.status}`);
    }

    const payload = await response.json();
    const fullStoryText = String(payload.fullStoryText || "").trim();
    if (!fullStoryText) {
      throw new Error("Snowflake returned an empty story body.");
    }

    captionPromptOutput.value = fullStoryText;
    storiesUpdatedNote.textContent = `Loaded full text from Snowflake for "${story.headline}".`;
    captionTrackLabel.textContent = `Loaded: ${story.headline}`;

    try {
      await generateCaption(state.captionTrackChoice, state.captionPronounChoice);
    } catch (error) {
      storiesUpdatedNote.textContent = error.message || "Loaded the story text, but could not generate the caption.";
    }
  } catch (error) {
    storiesUpdatedNote.textContent = error.message || "Could not load the story text from Snowflake.";
  } finally {
    setCaptionLoadingState(false, story);
  }
}

function getCaptionStoryPayload() {
  const story = state.captionStory || {};

  const fullStoryText = String(captionPromptOutput.value || "").trim();
  if (!fullStoryText) {
    throw new Error("Paste the full story text first.");
  }

  return {
    headline: String(story.headline || "").trim(),
    fullStoryText,
    articleUrl: String(story.url || "").trim(),
    creditLine: String(captionPhotoCreditInput.value || "").trim(),
    vertical: String(story.vertical || "").trim(),
    lengthMin: DEFAULT_CAPTION_LENGTH_MIN,
    lengthMax: DEFAULT_CAPTION_LENGTH_MAX,
  };
}

async function generateCaption(trackChoice = state.captionTrackChoice, pronounChoice = state.captionPronounChoice) {
  const assistant = getCaptionAssistant();
  if (!assistant) {
    throw new Error("Caption assistant is not loaded");
  }

  const payload = getCaptionStoryPayload();
  setCaptionGeneratingState(true);
  try {
    const plan = await fetchCaptionPlan(payload, trackChoice);
    const draft = assistant.buildCaptionDraft(payload, {
      track: trackChoice,
      pronounChoice,
      lengthMin: payload.lengthMin,
      lengthMax: payload.lengthMax,
      selectedParagraphs: plan?.selectedParagraphs || [],
      ctaTeaser: plan?.ctaTeaser || "",
    });

    state.captionDraft = draft;
    setCaptionTrackChoice(trackChoice);
    setCaptionPronounChoice(pronounChoice);
    captionTrackLabel.textContent = `${draft.trackTitle} · ${state.captionStory?.headline || "Pasted text"}`;
    captionOutput.classList.toggle("is-empty", !draft.caption);
    captionOutput.value = draft.caption || "";
    captionPromptPreview.value = [
      `Selected story type: ${draft.trackTitle}`,
      `Pronoun target: ${draft.pronounLabel}`,
      `Context planner: ${plan?.model || "local fallback"}`,
      `Photo credit: ${draft.creditLine || "blank"}`,
      "",
      draft.prompt || "",
    ].join("\n");
    captionCopyButton.disabled = !draft.caption;
    storiesUpdatedNote.textContent = `Generated a ${draft.trackTitle.toLowerCase()} caption draft${plan?.model ? " with AI context planning" : " with local context planning"}.`;
    return draft;
  } finally {
    setCaptionGeneratingState(false);
  }
}

function setDefaults() {
  headlineInput.value = "";
  headlineSizeInput.value = defaults.headlineSizePt;
  state.headlineOffsetY = 0;
  const headlineBottom = document.querySelector('input[name="headlinePosition"][value="bottom"]');
  imageZoomInput.value = "1";
  bannerHeightInput.value = defaults.bannerHeightPx;
  if (headlineBottom) {
    headlineBottom.checked = true;
  }
  fadePositionInput.value = defaults.fadePosition;
  const fadeBottom = document.querySelector('input[name="fadeDirection"][value="bottom"]');
  if (fadeBottom) {
    fadeBottom.checked = true;
  }
  const bannerOff = document.querySelector('input[name="bannerPosition"][value="off"]');
  if (bannerOff) {
    bannerOff.checked = true;
  }
  const logoWhite = document.querySelector('input[name="logoColor"][value="white"]');
  const headlineWhite = document.querySelector('input[name="headlineColor"][value="white"]');
  if (logoWhite) {
    logoWhite.checked = true;
  }
  if (headlineWhite) {
    headlineWhite.checked = true;
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load ${file.name}`));
    };
    img.src = url;
  });
}

function loadImageFromUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function drawCover(image, dx, dy, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const sourceWidth = targetWidth / scale;
  const sourceHeight = targetHeight / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, dx, dy, targetWidth, targetHeight);
}

function drawAdjustedPhoto(image, dx, dy, targetWidth, targetHeight) {
  const coverScale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const zoom = Number(state.imageZoom || 1);
  const scale = coverScale * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = dx + (targetWidth - drawWidth) / 2 + state.imageOffsetX;
  const y = dy + (targetHeight - drawHeight) / 2 + state.imageOffsetY;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

function wrapParagraph(text, maxWidth, size) {
  ctx.font = `600 ${size}px ${state.fontFamily}`;
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function balanceTrailingOrphan(lines, maxWidth, size) {
  if (lines.length < 2) {
    return lines;
  }

  const lastIndex = lines.length - 1;
  const lastWords = lines[lastIndex].trim().split(/\s+/).filter(Boolean);
  if (lastWords.length !== 1) {
    return lines;
  }

  ctx.font = `600 ${size}px ${state.fontFamily}`;

  for (let i = lastIndex - 1; i >= 0; i -= 1) {
    const currentWords = lines[i].trim().split(/\s+/).filter(Boolean);
    if (currentWords.length < 2) {
      continue;
    }

    const borrowed = currentWords[currentWords.length - 1];
    const previousLine = currentWords.slice(0, -1).join(" ");
    const nextLine = `${borrowed} ${lines[lastIndex]}`.trim();

    if (!previousLine) {
      continue;
    }

    if (ctx.measureText(previousLine).width <= maxWidth && ctx.measureText(nextLine).width <= maxWidth) {
      lines[i] = previousLine;
      lines[lastIndex] = nextLine;
      return lines;
    }
  }

  return lines;
}

function wrapText(text, maxWidth, maxSize, minSize) {
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const normalized = paragraphs.length ? paragraphs : [text.trim()];

  for (let size = maxSize; size >= minSize; size -= 2) {
    let lines = [];

    for (const paragraph of normalized) {
      const paragraphLines = balanceTrailingOrphan(wrapParagraph(paragraph, maxWidth, size), maxWidth, size);
      lines = lines.concat(paragraphLines);
    }

    if (lines.length <= 5) {
      return { size, lines };
    }
  }

  const fallbackLines = balanceTrailingOrphan(wrapParagraph(text.trim(), maxWidth, minSize), maxWidth, minSize).slice(0, 5);
  return { size: minSize, lines: fallbackLines };
}

function roundRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawLogoAt(yOffset) {
  const logo = getSelectedValue("logoColor") === "white" ? state.logoWhite : state.logoBlack;
  if (!logo) {
    return;
  }

  const x = (WIDTH - LOGO_DRAW_WIDTH) / 2;
  ctx.drawImage(logo, x, yOffset, LOGO_DRAW_WIDTH, LOGO_DRAW_HEIGHT);
}

function drawTopBar(barHeight, position = "top") {
  if (!position || position === "off") {
    return;
  }

  ctx.fillStyle = "#111111";
  if (position === "bottom") {
    ctx.fillRect(0, HEIGHT - barHeight, WIDTH, barHeight);
    return;
  }

  ctx.fillRect(0, 0, WIDTH, barHeight);
}

function getBannerHeight(layout, bannerPosition, headlinePosition) {
  const bannerHeight = Math.max(0, Number(bannerHeightInput.value || defaults.bannerHeightPx));

  if (bannerPosition !== "top" || headlinePosition !== "top") {
    return bannerHeight;
  }

  const contentHeight = Math.max(
    TOP_BAR_HEIGHT + 140,
    Math.ceil(
      LOGO_TOP_OFFSET +
        LOGO_DRAW_HEIGHT +
        TOP_HEADLINE_GAP +
        layout.blockHeight +
        TOP_CAPTION_BOTTOM_PAD,
    ),
  );

  return Math.max(bannerHeight, contentHeight);
}

function getHeadlineLayout() {
  const headline = headlineInput.value.trim();
  const maxWidth = WIDTH * 0.82;
  const sizePt = Number(headlineSizeInput.value || defaults.headlineSizePt);
  const leadingPt = sizePt + 2;
  const minSizePt = 15;
  const isPlaceholder = !headline;
  const copy = headline || "Add headline";
  const sizePx = ptToPx(sizePt);
  const minSizePx = ptToPx(minSizePt);
  const { size: fittedSizePx, lines } = wrapText(copy, maxWidth, sizePx, minSizePx);
  const lineHeight = ptToPx(leadingPt);
  const blockHeight = lines.length * lineHeight;
  ctx.font = `600 ${fittedSizePx}px ${state.fontFamily}`;
  const lineWidths = lines.map((line) => ctx.measureText(line).width);
  const blockWidth = lineWidths.length ? Math.max(...lineWidths) : 0;

  return {
    copy,
    fittedSizePx,
    isPlaceholder,
    lineHeight,
    lines,
    blockHeight,
    blockWidth,
  };
}

function getHeadlineAnchorY(layout) {
  const position = getSelectedValue("headlinePosition");
  const baseY = position === "top"
    ? LOGO_TOP_OFFSET + LOGO_DRAW_HEIGHT + TOP_HEADLINE_GAP + layout.fittedSizePx
    : HEIGHT - 112 - layout.blockHeight + layout.fittedSizePx;
  return baseY + Number(state.headlineOffsetY || 0);
}

function getHeadlineBounds(layout) {
  const centerX = WIDTH / 2;
  const centerY = getHeadlineAnchorY(layout);
  const blockWidth = layout.blockWidth || 0;
  const paddingX = 20;
  const paddingY = layout.lineHeight * 0.25;
  return {
    left: centerX - blockWidth / 2 - paddingX,
    right: centerX + blockWidth / 2 + paddingX,
    top: centerY - layout.fittedSizePx - paddingY,
    bottom: centerY + layout.blockHeight - layout.fittedSizePx + paddingY,
  };
}

function eventToCanvasPoint(event) {
  const rect = canvasFrame.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function drawFade() {
  const bannerPosition = getSelectedValue("bannerPosition");
  if (bannerPosition !== "off") {
    return;
  }

  const fadeT = Number(fadePositionInput.value || 0);
  if (fadeT <= 0) {
    return;
  }

  const fadeHeight = HEIGHT * (fadeT * FADE_HEIGHT_MAX);
  const fadeDirection = getSelectedValue("fadeDirection");
  const isTopFade = fadeDirection === "top";
  const fadeTop = isTopFade ? 0 : HEIGHT - fadeHeight;
  const gradient = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + fadeHeight);
  if (isTopFade) {
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.98)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  } else {
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.98)");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, fadeTop, WIDTH, fadeHeight);
}

function drawPlaceholder() {
  ctx.fillStyle = "#002AFF";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 58px ${state.fontFamily}`;
  ctx.fillText("Upload your image", WIDTH / 2, HEIGHT / 2);
}

function drawLogo() {
  drawLogoAt(LOGO_TOP_OFFSET);
}

function drawHeadline() {
  const { copy, fittedSizePx, isPlaceholder, lineHeight, lines, blockHeight } = getHeadlineLayout();
  let y = getHeadlineAnchorY({
    fittedSizePx,
    blockHeight,
  });

  ctx.fillStyle = isPlaceholder
    ? "rgba(255, 255, 255, 0.72)"
    : getSelectedValue("headlineColor") === "white"
      ? "#ffffff"
      : "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${fittedSizePx}px ${state.fontFamily}`;

  for (const line of lines) {
    ctx.fillText(line, WIDTH / 2, y);
    y += lineHeight;
  }
}

function renderScene() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const headlinePosition = getSelectedValue("headlinePosition");
  const bannerPosition = getSelectedValue("bannerPosition");
  const headlineLayout = getHeadlineLayout();
  const bannerHeight = bannerPosition === "off"
    ? 0
    : getBannerHeight(headlineLayout, bannerPosition, headlinePosition);

  if (state.photo) {
    const photoTop = bannerPosition === "top" ? bannerHeight : 0;
    const photoHeight = HEIGHT - photoTop;
    drawAdjustedPhoto(state.photo, 0, photoTop, WIDTH, photoHeight);
  } else {
    drawPlaceholder();
  }

  if (bannerPosition !== "off") {
    drawTopBar(bannerHeight, bannerPosition);
  }
  if (state.photo) {
    drawFade();
  }
  drawLogo();
  drawHeadline();
}

function imageToWhiteLogo(image) {
  const offscreen = document.createElement("canvas");
  offscreen.width = image.width;
  offscreen.height = image.height;
  const offCtx = offscreen.getContext("2d");
  offCtx.drawImage(image, 0, 0);

  const data = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const pixels = data.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const lightness = (r + g + b) / 3;

    if (lightness > 240) {
      pixels[i + 3] = 0;
      continue;
    }

    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = Math.min(255, Math.max(0, Math.round((240 - lightness) * 1.2)));
  }

  offCtx.putImageData(data, 0, 0);
  return offscreen.toDataURL("image/png");
}

function imageToBlackLogo(image) {
  const offscreen = document.createElement("canvas");
  offscreen.width = image.width;
  offscreen.height = image.height;
  const offCtx = offscreen.getContext("2d");
  offCtx.drawImage(image, 0, 0);

  const data = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const pixels = data.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const lightness = (r + g + b) / 3;

    if (lightness > 240) {
      pixels[i + 3] = 0;
      continue;
    }

    pixels[i + 3] = Math.min(255, Math.max(0, Math.round((240 - lightness) * 1.2)));
  }

  offCtx.putImageData(data, 0, 0);
  return offscreen.toDataURL("image/png");
}

async function loadWhiteLogo(file) {
  const image = await loadImageFromFile(file);
  const whiteLogo = new Image();
  whiteLogo.src = imageToWhiteLogo(image);
  await new Promise((resolve) => {
    whiteLogo.onload = resolve;
  });
  return whiteLogo;
}

async function loadDefaultLogo() {
  try {
    const image = await loadImageFromUrl("./assets/bi-logo.jpg");
    const blackLogo = new Image();
    blackLogo.src = imageToBlackLogo(image);
    const whiteLogo = new Image();
    whiteLogo.src = imageToWhiteLogo(image);
    await Promise.all([
      new Promise((resolve) => {
        blackLogo.onload = resolve;
      }),
      new Promise((resolve) => {
        whiteLogo.onload = resolve;
      }),
    ]);
    state.logoBlack = blackLogo;
    state.logoWhite = whiteLogo;
  } catch {
    state.logoBlack = null;
    state.logoWhite = null;
  }
}

async function exportPng() {
  renderScene();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Could not export PNG");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `linkedin-graphic-${Date.now()}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) {
    state.photo = null;
    renderScene();
    return;
  }

  state.photo = await loadImageFromFile(file);
  state.imageZoom = 1;
  state.imageOffsetX = 0;
  state.imageOffsetY = 0;
  imageZoomInput.value = "1";
  renderScene();
});

canvasFrame.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  canvasFrame.classList.add("is-dragover");
});

canvasFrame.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

canvasFrame.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    canvasFrame.classList.remove("is-dragover");
  }
});

canvasFrame.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragDepth = 0;
  canvasFrame.classList.remove("is-dragover");

  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith("image/"));
  if (!file) {
    return;
  }

  photoInput.value = "";
  state.photo = await loadImageFromFile(file);
  state.imageZoom = 1;
  state.imageOffsetX = 0;
  state.imageOffsetY = 0;
  imageZoomInput.value = "1";
  renderScene();
});

canvasFrame.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const headlineLayout = getHeadlineLayout();
  const headlineBounds = getHeadlineBounds(headlineLayout);
  const point = eventToCanvasPoint(event);
  const isOnHeadline =
    !headlineLayout.isPlaceholder &&
    point.x >= headlineBounds.left &&
    point.x <= headlineBounds.right &&
    point.y >= headlineBounds.top &&
    point.y <= headlineBounds.bottom;

  if (isOnHeadline) {
    canvasFrame.setPointerCapture(event.pointerId);
    headlineDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      offsetY: Number(state.headlineOffsetY || 0),
    };
    canvasFrame.classList.add("is-dragging-headline");
    return;
  }

  if (!state.photo) {
    return;
  }

  canvasFrame.setPointerCapture(event.pointerId);
  imageDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: state.imageOffsetX,
    offsetY: state.imageOffsetY,
  };
  canvasFrame.classList.add("is-dragging-image");
});

canvasFrame.addEventListener("pointermove", (event) => {
  if (headlineDrag && headlineDrag.pointerId === event.pointerId) {
    event.preventDefault();
    const rect = canvasFrame.getBoundingClientRect();
    const scaleY = HEIGHT / rect.height;
    state.headlineOffsetY = headlineDrag.offsetY + (event.clientY - headlineDrag.startY) * scaleY;
    renderScene();
    return;
  }

  if (!imageDrag || imageDrag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const rect = canvasFrame.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;
  state.imageOffsetX = imageDrag.offsetX + (event.clientX - imageDrag.startX) * scaleX;
  state.imageOffsetY = imageDrag.offsetY + (event.clientY - imageDrag.startY) * scaleY;
  renderScene();
});

function endImageDrag(event) {
  if (headlineDrag && headlineDrag.pointerId === event.pointerId) {
    headlineDrag = null;
    canvasFrame.classList.remove("is-dragging-headline");
    canvasFrame.classList.remove("is-dragging-image");
    return;
  }

  if (!imageDrag || imageDrag.pointerId !== event.pointerId) {
    return;
  }

  imageDrag = null;
  canvasFrame.classList.remove("is-dragging-image");
}

canvasFrame.addEventListener("pointerup", endImageDrag);
canvasFrame.addEventListener("pointercancel", endImageDrag);

headlineInput.addEventListener("input", renderScene);
headlineSizeInput.addEventListener("input", renderScene);
headlinePositionInputs.forEach((input) => {
  input.addEventListener("change", renderScene);
});
imageZoomInput.addEventListener("input", () => {
  state.imageZoom = Number(imageZoomInput.value || 1);
  renderScene();
});
bannerHeightInput.addEventListener("input", renderScene);
fadePositionInput.addEventListener("input", renderScene);
fadeDirectionInputs.forEach((input) => {
  input.addEventListener("change", renderScene);
});
bannerPositionInputs.forEach((input) => {
  input.addEventListener("change", renderScene);
});
document.querySelectorAll('input[name="logoColor"], input[name="headlineColor"]').forEach((input) => {
  input.addEventListener("change", renderScene);
});
recenterButton.addEventListener("click", () => {
  state.imageOffsetX = 0;
  state.imageOffsetY = 0;
  renderScene();
});
exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  exportButton.textContent = "Exporting...";
  try {
    await exportPng();
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = "Export PNG";
  }
});

storiesSearchInput.addEventListener("input", renderStories);
refreshStoriesButton?.addEventListener("click", refreshStoriesFromSheet);

storiesTbody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) {
    const approvalButton = event.target.closest("[data-queue-approval]");
    if (!approvalButton) {
      return;
    }

    const storyId = approvalButton.getAttribute("data-queue-approval");
    if (!storyId) {
      return;
    }

    const story = getStoryById(storyId);
    if (!story) {
      return;
    }

    await queueStoryForApproval(story, approvalButton);
    return;
  }

  const copyValue = button.getAttribute("data-copy");
  if (!copyValue) {
    return;
  }

  const originalLabel = button.textContent;
  try {
    await copyText(copyValue);
    button.textContent = "Copied";
    button.classList.add("is-copied");
    window.setTimeout(() => {
      button.textContent = originalLabel;
      button.classList.remove("is-copied");
    }, 1200);
  } catch {
    button.textContent = "Copy failed";
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1200);
  }
});

captionGenerateButton.addEventListener("click", async () => {
  try {
    await generateCaption(state.captionTrackChoice, state.captionPronounChoice);
  } catch (error) {
    storiesUpdatedNote.textContent = error.message || "Could not generate the caption.";
  }
});

captionCopyButton.addEventListener("click", async () => {
  const caption = String(captionOutput.value || "").trim();
  if (!caption) {
    storiesUpdatedNote.textContent = "Generate a caption first.";
    return;
  }

  const originalLabel = captionCopyButton.textContent;
  try {
    await copyText(caption);
    captionCopyButton.textContent = "Copied";
    window.setTimeout(() => {
      captionCopyButton.textContent = originalLabel;
    }, 1200);
  } catch {
    storiesUpdatedNote.textContent = "Could not copy the caption.";
  }
});

captionTrackButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const track = button.getAttribute("data-caption-track");
    if (!track) {
      return;
    }

    try {
      await generateCaption(track, state.captionPronounChoice);
    } catch (error) {
      storiesUpdatedNote.textContent = error.message || "Could not generate the caption.";
    }
  });
});

captionPronounButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const pronounChoice = button.getAttribute("data-caption-pronoun");
    if (!pronounChoice) {
      return;
    }

    setCaptionPronounChoice(pronounChoice);
    if (!state.captionStory) {
      storiesUpdatedNote.textContent = "Pronoun set updated.";
      return;
    }

    try {
      await generateCaption(state.captionTrackChoice, pronounChoice);
    } catch (error) {
      storiesUpdatedNote.textContent = error.message || "Could not generate the caption.";
    }
  });
});

resetButton.addEventListener("click", () => {
  photoInput.value = "";
  headlineInput.value = "";
  state.photo = null;
  state.imageZoom = 1;
  state.imageOffsetX = 0;
  state.imageOffsetY = 0;
  state.headlineOffsetY = 0;
  imageZoomInput.value = "1";
  const bannerOff = document.querySelector('input[name="bannerPosition"][value="off"]');
  if (bannerOff) {
    bannerOff.checked = true;
  }
  const fadeBottom = document.querySelector('input[name="fadeDirection"][value="bottom"]');
  if (fadeBottom) {
    fadeBottom.checked = true;
  }
  renderScene();
});

async function init() {
  setDefaults();
  setCaptionPronounChoice(state.captionPronounChoice);
  await document.fonts.load(`600 64px ${DEFAULT_FONT_FAMILY}`);
  await loadDefaultLogo();
  await loadStories();
  renderCaptionSelection(null);
  renderScene();
  syncStoriesPanelHeight();
}

window.addEventListener("resize", syncStoriesPanelHeight);

if (window.ResizeObserver && previewPanel && storiesPanel) {
  const storiesHeightObserver = new ResizeObserver(() => {
    syncStoriesPanelHeight();
  });
  storiesHeightObserver.observe(previewPanel);
}

init();
