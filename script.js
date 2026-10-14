"use strict";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [
  ...parent.querySelectorAll(selector)
];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const main = $("#main");
const cards = $$(".work");

$("#current-year").textContent = new Date().getFullYear();

/* -----------------------------------------------------------
   Интро: чёрный слой стирается поверх белой плитки.
----------------------------------------------------------- */

function initIntro() {
  const intro = $("#intro");
  const canvas = $("#scratch");
  const skip = $("#skip-intro");
  const context = canvas.getContext("2d");

  let finished = false;
  let frame = 0;
  let width = 0;
  let height = 0;
  let lastPoint = null;
  let previousAutoPoint = null;
  let startTime = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Ждём загрузку видимых первых превью, но не блокируем сайт бесконечно.
  const firstImages = $$(".work__image img").slice(0, 3);

  const imagesReady = Promise.race([
    Promise.all(
      firstImages.map((image) => {
        if (image.complete) return Promise.resolve();

        return new Promise((resolve) => {
          const done = () => {
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };

          image.addEventListener("load", done);
          image.addEventListener("error", done);
        });
      })
    ),
    sleep(4000)
  ]);

  function resize() {
    width = innerWidth;
    height = innerHeight;

    const ratio = Math.min(devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#050505";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "destination-out";

    previousAutoPoint = null;
  }

  function erase(from, to, brushSize) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  function onPointerDown(event) {
    lastPoint = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    erase(lastPoint, lastPoint, 80);
  }

  function onPointerMove(event) {
    if (!lastPoint) return;

    const point = { x: event.clientX, y: event.clientY };
    erase(lastPoint, point, 80);
    lastPoint = point;
  }

  function onPointerEnd() {
    lastPoint = null;
  }

  function cleanup() {
    cancelAnimationFrame(frame);
    removeEventListener("resize", resize);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
  }

  function finish(immediate = false) {
    if (finished) return;
    finished = true;

    clearTimeout(window.introFailsafe);
    cleanup();

    intro.classList.add("is-leaving");

    const hide = () => {
      const restoreFocus = intro.contains(document.activeElement);

      intro.hidden = true;
      main.inert = false;
      document.body.classList.remove("is-locked");

      if (restoreFocus) main.focus({ preventScroll: true });
    };

    if (immediate || reducedMotion.matches) {
      hide();
    } else {
      setTimeout(hide, 720);
    }
  }

  // Если fallback уже открыл сайт — не показываем интро заново.
  if (
    !context ||
    reducedMotion.matches ||
    document.documentElement.classList.contains("intro-fallback")
  ) {
    finish(true);
    return;
  }

  main.inert = true;
  document.body.classList.add("is-locked");

  resize();
  skip.focus({ preventScroll: true });

  skip.addEventListener("click", () => finish());
  // Во вступлении единственный интерактивный элемент — кнопка пропуска.
  intro.addEventListener("keydown", (event) => {
    if (event.key === "Escape") finish();

    if (event.key === "Tab") {
      event.preventDefault();
      skip.focus();
    }
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  addEventListener("resize", resize);

  function animate(time) {
    if (finished) return;
    if (!startTime) startTime = time;

    const elapsed = time - startTime;
    const progress = Math.max(0, Math.min(1, (elapsed - 200) / 1900));
    const rows = 18;
    const brush = height / rows * 1.65;

    // Неровные проходы напоминают процарапывание поверхности.
    // Промежуточные точки сохраняют рисунок и на экранах с низким FPS.
    const target = progress * rows;
    let cursor = previousAutoPoint ? previousAutoPoint.position : 0;

    while (cursor < target) {
      cursor = Math.min(target, cursor + 0.015);

      const row = Math.min(rows - 1, Math.floor(cursor));
      const fraction = cursor - row;
      const direction = row % 2 === 0 ? fraction : 1 - fraction;

      const point = {
        x: -brush + direction * (width + brush * 2),
        y:
          (row + 0.5) * (height / rows) +
          Math.sin(direction * 24 + row * 1.7) * height * 0.009,
        position: cursor
      };

      if (previousAutoPoint) {
        erase(previousAutoPoint, point, brush);
      }

      previousAutoPoint = point;
    }

    if (progress < 1) {
      frame = requestAnimationFrame(animate);
    } else {
      context.clearRect(0, 0, width, height);

      Promise.all([imagesReady, sleep(450)]).then(() => finish());
    }
  }

  frame = requestAnimationFrame(animate);

  // Дополнительная страховка, например при паузе requestAnimationFrame.
  setTimeout(() => finish(), 5500);
}

initIntro();

/* -----------------------------------------------------------
   Плавное появление и фильтры.
----------------------------------------------------------- */

let revealObserver = null;

if ("IntersectionObserver" in window && !reducedMotion.matches) {
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        entry.target.classList.remove("will-reveal");
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.08 }
  );

  cards.forEach((card) => {
    card.classList.add("will-reveal");
    revealObserver.observe(card);
  });
}

const filterButtons = $$("[data-filter]");

function updateCount() {
  const count = cards.filter((card) => !card.hidden).length;
  $("#result-count").textContent = `Показано работ: ${count}`;
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filterButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });

    cards.forEach((card) => {
      const categories = card.dataset.category.split(/\s+/);
      card.hidden = filter !== "all" && !categories.includes(filter);

      if (revealObserver) {
        revealObserver.unobserve(card);

        if (!card.hidden && card.classList.contains("will-reveal")) {
          revealObserver.observe(card);
        }
      }
    });

    updateCount();
  });
});

