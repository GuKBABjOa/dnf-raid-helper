/**
 * ocr-run.mjs — OCR 파이프라인 수동 검증 스크립트
 *
 * 사용법:
 *   node scripts/ocr-run.mjs                    → fixtures/ocr/ 전체
 *   node scripts/ocr-run.mjs dealer1.png        → 특정 파일
 *   node scripts/ocr-run.mjs dealer1.png dealer4.png
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';

const FIXTURE_DIR = resolve('tests/fixtures/ocr');

// Zone 비율 (recognize.ts와 동일)
const ROW1_Y_START = 0.00, ROW1_Y_END = 0.41;
const ROW3_Y_START = 0.68, ROW3_Y_END = 1.00;
const NAME_X_START = 0.13, NAME_X_END = 0.65;
const JOB_X_START  = 0.55, JOB_X_END  = 1.00;

function computeZone(w, h, xStart, yStart, xEnd, yEnd) {
  const left   = Math.round(w * xStart);
  const top    = Math.round(h * yStart);
  const width  = Math.round(w * xEnd) - left;
  const height = Math.round(h * yEnd) - top;
  return { left, top, width: Math.max(width,1), height: Math.max(height,1) };
}

// 일반 전처리 (preprocess.ts와 동일)
async function preprocessImage(buf, w, h) {
  const { data, info } = await sharp(buf)
    .grayscale()
    .resize(w * 2, h * 2, { kernel: sharp.kernel.lanczos3 })
    .normalize()
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}


// ocrParser — NAME zone 파싱
function parseName(nameZoneText) {
  if (!nameZoneText) return null;

  let text = nameZoneText.replace(/L[vwu][.,]?\d+/gi, '').trim();
  text = text.replace(/^[A-Za-z]{1,2}[,.]?\s*\d{2,}\s*/g, '').trim();
  text = text.replace(/^[\d\s,.\u3002\uFF0C]+/, '').trim();
  text = text.split('\n')[0].trim();
  if (!text) return null;

  const allMatches = [...text.matchAll(/[A-Za-z][A-Za-z0-9\-_.]*/g)];
  const candidates = allMatches
    .map(m => ({ token: m[0], idx: m.index }))
    .filter(({ token }) => {
      if (token.length < 3) return false;
      if (/^L[vwu]/i.test(token)) return false;
      return true;
    });

  if (candidates.length > 0) {
    const withHyphen = candidates.filter(c => c.token.includes('-'));
    const best = (withHyphen.length > 0 ? withHyphen : candidates)
      .reduce((a, b) => a.token.length >= b.token.length ? a : b);

    let result = best.token;
    if (result.endsWith('-') || result.endsWith('_')) {
      const after = text.slice(best.idx + result.length).match(/^\S+/);
      if (after) result += after[0];
    }
    return result.replace(/[,.\s\u3002\uFF0C\uff61]+$/, '');
  }

  const korMatch = text.match(/[가-힣]{2,}/g);
  if (korMatch) return korMatch.reduce((a, b) => a.length >= b.length ? a : b);
  return null;
}

// ocrParser — JOB zone 파싱
function parseJob(jobZoneText) {
  if (!jobZoneText) return null;
  const text = jobZoneText.split('\n')[0].trim();
  const jinMatch = text.match(/眞\s+[가-힣\u4e00-\u9fff]+(?:\s+[가-힣\u4e00-\u9fff]+)*/);
  if (jinMatch) return jinMatch[0].trim();
  const korMatch = text.match(/[가-힣]{2,}(?:\s+[가-힣]{2,})*/);
  if (korMatch) return korMatch[0].trim();
  return null;
}

// ocrParser — 명성 파싱
function parseRenown(row3) {
  const labeled = row3.match(/명성[:\s.]+([0-9,]+)/);
  if (labeled) {
    const n = parseInt(labeled[1].replace(/,/g,''), 10);
    if (!isNaN(n)) return n;
  }
  for (const m of [...row3.matchAll(/[0-9,]{4,}/g)]) {
    const n = parseInt(m[0].replace(/,/g,''), 10);
    if (!isNaN(n) && n >= 1000) return n;
  }
  return null;
}

// Tesseract worker
let worker = null;
async function getWorker() {
  if (worker) return worker;
  console.log('  [OCR] Tesseract 초기화 중 (kor + chi_tra)...');
  worker = await createWorker(['kor', 'chi_tra']);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  return worker;
}

// 이미지 1장 처리
async function runOcr(filePath) {
  const filename = basename(filePath);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  파일: ${filename}`);

  const fileData = readFileSync(filePath);
  const meta = await sharp(fileData).metadata();
  const { width: w, height: h } = meta;

  // 일반 전처리 (JOB, ROW3용)
  const { data: processed, width: pw, height: ph } = await preprocessImage(fileData, w, h);

  const workerInst = await getWorker();

  // NAME zone: 이미 전처리된 이미지에서 직접 크롭 (추가 처리 없음)
  const nameZone = computeZone(pw, ph, NAME_X_START, ROW1_Y_START, NAME_X_END, ROW1_Y_END);
  const nameBuf = await sharp(processed).extract(nameZone).png().toBuffer();
  const nameRes = await workerInst.recognize(nameBuf);

  // JOB zone
  const jobZone = computeZone(pw, ph, JOB_X_START, ROW1_Y_START, JOB_X_END, ROW1_Y_END);
  const jobBuf  = await sharp(processed).extract(jobZone).png().toBuffer();
  const jobRes  = await workerInst.recognize(jobBuf);

  // ROW3 zone
  const row3Zone = computeZone(pw, ph, 0.0, ROW3_Y_START, 1.0, ROW3_Y_END);
  const row3Buf  = await sharp(processed).extract(row3Zone).png().toBuffer();
  const row3Res  = await workerInst.recognize(row3Buf);

  // parse
  const nameText = nameRes.data.text.trim();
  const jobText  = jobRes.data.text.trim();
  const row3Text = row3Res.data.text.trim();

  const name    = parseName(nameText);
  const jobName = parseJob(jobText);
  const renown  = parseRenown(row3Text);

  let confidence = 0;
  if (name)            confidence += 0.5;
  if (jobName)         confidence += 0.3;
  if (renown !== null) confidence += 0.2;

  console.log(`  이름    : ${name ?? '(없음)'}`);
  console.log(`  직업    : ${jobName ?? '(없음)'}`);
  console.log(`  명성    : ${renown ?? '(없음)'}`);
  console.log(`  신뢰도  : ${(confidence*100).toFixed(0)}%`);
  console.log(`  NAME원문: ${nameText}`);
  console.log(`  JOB원문 : ${jobText}`);
  console.log(`  ROW3원문: ${row3Text}`);
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length > 0
    ? args.map(a => resolve(FIXTURE_DIR, a))
    : readdirSync(FIXTURE_DIR).filter(f=>f.endsWith('.png')).sort().map(f=>join(FIXTURE_DIR,f));

  console.log(`OCR zone 검증 시작 — ${files.length}장`);
  for (const f of files) await runOcr(f);
  if (worker) await worker.terminate();
  console.log(`\n${'─'.repeat(60)}\n완료`);
}

main().catch(e => { console.error(e); process.exit(1); });
