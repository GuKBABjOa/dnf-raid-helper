import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PORT = process.env['PORT'] ?? 3000;
const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'];
if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required');

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function loadCodes(): Set<string> {
  // 환경변수 우선 (Railway 등 배포환경): 쉼표로 구분된 코드 목록
  if (process.env['INVITE_CODES']) {
    const codes = process.env['INVITE_CODES'].split(',').map((c) => c.trim()).filter(Boolean);
    return new Set(codes);
  }
  // 로컬 개발: codes.json 파일
  const filePath = join(__dirname, '../codes.json');
  if (existsSync(filePath)) {
    return new Set<string>(JSON.parse(readFileSync(filePath, 'utf-8')) as string[]);
  }
  console.warn('[server] No INVITE_CODES env var and no codes.json — all requests will be rejected');
  return new Set();
}

const VALID_CODES = loadCodes();
console.log(`[server] ${VALID_CODES.size} invite codes loaded`);

const PROMPT = `이 던전앤파이터 파티 신청창 UI에서 3가지를 추출해 JSON으로만 반환해줘.
- name: 닉네임 (한글/영문/한자/중국 번체/일본어 가나/♥†★☆◆● 같은 특수문자 포함, 보이는 그대로, 절대 철자 교정·자동완성 금지. 이름이 ...으로 잘려있으면 보이는 부분만 반환)
- job: 직업명 (眞 포함 그대로)
- renown: 명성 숫자 (정수만, 없으면 null)

반환 예시: {"name":"Nepel-血魔斬","job":"眞 블레이드","renown":104330}
잘린 이름 예시: 화면에 "네펠-혈마..."가 보이면 → {"name":"네펠-혈마","job":"...","renown":...}
JSON만 반환. 코드블록(\`\`\`) 금지. 다른 설명 금지.`;

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── 헬스체크 ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ─── OCR 엔드포인트 ────────────────────────────────────────────────────────────
app.post('/ocr', async (req, res) => {
  const { imageBase64, code } = req.body as { imageBase64?: string; code?: string };

  if (!code || !VALID_CODES.has(code)) {
    res.status(401).json({ error: 'INVALID_CODE' });
    return;
  }

  if (!imageBase64) {
    res.status(400).json({ error: 'MISSING_IMAGE' });
    return;
  }

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (err) {
    console.error('[ocr] Anthropic error:', err);
    res.status(502).json({ error: 'ANTHROPIC_ERROR' });
    return;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) {
    res.status(502).json({ error: 'NO_RESPONSE' });
    return;
  }

  try {
    const raw = textBlock.text.trim()
      .replace(/^```[a-z]*\n?/i, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(raw) as { name?: string; job?: string; renown?: number | null };
    res.json(parsed);
  } catch {
    console.error('[ocr] JSON parse failed:', textBlock.text);
    res.status(502).json({ error: 'PARSE_ERROR' });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