updateCount();

/* -----------------------------------------------------------
   Данные берутся из HTML, а не наоборот.
----------------------------------------------------------- */

const works = cards.map((card) => ({
  card,
  title: $("h3", card).textContent.trim(),
  size: $("[data-size]", card).textContent.trim(),
  technique: $("[data-technique]", card).textContent.trim(),
  year: $("[data-year]", card).textContent.trim(),
  price: $("[data-price]", card)?.textContent.trim() || "",
  inquiry: $(".work__inquire", card)?.getAttribute("href") || "",
  photos: $$(".work-photo", card).map((link) => ({
    src: link.href,
    alt: link.dataset.alt || $("h3", card).textContent.trim()
  }))
}));

/* -----------------------------------------------------------
   Полноэкранный просмотр.
----------------------------------------------------------- */

const viewer = $("#viewer");
const stage = $("#viewer-stage");
const viewerImage = $("#viewer-image");
const message = $("#viewer-message");
const photoButtons = $("#viewer-photos");

let activeWorks = [];
let workIndex = 0;
let photoIndex = 0;
let opener = null;
let imageRequest = 0;
let imageReady = false;

let baseWidth = 0;
let baseHeight = 0;
let scale = 1;
let panX = 0;
let panY = 0;

const MIN_SCALE = 1;
const MAX_SCALE = 6;

const pointers = new Map();

let gesture = null;
let pinch = null;
let multiTouch = false;
let lastTap = null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function currentWork() {
  return activeWorks[workIndex];
}

function setLoading(loading) {
  stage.setAttribute("aria-busy", String(loading));
  stage.classList.toggle("is-loading", loading);

  ["#zoom-in", "#zoom-out", "#zoom-reset"].forEach((selector) => {
    $(selector).disabled = loading || !imageReady;
  });
}

