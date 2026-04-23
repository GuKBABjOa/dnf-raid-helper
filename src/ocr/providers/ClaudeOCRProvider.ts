import Anthropic from '@anthropic-ai/sdk';
import type { OCRProvider, OCRRecognitionPayload } from '../contracts';

/**
 * 동작 모드 우선순위:
 *   1. inviteCode 전달 → 프록시 서버 경유 (배포 모드)
 *   2. ANTHROPIC_API_KEY 단독 → SDK 직접 호출 (로컬 개발 모드)
 */

const PROXY_SERVER_URL = 'https://dnf-raid-helper-production.up.railway.app';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const PROMPT = `이 던전앤파이터 파티 신청창 UI에서 3가지를 추출해 JSON으로만 반환해줘.
- name: 닉네임 (한글/영문/한자/중국 번체/일본어 가나/♥†★☆◆● 같은 특수문자 포함, 보이는 그대로, 절대 철자 교정·자동완성 금지. 이름이 ...으로 잘려있으면 보이는 부분만 반환)
- job: 직업명 (眞 포함 그대로)
- renown: 명성 숫자 (정수만, 없으면 null)

반환 예시: {"name":"Nepel-血魔斬","job":"眞 블레이드","renown":104330}
잘린 이름 예시: 화면에 "네펠-혈마..."가 보이면 → {"name":"네펠-혈마","job":"...","renown":...}
JSON만 반환. 코드블록(\`\`\`) 금지. 다른 설명 금지.`;

interface ClaudeOCRJson {
  name?: string;
  job?: string;
  renown?: number | null;
}

function parseOcrJson(raw: string): ClaudeOCRJson {
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned) as ClaudeOCRJson;
}

function buildPayload(parsed: ClaudeOCRJson, source: string): OCRRecognitionPayload {
  const name = parsed.name?.trim() ?? '';
  const job = parsed.job?.trim() ?? '';
  const renown = parsed.renown ?? null;
  console.log(`[OCR][${source}] name="${name}" job="${job}" renown=${renown}`);
  return {
    name: name ? [{ source, text: name, confidence: 1.0, zone: 'name' }] : [],
    job: job ? [{ source, text: job, confidence: 1.0, zone: 'job' }] : [],
    row3: renown !== null ? [{ source, text: String(renown), confidence: 1.0, zone: 'row3' }] : [],
  };
}

// ─── 프록시 서버 모드 ─────────────────────────────────────────────────────────

class ProxyOCRProvider implements OCRProvider {
  public readonly source = 'claude-proxy';
  private readonly inviteCode: string;

  constructor(inviteCode: string) {
    this.inviteCode = inviteCode;
    console.log(`[OCR][proxy] server=${PROXY_SERVER_URL}`);
  }

  async recognize(input: Buffer): Promise<OCRRecognitionPayload> {
    const imageBase64 = input.toString('base64');

    let json: ClaudeOCRJson;
    try {
      const res = await fetch(`${PROXY_SERVER_URL}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, code: this.inviteCode }),
      });

      if (res.status === 401) {
        throw new Error('초대코드가 올바르지 않습니다. 앱 데이터(%appdata%\\dnf-raidleader)를 삭제 후 재실행해주세요.');
      }
      if (!res.ok) {
        throw new Error(`서버 오류: ${res.status}`);
      }

      json = await res.json() as ClaudeOCRJson;
    } catch (err) {
      throw new Error(`OCR 서버 연결 실패: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      return buildPayload(json, this.source);
    } catch {
      console.warn('[OCR][proxy] 응답 파싱 실패:', json);
      return { name: [], job: [], row3: [] };
    }
  }
}

// ─── SDK 직접 모드 (로컬 개발) ───────────────────────────────────────────────

export class ClaudeOCRProvider implements OCRProvider {
  public readonly source = 'claude';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    this.client = new Anthropic();
    this.model = process.env['CLAUDE_OCR_MODEL'] ?? DEFAULT_MODEL;
    console.log(`[OCR][claude] using model=${this.model}`);
  }

  async recognize(input: Buffer): Promise<OCRRecognitionPayload> {
    const base64 = input.toString('base64');

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      });
    } catch (error) {
      console.warn('[OCR][claude] request failed:', error);
      return { name: [], job: [], row3: [] };
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) return { name: [], job: [], row3: [] };

    try {
      return buildPayload(parseOcrJson(textBlock.text), this.source);
    } catch {
      console.warn('[OCR][claude] JSON parse failed:', textBlock.text);
      return { name: [], job: [], row3: [] };
    }
  }
}

// ─── 팩토리 ───────────────────────────────────────────────────────────────────

export function createOCRProvider(inviteCode?: string | null, devMode?: boolean): OCRProvider | null {
  // 우선순위 1: SDK 직접 (로컬 개발) — devMode이고 ANTHROPIC_API_KEY 있을 때만
  // devMode 게이트: app.isPackaged 기반으로 주입. Vite가 process.env 값을 번들에 박더라도
  // devMode=false면 short-circuit되어 SDK 모드로 진입하지 않음.
  if (devMode && process.env['ANTHROPIC_API_KEY']) {
    try {
      return new ClaudeOCRProvider();
    } catch {
      return null;
    }
  }

  // 우선순위 2: 프록시 서버 (배포 모드)
  const code = inviteCode ?? process.env['INVITE_CODE'];
  if (code) {
    return new ProxyOCRProvider(code);
  }

  return null;
}

export function createClaudeOCRProvider(devMode?: boolean): ClaudeOCRProvider | null {
  if (!devMode || !process.env['ANTHROPIC_API_KEY']) return null;
  try {
    return new ClaudeOCRProvider();
  } catch {
    return null;
  }
}
