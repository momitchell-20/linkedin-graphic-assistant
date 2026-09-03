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

const state = {
  photo: null,
  logoBlack: null,
  logoWhite: null,
  fontFamily: FONT_FALLBACK,
  imageZoom: 1,
  imageOffsetX: 0,
  imageOffsetY: 0,
  headlineOffsetY: 0,
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
  await document.fonts.load(`600 64px ${DEFAULT_FONT_FAMILY}`);
  await loadDefaultLogo();
  renderScene();
}

init();