function clampPan() {
  const maxX = Math.max(0, (baseWidth * scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (baseHeight * scale - stage.clientHeight) / 2);

  panX = clamp(panX, -maxX, maxX);
  panY = clamp(panY, -maxY, maxY);
}

function renderTransform() {
  clampPan();

  viewerImage.style.transform =
    `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${scale})`;

  stage.classList.toggle("is-zoomed", scale > 1.01);

  $("#zoom-reset").textContent = `${Math.round(scale * 100)}%`;
}

function resetZoom() {
  scale = 1;
  panX = 0;
  panY = 0;
  renderTransform();
}

function fitImage() {
  if (!imageReady || !viewerImage.naturalWidth) return;

  const availableWidth = Math.max(1, stage.clientWidth - 24);
  const availableHeight = Math.max(1, stage.clientHeight - 24);

  const ratio = Math.min(
    availableWidth / viewerImage.naturalWidth,
    availableHeight / viewerImage.naturalHeight,
    1
  );

  baseWidth = viewerImage.naturalWidth * ratio;
  baseHeight = viewerImage.naturalHeight * ratio;

  viewerImage.style.width = `${baseWidth}px`;
  viewerImage.style.height = `${baseHeight}px`;

  resetZoom();
}

function localPoint(clientX, clientY) {
  const rect = stage.getBoundingClientRect();

  return {
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2
  };
}

function zoomAt(nextScale, clientX, clientY) {
  if (!imageReady) return;

  const rect = stage.getBoundingClientRect();

  const point = localPoint(
    clientX ?? rect.left + rect.width / 2,
    clientY ?? rect.top + rect.height / 2
  );

  const newScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const ratio = newScale / scale;

  // Сохраняем выбранную точку изображения под курсором / пальцами.
  panX = point.x - (point.x - panX) * ratio;
  panY = point.y - (point.y - panY) * ratio;
  scale = newScale;

  renderTransform();
}

function toggleZoom(clientX, clientY) {
  if (scale > 1.01) {
    resetZoom();
  } else {
    zoomAt(2.5, clientX, clientY);
  }
}

function clearGesture() {
  const ids = [...pointers.keys()];

  pointers.clear();
  gesture = null;
  pinch = null;
  multiTouch = false;
  lastTap = null;

  ids.forEach((id) => {
    if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
  });

  stage.classList.remove("is-dragging");
}

function updateCounter() {
  const work = currentWork();

  $("#viewer-counter").textContent =
    `${workIndex + 1} / ${activeWorks.length} · ` +
    `Фото ${photoIndex + 1} / ${work.photos.length}`;
}

function renderPhotoButtons() {
  photoButtons.replaceChildren();

  if (currentWork().photos.length < 2) return;

  currentWork().photos.forEach((photo, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = `Фото ${index + 1}`;
    button.setAttribute("aria-label", photo.alt);
    button.setAttribute("aria-pressed", String(index === photoIndex));

    button.addEventListener("click", () => showPhoto(index));
    photoButtons.append(button);
  });
}

function showPhoto(index) {
  const work = currentWork();

  photoIndex = (index + work.photos.length) % work.photos.length;
  const photo = work.photos[photoIndex];
  const request = ++imageRequest;

  clearGesture();
  imageReady = false;
  viewerImage.hidden = true;
  viewerImage.removeAttribute("src");
  resetZoom();

  setLoading(true);
  message.textContent = "Загружаем фотографию…";

  updateCounter();

  [...photoButtons.children].forEach((button, buttonIndex) => {
    button.setAttribute("aria-pressed", String(buttonIndex === photoIndex));
  });

  viewerImage.alt = photo.alt;

  viewerImage.onload = () => {
    if (request !== imageRequest || !viewer.open) return;

    imageReady = true;
    viewerImage.hidden = false;
    message.textContent = "";

    fitImage();
    setLoading(false);
  };

  viewerImage.onerror = () => {
    if (request !== imageRequest || !viewer.open) return;

    imageReady = false;
    viewerImage.hidden = true;
    message.textContent =
      "Фотография не загрузилась. Проверьте соединение или выберите другое фото.";

    setLoading(false);
  };

  viewerImage.src = photo.src;
}

function showWork(index) {
  workIndex = (index + activeWorks.length) % activeWorks.length;
  photoIndex = 0;

  const work = currentWork();

  $("#viewer-title").textContent = work.title;
  $("#viewer-details").textContent =
    `${work.size} · ${work.technique} · ${work.year}`;

  const price = $("#viewer-price");
  price.replaceChildren();

  if (work.inquiry) {
    const link = document.createElement("a");
    link.href = work.inquiry;
    link.textContent = "Узнать цену ↗️";
    price.append(link);
  } else {
    price.textContent = work.price;
  }

  $("#previous-work").disabled = activeWorks.length < 2;
  $("#next-work").disabled = activeWorks.length < 2;

  renderPhotoButtons();
  showPhoto(0);
}

function openViewer(work, link) {
  activeWorks = works.filter((item) => !item.card.hidden);
  const index = activeWorks.indexOf(work);

  if (index < 0) return;

  opener = link;
  document.body.classList.add("is-locked");

  viewer.showModal();
  showWork(index);
}

works.forEach((work) => {
  const link = $(".work__image", work.card);

  link.addEventListener("click", (event) => {
    // Ctrl/Cmd+клик и браузеры без dialog сохраняют обычную ссылку.
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      typeof viewer.showModal !== "function"
    ) {
      return;
    }

    event.preventDefault();
    openViewer(work, link);
  });
});

