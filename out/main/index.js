"use strict";
const electron = require("electron");
const path = require("path");
const Store = require("electron-store");
const screenshot = require("screenshot-desktop");
const sharp = require("sharp");
const node_fs = require("node:fs");
const node_path = require("node:path");
const tesseract_js = require("tesseract.js");
const nodeHtmlParser = require("node-html-parser");
function registerOverlayIpc(store2) {
  electron.ipcMain.handle("rect:save", (_event, req) => {
    const current = store2.get("overlay");
    store2.set("overlay", { ...current, capture: req.capture, card: req.card });
  });
  electron.ipcMain.handle("overlay:loadState", () => {
    return store2.get("overlay");
  });
}
const BUFFER_KEYWORDS = [
  "크루세이더",
  // 여성/남성 성직자 버퍼
  "인챈트리스",
  // 여성 마법사 버퍼
  "뮤즈"
  // 남성 마법사 버퍼
];
const SUPPORTER_KEYWORDS = [
  "무당"
  // 격투가 서포터 (일부 공대에서 버퍼 취급)
];
function resolveRole(input) {
  if (input.statsType === "synergy") return "synergy";
  if (input.jobName.trim() === "") return "unknown";
  for (const kw of BUFFER_KEYWORDS) {
    if (input.jobName.includes(kw)) return "buffer";
  }
  for (const kw of SUPPORTER_KEYWORDS) {
    if (input.jobName.includes(kw)) return "supporter";
  }
  return "dealer";
}
function matchSlots(character, raidConfig) {
  if (character.role === "unknown") return [];
  return raidConfig.slots.filter((slot) => slot.eligibleRoles.includes(character.role)).map((slot) => slot.id);
}
function scoreEngine(character, eligibleSlots, config) {
  const { stats, renown } = character;
  const breakdown = [
    {
      label: stats.type === "damage" ? "딜 수치" : "버프점수",
      rawValue: stats.primaryValue,
      weight: 1,
      contribution: stats.primaryValue
    },
    {
      label: "명성",
      rawValue: renown,
      weight: 0,
      // 참고용. 점수에 반영하지 않음.
      contribution: 0
    }
  ];
  return {
    ...character,
    eligibleSlots,
    score: stats.primaryValue,
    breakdown,
    isWarning: renown < config.warnBelowRenown
  };
}
function jobMatch(hintJob, candidateJob) {
  return candidateJob.includes(hintJob) ? 1 : 0;
}
function fameMatch(hintRenown, candidateRenown) {
  const delta = Math.abs(hintRenown - candidateRenown);
  if (delta <= 500) return 1;
  if (delta <= 3e3) return 0.5;
  return 0;
}
function toWeight(confidence) {
  if (confidence <= 0.5) return 0.1;
  if (confidence <= 0.8) return 0.5;
  return 1;
}
function resolve(candidates, hints) {
  if (candidates.length === 0) {
    return { status: "not_found" };
  }
  const jobWeight = hints.jobName === null ? 0 : toWeight(hints.fieldConfidences?.job ?? 1);
  const fameWeight = hints.renown === null || hints.renown < 1e4 ? 0 : toWeight(hints.fieldConfidences?.fame ?? 1);
  const denominator = jobWeight + fameWeight;
  if (denominator === 0) {
    return { status: "ranked", candidates };
  }
  const validFame = hints.renown !== null && hints.renown >= 1e4;
  const sorted = candidates.map((c) => {
    const js = hints.jobName !== null ? jobMatch(hints.jobName, c.jobName) : 0;
    const fs = validFame ? fameMatch(hints.renown, c.renown) : 0;
    const matchScore = (js * jobWeight + fs * fameWeight) / denominator;
    return { candidate: c, matchScore };
  }).sort((a, b) => b.matchScore - a.matchScore).map((s) => s.candidate);
  return { status: "ranked", candidates: sorted };
}
async function runPipeline(trigger, deps) {
  const pipelineStart = Date.now();
  const stageDurations = [];
  let rawImage;
  try {
    const t = Date.now();
    rawImage = await deps.capture(trigger.region);
    stageDurations.push({ stage: "capture", durationMs: Date.now() - t });
  } catch {
    return { status: "ocr_failed", ocrResult: null };
  }
  let processedImage;
  {
    const t = Date.now();
    try {
      processedImage = await deps.preprocess(rawImage);
    } catch {
      processedImage = rawImage;
    }
    stageDurations.push({ stage: "preprocess", durationMs: Date.now() - t });
  }
  let rawText;
  try {
    const t = Date.now();
    rawText = await deps.recognize(processedImage);
    stageDurations.push({ stage: "recognize", durationMs: Date.now() - t });
  } catch {
    return { status: "ocr_failed", ocrResult: null };
  }
  let ocrResult;
  try {
    const t = Date.now();
    ocrResult = deps.parseOcr(rawText);
    stageDurations.push({ stage: "parse", durationMs: Date.now() - t });
  } catch {
    return { status: "ocr_failed", ocrResult: null };
  }
  if (ocrResult.name === null) {
    return { status: "ocr_failed", ocrResult };
  }
  const name = ocrResult.name;
  let lookupResult;
  let cacheHit;
  {
    const t = Date.now();
    const cached = deps.cache.get(name);
    if (cached !== void 0) {
      lookupResult = cached;
      cacheHit = true;
    } else {
      lookupResult = await deps.lookup(name);
      deps.cache.set(name, lookupResult);
      cacheHit = false;
    }
    stageDurations.push({ stage: "scrape", durationMs: Date.now() - t });
  }
  if (lookupResult.status === "failed") {
    if (lookupResult.reason === "NOT_FOUND") {
      return { status: "not_found", name, ocrResult };
    }
    return { status: "network_error", name, reason: lookupResult.reason, ocrResult };
  }
  let rankedCandidates;
  {
    const t = Date.now();
    const dr = resolve(lookupResult.data, {
      jobName: ocrResult.jobName,
      renown: ocrResult.renown
    });
    stageDurations.push({ stage: "disambiguate", durationMs: Date.now() - t });
    if (dr.status === "not_found") {
      return { status: "not_found", name, ocrResult };
    }
    rankedCandidates = dr.candidates;
  }
  const matchStart = Date.now();
  const scoredCandidates = rankedCandidates.map((c) => {
    const role = resolveRole({ jobName: c.jobName, statsType: c.stats.type });
    const characterData = { ...c, role };
    const eligibleSlots = matchSlots(characterData, deps.raidConfig);
    return scoreEngine(characterData, eligibleSlots, deps.scorerConfig);
  });
  stageDurations.push({ stage: "match", durationMs: Date.now() - matchStart });
  stageDurations.push({ stage: "score", durationMs: 0 });
  return {
    status: "success",
    candidates: scoredCandidates,
    ocrResult,
    cacheHit,
    durationMs: Date.now() - pipelineStart,
    stageDurations
  };
}
async function captureScreen(region) {
  console.log("[capture] captureScreen 진입 region=", region);
  const fullScreenBuffer = await screenshot({ format: "png" });
  const cropped = sharp(fullScreenBuffer).extract({
    left: Math.round(region.x),
    top: Math.round(region.y),
    width: Math.round(region.width),
    height: Math.round(region.height)
  });
  const { data, info } = await cropped.png().toBuffer({ resolveWithObject: true });
  try {
    const debugPath = node_path.join(process.cwd(), "debug_capture.png");
    node_fs.writeFileSync(debugPath, data);
    console.log("[capture] 디버그 이미지 저장:", debugPath);
  } catch (e) {
    console.warn("[capture] 디버그 이미지 저장 실패:", e);
  }
  return {
    data,
    width: info.width,
    height: info.height,
    format: "png"
  };
}
async function preprocessImage(img) {
  console.log(`[preprocess] preprocessImage 진입 ${img.width}×${img.height}`);
  const { data, info } = await sharp(img.data).grayscale().resize(img.width * 3, img.height * 3, {
    kernel: sharp.kernel.lanczos3
  }).normalize().sharpen().png().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    format: "png"
  };
}
const ROW1_Y_START = 0;
const ROW1_Y_END = 0.41;
const ROW3_Y_START = 0.68;
const ROW3_Y_END = 1;
const NAME_X_START = 0.13;
const NAME_X_END = 0.65;
const JOB_X_START = 0.55;
const JOB_X_END = 1;
let worker = null;
async function getWorker() {
  if (worker) return worker;
  worker = await tesseract_js.createWorker(["kor", "chi_tra"]);
  await worker.setParameters({
    tessedit_pageseg_mode: tesseract_js.PSM.SINGLE_LINE
  });
  return worker;
}
function computeZone(imgWidth, imgHeight, xStart, yStart, xEnd, yEnd) {
  const left = Math.round(imgWidth * xStart);
  const top = Math.round(imgHeight * yStart);
  const width = Math.round(imgWidth * xEnd) - left;
  const height = Math.round(imgHeight * yEnd) - top;
  return { left, top, width: Math.max(width, 1), height: Math.max(height, 1) };
}
async function cropToBuffer(imgData, zone) {
  return sharp(imgData).extract(zone).png().toBuffer();
}
async function recognizeText(img) {
  console.log(`[recognize] recognizeText 진입 ${img.width}×${img.height}`);
  const w = await getWorker();
  const { data, width, height } = img;
  const nameZone = computeZone(width, height, NAME_X_START, ROW1_Y_START, NAME_X_END, ROW1_Y_END);
  const nameBuf = await cropToBuffer(data, nameZone);
  try {
    node_fs.writeFileSync(node_path.join(process.cwd(), "debug_zone_name.png"), nameBuf);
  } catch {
  }
  const nameResult = await w.recognize(nameBuf);
  const jobZone = computeZone(width, height, JOB_X_START, ROW1_Y_START, JOB_X_END, ROW1_Y_END);
  const jobBuf = await cropToBuffer(data, jobZone);
  try {
    node_fs.writeFileSync(node_path.join(process.cwd(), "debug_zone_job.png"), jobBuf);
  } catch {
  }
  const jobResult = await w.recognize(jobBuf);
  const row3Zone = computeZone(width, height, 0, ROW3_Y_START, 1, ROW3_Y_END);
  const row3Buf = await cropToBuffer(data, row3Zone);
  try {
    node_fs.writeFileSync(node_path.join(process.cwd(), "debug_zone_row3.png"), row3Buf);
  } catch {
  }
  const row3Result = await w.recognize(row3Buf);
  return [
    `§NAME§${nameResult.data.text.trim()}`,
    `§JOB§${jobResult.data.text.trim()}`,
    `§ROW3§${row3Result.data.text.trim()}`
  ].join("\n");
}
async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
function extractTaggedSection(raw, tag) {
  const marker = `§${tag}§`;
  const idx = raw.indexOf(marker);
  if (idx === -1) return "";
  const start = idx + marker.length;
  const end = raw.indexOf("\n§", start);
  return (end === -1 ? raw.slice(start) : raw.slice(start, end)).trim();
}
function normalizeNameText(raw) {
  let text = raw.split("\n")[0];
  text = text.replace(/\bL[vwu][.,]?\s*\d+/gi, "");
  text = text.replace(/^[A-Za-z]{1,2}[,.]?\s*\d{2,}\s*/g, "");
  text = text.replace(/^[\s\d,.\u3002\uFF0C\uff61]+/, "");
  return text.trim();
}
function extractNameCandidates(text) {
  if (!text) return [];
  const raw = [];
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9\-_.]*/g)) {
    let token = m[0];
    const afterIdx = m.index + token.length;
    if (token.endsWith("-") || token.endsWith("_")) {
      const after = text.slice(afterIdx).match(/^\S+/);
      if (after) token += after[0];
    }
    token = token.replace(/[,.\u3002\uFF0C\uff61\s]+$/, "");
    if (token) raw.push({ text: token, type: classifyType(token) });
  }
  for (const m of text.matchAll(/[가-힣]{2,}/g)) {
    raw.push({ text: m[0], type: "korean" });
  }
  for (const m of text.matchAll(/[♥†★☆◆●♠♣♦][^\s]*/g)) {
    raw.push({ text: m[0], type: "special" });
  }
  const seen = /* @__PURE__ */ new Set();
  return raw.filter(({ text: t }) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  }).map(({ text: t, type }) => ({ text: t, type, score: 0, debugReason: "" }));
}
function classifyType(token) {
  if (/[♥†★☆◆●♠♣♦]/.test(token)) return "special";
  const hasEng = /[A-Za-z]/.test(token);
  const hasKorKanji = /[가-힣\u4e00-\u9fff]/.test(token);
  if (hasEng && hasKorKanji) return "mixed";
  if (hasEng) return "english";
  return "korean";
}
function scoreNameCandidate(candidate) {
  const { text, type } = candidate;
  const reasons = [];
  let score = 0;
  if (text.length >= 6) {
    score += 2;
    reasons.push("len≥6(+2)");
  } else if (text.length >= 4) {
    score += 1;
    reasons.push("len≥4(+1)");
  } else if (text.length <= 1) {
    score -= 3;
    reasons.push("len≤1(-3)");
  }
  if (text.includes("-")) {
    score += 3;
    reasons.push("hyphen(+3)");
  }
  if (type === "mixed") {
    score += 2;
    reasons.push("mixed(+2)");
  } else if (type === "english" || type === "korean") {
    score += 1;
    reasons.push(`${type}(+1)`);
  } else if (type === "special") {
    score -= 1;
    reasons.push("special(-1)");
  }
  if (/^L[vwu]/i.test(text)) {
    score -= 5;
    reasons.push("lv-pattern(-5)");
  }
  return { ...candidate, score, debugReason: reasons.join(", ") || "(no rule matched)" };
}
function shouldManualReview(best, allCandidates, normalizedText) {
  const flags = /* @__PURE__ */ new Set();
  if (best.text.length <= 2) {
    flags.add("SHORT_NAME");
  }
  if (best.type === "special" || /[♥†★☆◆●♠♣♦]/.test(normalizedText)) {
    flags.add("SPECIAL_CHAR");
  }
  const hasCompetitor = allCandidates.some((c) => c !== best && c.score > 0);
  if (best.type === "korean" && best.text.length <= 2 && !hasCompetitor) {
    flags.add("TRUNCATED");
  }
  if (best.score <= 1) {
    flags.add("LOW_SCORE");
  }
  if (best.type === "english" && best.text.length <= 2 && /^[vViIlL]/.test(best.text)) {
    flags.add("LV_COLLISION");
  }
  return [...flags];
}
function pickBestName(candidates, normalizedText) {
  if (candidates.length === 0) return null;
  const scored = candidates.map(scoreNameCandidate);
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score <= -4) return null;
  const confidenceScore = Math.min(1, Math.max(0, best.score / 6));
  const reviewFlags = shouldManualReview(best, scored, normalizedText);
  return {
    name: best.text,
    candidates: scored,
    confidenceScore,
    reviewFlags,
    debugReason: best.debugReason
  };
}
function parseNamePipeline(raw) {
  const normalized = normalizeNameText(raw);
  if (!normalized) return null;
  const candidates = extractNameCandidates(normalized);
  return pickBestName(candidates, normalized);
}
function parseJob(jobZoneText) {
  if (!jobZoneText) return null;
  const text = jobZoneText.split("\n")[0].trim();
  const jinMatch = text.match(/眞\s+[가-힣\u4e00-\u9fff]+(?:\s+[가-힣\u4e00-\u9fff]+)*/);
  if (jinMatch) return jinMatch[0].trim();
  const korMatch = text.match(/[가-힣]{2,}(?:\s+[가-힣]{2,})*/);
  if (korMatch) return korMatch[0].trim();
  return null;
}
function parseRenown$1(row3) {
  const labeled = row3.match(/명성[:\s.]+([0-9,]+)/);
  if (labeled) {
    const n = parseInt(labeled[1].replace(/,/g, ""), 10);
    if (!isNaN(n)) return n;
  }
  for (const m of [...row3.matchAll(/[0-9,]{4,}/g)]) {
    const n = parseInt(m[0].replace(/,/g, ""), 10);
    if (!isNaN(n) && n >= 1e3) return n;
  }
  return null;
}
function parseOcrText(raw) {
  const rawLines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const warnings = [];
  const nameText = extractTaggedSection(raw, "NAME");
  const jobText = extractTaggedSection(raw, "JOB");
  const row3Text = extractTaggedSection(raw, "ROW3");
  const row1Text = extractTaggedSection(raw, "ROW1");
  const parsedName = nameText ? parseNamePipeline(nameText) : row1Text ? parseNamePipeline(row1Text) : null;
  const name = parsedName?.name ?? null;
  const jobName = jobText ? parseJob(jobText) : null;
  const renown = parseRenown$1(row3Text);
  if (parsedName?.reviewFlags.includes("SPECIAL_CHAR")) {
    warnings.push({
      type: "POSSIBLE_MISREAD",
      detail: `특수문자 포함 이름 (OCR 오인식 가능): "${name}"`
    });
  }
  if (parsedName?.reviewFlags.includes("LV_COLLISION")) {
    warnings.push({
      type: "POSSIBLE_MISREAD",
      detail: `이름이 레벨 표시와 혼동될 수 있음: "${name}"`
    });
  }
  let confidence = 0;
  if (name) confidence += 0.5;
  if (jobName) confidence += 0.3;
  if (renown !== null) confidence += 0.2;
  const hasQualityFlag = parsedName?.reviewFlags.some(
    (f) => f === "LOW_SCORE" || f === "TRUNCATED"
  ) ?? false;
  if (hasQualityFlag) confidence -= 0.2;
  if (warnings.some((w) => w.type === "POSSIBLE_MISREAD")) confidence -= 0.2;
  confidence = Math.max(0, Math.min(1, confidence));
  if (confidence < 0.7) {
    warnings.push({
      type: "LOW_CONFIDENCE",
      detail: `confidence: ${confidence.toFixed(2)}`
    });
  }
  const needsManualReview = confidence < 0.7 || (parsedName?.reviewFlags.some(
    (f) => f === "SPECIAL_CHAR" || f === "TRUNCATED" || f === "LV_COLLISION"
  ) ?? false);
  return { name, jobName, renown, confidence, rawLines, warnings, needsManualReview };
}
const DUNDAM_BASE$1 = "https://dundam.xyz";
function parseCommaInt(text) {
  const cleaned = text.trim().replace(/,/g, "");
  if (!cleaned) return NaN;
  const n = parseInt(cleaned, 10);
  return n;
}
function parseRenown(text) {
  return parseCommaInt(text);
}
function parseBuffValue(text) {
  return parseCommaInt(text);
}
function parseDamageValue(text) {
  const normalized = text.trim().replace(/,/g, "");
  const joMatch = normalized.match(/(\d+)\s*조/);
  const eokMatch = normalized.match(/(\d+)\s*억/);
  const manMatch = normalized.match(/(\d+)\s*만/);
  if (!joMatch && !eokMatch && !manMatch) return NaN;
  const jo = joMatch ? parseInt(joMatch[1], 10) * 1e12 : 0;
  const eok = eokMatch ? parseInt(eokMatch[1], 10) * 1e8 : 0;
  const man = manMatch ? parseInt(manMatch[1], 10) * 1e4 : 0;
  return jo + eok + man;
}
function normalizeJobIconUrl(src) {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/")) return DUNDAM_BASE$1 + trimmed;
  return DUNDAM_BASE$1 + "/" + trimmed;
}
function parseSearchPage(html) {
  const root = nodeHtmlParser.parse(html);
  const srResult = root.querySelector(".sr-result");
  const scons = srResult?.querySelectorAll(".scon") ?? [];
  if (scons.length === 0) return { kind: "not_found" };
  const items = scons.map((el) => parseSearchItem(el)).filter((item) => item !== null);
  return { kind: "results", items };
}
function parseSearchItem(el) {
  const server = el.querySelector(".seh_sever .sev")?.text.trim() ?? "";
  if (!server) return null;
  const jobName = el.querySelector(".seh_job .sev")?.text.trim() ?? "";
  const nameEl = el.querySelector(".seh_name .name");
  const name = (nameEl?.childNodes ?? []).filter((n) => n instanceof nodeHtmlParser.TextNode).map((n) => n.rawText).join("").trim();
  if (!name) return null;
  const adventureName = nameEl?.querySelector(".introd.server")?.text.trim() || null;
  const renown = parseRenown(el.querySelector(".level .val")?.text ?? "");
  if (isNaN(renown)) return null;
  const stats = extractStats(el);
  if (!stats) return null;
  const visual = extractVisual(el);
  return { name, server, jobName, adventureName, renown, stats, visual };
}
function extractStats(el) {
  const statA = el.querySelector(".stat_a");
  if (statA) {
    const items = statA.querySelectorAll("li");
    for (const item of items) {
      const label = item.querySelector(".tl")?.text.trim() ?? "";
      const valText = item.querySelector(".val")?.text.trim() ?? "";
      if (!valText) continue;
      if (label === "4인") {
        const primaryValue = parseDamageValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: "synergy", primaryValue, displayLabel: valText };
        }
      } else {
        const primaryValue = parseDamageValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: "damage", primaryValue, displayLabel: valText };
        }
      }
    }
  }
  const statB = el.querySelector(".stat_b");
  if (statB) {
    const items = statB.querySelectorAll("li");
    for (const item of items) {
      const label = item.querySelector(".tl")?.text.trim() ?? "";
      const valText = item.querySelector(".val")?.text.trim() ?? "";
      if (label === "4인" && valText) {
        const primaryValue = parseBuffValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: "buff", primaryValue, displayLabel: valText };
        }
      }
    }
    for (const item of items) {
      const valText = item.querySelector(".val")?.text.trim() ?? "";
      if (valText) {
        const primaryValue = parseBuffValue(valText);
        if (!isNaN(primaryValue)) {
          return { type: "buff", primaryValue, displayLabel: valText };
        }
      }
    }
  }
  return null;
}
function extractVisual(el) {
  const fullBodySrc = el.querySelector(".seh_abata img")?.getAttribute("src") ?? "";
  const jobIconSrc = el.querySelector('.sainf-tr[name="미정"] img')?.getAttribute("src") ?? "";
  return {
    fullBodyImageUrl: fullBodySrc || null,
    jobIconUrl: normalizeJobIconUrl(jobIconSrc)
  };
}
const DUNDAM_BASE = "https://dundam.xyz";
function buildSearchUrl(name) {
  return `${DUNDAM_BASE}/search?server=all&name=${encodeURIComponent(name)}`;
}
let fetcherWindow = null;
let isBusy = false;
function getOrCreateWindow() {
  if (fetcherWindow && !fetcherWindow.isDestroyed()) return fetcherWindow;
  fetcherWindow = new electron.BrowserWindow({
    show: false,
    // 화면에 표시하지 않음
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      javascript: true
    }
  });
  fetcherWindow.on("closed", () => {
    fetcherWindow = null;
    isBusy = false;
  });
  return fetcherWindow;
}
async function fetchHtmlWithBrowser(url) {
  if (isBusy) {
    await waitUntil(() => !isBusy, 1e4);
  }
  isBusy = true;
  const win = getOrCreateWindow();
  try {
    console.log("[browserFetcher] 로드 시작:", url);
    await new Promise((resolve2, reject) => {
      const timeout = setTimeout(() => reject(new Error("페이지 로드 타임아웃")), 15e3);
      win.webContents.once("did-finish-load", () => {
        clearTimeout(timeout);
        resolve2();
      });
      win.webContents.once("did-fail-load", (_e, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`페이지 로드 실패: ${code} ${desc}`));
      });
      win.loadURL(url);
    });
    const rendered = await pollForElement(win, ".sr-result", 8e3);
    console.log("[browserFetcher] .sr-result 감지:", rendered);
    const html = await win.webContents.executeJavaScript(
      "document.documentElement.outerHTML"
    );
    console.log("[browserFetcher] HTML 추출 완료, 크기:", html.length);
    return html;
  } finally {
    isBusy = false;
  }
}
function destroyBrowserFetcher() {
  if (fetcherWindow && !fetcherWindow.isDestroyed()) {
    fetcherWindow.destroy();
    fetcherWindow = null;
  }
}
async function waitUntil(condition, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return true;
    await sleep(100);
  }
  return false;
}
async function pollForElement(win, selector, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const found = await win.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      );
      if (found) return true;
    } catch {
    }
    await sleep(200);
  }
  return false;
}
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
const DEFAULT_SCORER_CONFIG = {
  warnBelowRenown: 2e4
};
const DEFAULT_RAID_CONFIG = {
  raidName: "기본 공대",
  slots: [
    { id: "dealer-1", label: "딜러 1", eligibleRoles: ["dealer"], required: true },
    { id: "dealer-2", label: "딜러 2", eligibleRoles: ["dealer"], required: true },
    { id: "dealer-3", label: "딜러 3", eligibleRoles: ["dealer"], required: true },
    { id: "dealer-4", label: "딜러 4", eligibleRoles: ["dealer"], required: true },
    { id: "buffer-1", label: "버퍼 1", eligibleRoles: ["buffer"], required: true },
    { id: "buffer-2", label: "버퍼 2", eligibleRoles: ["buffer"], required: false },
    { id: "supporter-1", label: "서포터", eligibleRoles: ["supporter", "buffer"], required: false }
  ]
};
const DEFAULT_OVERLAY_STATE = {
  capture: { x: 100, y: 200, width: 420, height: 120 },
  card: { x: 900, y: 100, width: 220, height: 450 },
  shortcutKey: "Alt+Z"
};
async function browserLookup(name) {
  const url = buildSearchUrl(name);
  let html;
  try {
    html = await fetchHtmlWithBrowser(url);
  } catch (err) {
    console.error("[browserLookup] 로드 실패:", err);
    return { status: "failed", name, reason: "NETWORK_ERROR", attemptedAt: /* @__PURE__ */ new Date() };
  }
  const parsed = parseSearchPage(html);
  if (parsed.kind === "not_found" || parsed.items.length === 0) {
    console.log("[browserLookup] not_found:", name);
    return { status: "failed", name, reason: "NOT_FOUND", attemptedAt: /* @__PURE__ */ new Date() };
  }
  const fetchedAt = /* @__PURE__ */ new Date();
  console.log("[browserLookup] 후보", parsed.items.length, "명 발견");
  return { status: "ok", data: parsed.items.map((item) => ({ ...item, fetchedAt })) };
}
function registerCaptureIpc(cache) {
  electron.ipcMain.handle(
    "capture:run",
    async (_event, req) => {
      const trigger = {
        source: "manual",
        region: req.region,
        triggeredAt: /* @__PURE__ */ new Date()
      };
      const scaleFactor = electron.screen.getPrimaryDisplay().scaleFactor;
      const region = {
        x: req.region.x * scaleFactor,
        y: req.region.y * scaleFactor,
        width: req.region.width * scaleFactor,
        height: req.region.height * scaleFactor
      };
      console.log("[capture:run] IPC 수신 region=", req.region, "→ scaled=", region, "scaleFactor=", scaleFactor);
      trigger.region = region;
      const pipelineResult = await runPipeline(trigger, {
        capture: captureScreen,
        preprocess: preprocessImage,
        recognize: recognizeText,
        parseOcr: (raw) => {
          console.log("[parseOcr] 원시 텍스트:\n", raw);
          const result = parseOcrText(raw);
          console.log("[parseOcr] 결과:", result);
          return result;
        },
        cache,
        lookup: browserLookup,
        raidConfig: DEFAULT_RAID_CONFIG,
        scorerConfig: DEFAULT_SCORER_CONFIG
      });
      console.log("[pipeline] 최종 결과 status=", pipelineResult.status);
      return pipelineResult;
    }
  );
}
const NOT_FOUND_TTL_MS = 6e4;
function isCacheable(result) {
  if (result.status === "ok") return true;
  if (result.status === "failed" && result.reason === "NOT_FOUND") return true;
  return false;
}
function computeExpiresAt(result) {
  if (result.status === "ok") return null;
  if (result.status === "failed" && result.reason === "NOT_FOUND") {
    return Date.now() + NOT_FOUND_TTL_MS;
  }
  return null;
}
class LookupCache {
  /**
   * @param maxSize - 최대 항목 수. 기본값 200. 테스트에서 재정의 가능.
   */
  constructor(maxSize = 200) {
    this.map = /* @__PURE__ */ new Map();
    this.maxSize = maxSize;
  }
  /**
   * 캐시에서 name에 해당하는 LookupResult를 반환한다.
   * 만료된 항목은 제거 후 undefined 반환.
   * 유효한 항목은 LRU 위치를 MRU(끝)으로 갱신한다.
   */
  get(name) {
    const entry = this.map.get(name);
    if (!entry) return void 0;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.map.delete(name);
      return void 0;
    }
    this.map.delete(name);
    this.map.set(name, entry);
    return entry.result;
  }
  /**
   * LookupResult를 name 키로 캐시에 저장한다.
   * 캐시 불가 결과(NETWORK_ERROR 등)는 무시한다.
   * 기존 키가 있으면 덮어쓴다 (LRU 위치 갱신 포함).
   * 최대 크기 초과 시 LRU 항목(Map 첫 번째)을 제거한다.
   */
  set(name, result) {
    if (!isCacheable(result)) return;
    if (this.map.has(name)) {
      this.map.delete(name);
    }
    this.map.set(name, {
      result,
      expiresAt: computeExpiresAt(result)
    });
    if (this.map.size > this.maxSize) {
      const lruKey = this.map.keys().next().value;
      this.map.delete(lruKey);
    }
  }
  /** 현재 캐시 항목 수. 테스트 및 진단용. */
  get size() {
    return this.map.size;
  }
}
const store = new Store({
  defaults: { overlay: DEFAULT_OVERLAY_STATE }
});
const lookupCache = new LookupCache();
let mainWindow = null;
let currentMode = "passive";
function createWindow() {
  const { width, height } = electron.screen.getPrimaryDisplay().bounds;
  mainWindow = new electron.BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function registerShortcuts() {
  const shortcutKey = store.get("overlay.shortcutKey");
  electron.globalShortcut.register(shortcutKey, () => {
    if (!mainWindow) return;
    currentMode = currentMode === "passive" ? "edit" : "passive";
    if (currentMode === "edit") {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    const payload = { mode: currentMode };
    mainWindow.webContents.send("overlay:modeChange", payload);
  });
  electron.globalShortcut.register("Alt+C", () => {
    if (!mainWindow || currentMode !== "passive") return;
    mainWindow.webContents.send("capture:shortcut");
  });
}
electron.app.whenReady().then(() => {
  registerOverlayIpc(store);
  registerCaptureIpc(lookupCache);
  createWindow();
  registerShortcuts();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
  terminateWorker().catch(() => {
  });
  destroyBrowserFetcher();
});
