const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const photoInput = document.getElementById("photoInput");
const headlineInput = document.getElementById("headlineInput");
const headlineSizeInput = document.getElementById("headlineSizeInput");
const headlinePositionInputs = document.querySelectorAll('input[name="headlinePosition"]');
const imageZoomInput = document.getElementById("imageZoomInput");
const recenterButton = document.getElementById("recenterButton");
const fadePositionInput = document.getElementById("fadePositionInput");
const topBarToggle = document.getElementById("topBarToggle");
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
const FADE_HEIGHT_MAX = 0.24;
const DEFAULT_FONT_FAMILY = '"Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif';
const PT_TO_PX = (96 / 72) * 2.5;

const defaults = {
  headline: "Meta's AI advertising dreams have become a nightmare for brands",
  topLabel: "BUSINESS INSIDER",
  headlineSizePt: "18.5",
  headlinePosition: "bottom",
  fadePosition: "0.50",
  topBar: false,
};

const FONT_FALLBACK = DEFAULT_FONT_FAMILY;

const state = {
  photo: null,
  fontFamily: FONT_FALLBACK,
  imageZoom: 1,
  imageOffsetX: 0,
  imageOffsetY: 0,
};

let dragDepth = 0;
let imageDrag = null;

function getSelectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "white";
}

function ptToPx(pt) {
  return Number(pt) * PT_TO_PX;
}

function setDefaults() {
  headlineInput.value = defaults.headline;
  headlineSizeInput.value = defaults.headlineSizePt;
  const headlineBottom = document.querySelector('input[name="headlinePosition"][value="bottom"]');
  imageZoomInput.value = "1";
  if (headlineBottom) {
    headlineBottom.checked = true;
  }
  fadePositionInput.value = defaults.fadePosition;
  topBarToggle.checked = defaults.topBar;
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

function wrapText(text, maxWidth, maxSize, minSize) {
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const normalized = paragraphs.length ? paragraphs : [text.trim()];

  for (let size = maxSize; size >= minSize; size -= 2) {
    let lines = [];

    for (const paragraph of normalized) {
      const paragraphLines = wrapParagraph(paragraph, maxWidth, size);
      lines = lines.concat(paragraphLines);
    }

    if (lines.length <= 5) {
      return { size, lines };
    }
  }

  return { size: minSize, lines: wrapParagraph(text.trim(), maxWidth, minSize).slice(0, 5) };
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
  const fill = getSelectedValue("logoColor") === "white" ? "#ffffff" : "#111111";
  const x = WIDTH / 2;
  const y = yOffset + LOGO_DRAW_HEIGHT * 0.88;
  const size = Math.round(LOGO_DRAW_HEIGHT * 0.9);

  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
  ctx.fillText("BI", x, y);
  ctx.restore();
}

function drawTopBar(barHeight) {
  if (!topBarToggle.checked) {
    return;
  }

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, WIDTH, barHeight);
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

  return {
    copy,
    fittedSizePx,
    isPlaceholder,
    lineHeight,
    lines,
    blockHeight,
  };
}

function drawFade() {
  const fadeT = Number(fadePositionInput.value || 0);
  if (fadeT <= 0) {
    return;
  }

  const fadeHeight = HEIGHT * (fadeT * FADE_HEIGHT_MAX);
  const fadeTop = HEIGHT - fadeHeight;
  const gradient = ctx.createLinearGradient(0, fadeTop, 0, HEIGHT);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.98)");
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
  const position = getSelectedValue("headlinePosition");
  let y = position === "top"
    ? LOGO_TOP_OFFSET + LOGO_DRAW_HEIGHT + TOP_HEADLINE_GAP + fittedSizePx
    : HEIGHT - 112 - blockHeight + fittedSizePx;

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
  const headlineLayout = getHeadlineLayout();
  const topCaptionHeight = headlinePosition === "top" && topBarToggle.checked
    ? Math.max(
        TOP_BAR_HEIGHT + 140,
        Math.ceil(
          LOGO_TOP_OFFSET +
            LOGO_DRAW_HEIGHT +
            TOP_HEADLINE_GAP +
            headlineLayout.blockHeight +
            TOP_CAPTION_BOTTOM_PAD,
        ),
      )
    : TOP_BAR_HEIGHT;

  if (state.photo) {
    const photoTop = topBarToggle.checked && headlinePosition === "top" ? topCaptionHeight : topBarToggle.checked ? TOP_BAR_HEIGHT : 0;
    const photoHeight = HEIGHT - photoTop;
    drawAdjustedPhoto(state.photo, 0, photoTop, WIDTH, photoHeight);
  } else {
    drawPlaceholder();
  }

  if (topBarToggle.checked) {
    drawTopBar(topCaptionHeight);
  }
  drawLogo();
  if (state.photo) {
    drawFade();
  }
  drawHeadline();
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
  if (!state.photo) {
    return;
  }

  event.preventDefault();
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
fadePositionInput.addEventListener("input", renderScene);
topBarToggle.addEventListener("change", renderScene);
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
  imageZoomInput.value = "1";
  renderScene();
});

async function init() {
  setDefaults();
  renderScene();
}

init();