$("#viewer-close").addEventListener("click", () => viewer.close());

viewer.addEventListener("close", () => {
  imageRequest++;
  imageReady = false;

  clearGesture();

  viewerImage.onload = null;
  viewerImage.onerror = null;
  viewerImage.removeAttribute("src");
  viewerImage.hidden = true;

  document.body.classList.remove("is-locked");
  opener?.focus({ preventScroll: true });
});

$("#previous-work").addEventListener("click", () => showWork(workIndex - 1));
$("#next-work").addEventListener("click", () => showWork(workIndex + 1));

$("#zoom-in").addEventListener("click", () => zoomAt(scale * 1.4));
$("#zoom-out").addEventListener("click", () => zoomAt(scale / 1.4));
$("#zoom-reset").addEventListener("click", resetZoom);

viewer.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      showWork(workIndex - 1);
      break;

    case "ArrowRight":
      event.preventDefault();
      showWork(workIndex + 1);
      break;

    case "ArrowUp":
      event.preventDefault();
      showPhoto(photoIndex - 1);
      break;

    case "ArrowDown":
      event.preventDefault();
      showPhoto(photoIndex + 1);
      break;

    case "+":
    case "=":
      event.preventDefault();
      zoomAt(scale * 1.4);
      break;

    case "-":
      event.preventDefault();
      zoomAt(scale / 1.4);
      break;

    case "0":
      event.preventDefault();
      resetZoom();
      break;
  }
});

// Масштаб при изменении размеров окна возвращается к «вписать».
if ("ResizeObserver" in window) {
  new ResizeObserver(() => {
    if (viewer.open && imageReady) fitImage();
  }).observe(stage);
} else {
  addEventListener("resize", () => {
    if (viewer.open && imageReady) fitImage();
  });
}

/* -----------------------------------------------------------
   Колесо мыши / трекпад.
----------------------------------------------------------- */

stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    if (!imageReady) return;

    let delta = event.deltaY;

    if (event.deltaMode === 1) delta *= 16;
    if (event.deltaMode === 2) delta *= stage.clientHeight;

    delta = clamp(delta, -150, 150);

    zoomAt(
      scale * Math.exp(-delta * 0.003),
      event.clientX,
      event.clientY
    );
  },
  { passive: false }
);

/* -----------------------------------------------------------
   Pointer Events:
   мышь — клик и перетаскивание;
   телефон — двойной тап, pinch и свайп.
----------------------------------------------------------- */

function pointerPosition(event) {
  return { x: event.clientX, y: event.clientY };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function beginPinch() {
  const [a, b] = [...pointers.values()];
  const middle = midpoint(a, b);

  pinch = {
    distance: Math.max(1, distance(a, b)),
    midpoint: localPoint(middle.x, middle.y),
    scale,
    panX,
    panY
  };

  multiTouch = true;
  lastTap = null;
}

stage.addEventListener("pointerdown", (event) => {
  if (!imageReady) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  // Для жеста используются максимум два указателя.
  if (pointers.size >= 2) return;

  event.preventDefault();

  const point = pointerPosition(event);
  pointers.set(event.pointerId, point);
  stage.setPointerCapture(event.pointerId);

  if (pointers.size === 1) {
    multiTouch = false;

    gesture = {
      pointerType: event.pointerType,
      startX: point.x,
      startY: point.y,
      panX,
      panY,
      scale,
      time: performance.now(),
      moved: false
    };
  } else {
    beginPinch();
  }
});

stage.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId) || !imageReady) return;

  event.preventDefault();

  const point = pointerPosition(event);
  pointers.set(event.pointerId, point);

  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const middle = midpoint(a, b);
    const localMiddle = localPoint(middle.x, middle.y);

    const nextScale = clamp(
      pinch.scale * distance(a, b) / pinch.distance,
      MIN_SCALE,
      MAX_SCALE
    );

    const ratio = nextScale / pinch.scale;

    panX = localMiddle.x - (pinch.midpoint.x - pinch.panX) * ratio;
    panY = localMiddle.y - (pinch.midpoint.y - pinch.panY) * ratio;
    scale = nextScale;

    renderTransform();
    return;
  }

  if (!gesture) return;

  const dx = point.x - gesture.startX;
  const dy = point.y - gesture.startY;

  if (Math.hypot(dx, dy) > 7) gesture.moved = true;

  if (scale > 1.01) {
    panX = gesture.panX + dx;
    panY = gesture.panY + dy;

    stage.classList.toggle("is-dragging", gesture.moved);
    renderTransform();
  }
});

function endPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;

  const wasMultiple = multiTouch;

  pointers.delete(event.pointerId);

  if (stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }

  if (pointers.size === 1) {
    const remaining = [...pointers.values()][0];

    // После щипка можно продолжить перемещение оставшимся пальцем.
    pinch = null;
    gesture = {
      pointerType: event.pointerType,
      startX: remaining.x,
      startY: remaining.y,
      panX,
      panY,
      scale,
      time: performance.now(),
      moved: true
    };

    return;
  }

  if (pointers.size > 0) return;

  stage.classList.remove("is-dragging");

  const completed = gesture;

  gesture = null;
  pinch = null;
  multiTouch = false;

  if (!completed || cancelled || wasMultiple) {
    lastTap = null;
    return;
  }

  const dx = event.clientX - completed.startX;
  const dy = event.clientY - completed.startY;
  const duration = performance.now() - completed.time;
  const moved = completed.moved || Math.hypot(dx, dy) > 7;
  const isMouse = completed.pointerType === "mouse";

  // Свайп переключает именно работы.
  // Дополнительные фото выбираются кнопками под изображением.
  if (
    !isMouse &&
    completed.scale <= 1.01 &&
    scale <= 1.01 &&
    Math.abs(dx) > 60 &&
    Math.abs(dx) > Math.abs(dy) * 1.4 &&
    duration < 800
  ) {
    lastTap = null;

    if (activeWorks.length > 1) {
      showWork(workIndex + (dx < 0 ? 1 : -1));
    }

    return;
  }

  if (moved || duration > 500) {
    lastTap = null;
    return;
  }

  if (isMouse) {
    toggleZoom(event.clientX, event.clientY);
    return;
  }

  const now = performance.now();

  if (
    lastTap &&
    now - lastTap.time < 320 &&
    Math.hypot(
      event.clientX - lastTap.x,
      event.clientY - lastTap.y
    ) < 35
  ) {
    toggleZoom(event.clientX, event.clientY);
    lastTap = null;
  } else {
    lastTap = {
      time: now,
      x: event.clientX,
      y: event.clientY
    };
  }
}

stage.addEventListener("pointerup", (event) => endPointer(event));
stage.addEventListener("pointercancel", (event) => endPointer(event, true));
stage.addEventListener("lostpointercapture", (event) => {
  if (pointers.has(event.pointerId)) endPointer(event, true);
});

stage.addEventListener("dragstart", (event) => event.preventDefault());
