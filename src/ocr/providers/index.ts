import { createOCRProvider } from './ClaudeOCRProvider';
import type { OCRProvider } from '../contracts';

let currentInviteCode: string | null = null;
let provider: OCRProvider | null = null;
let devMode = false;

export function setDevMode(isDev: boolean): void {
  devMode = isDev;
}

export function setInviteCode(code: string): void {
  currentInviteCode = code;
  provider = null; // 다음 호출 시 재생성
}

export function getDefaultProvider(): OCRProvider {
  if (!provider) {
    provider = createOCRProvider(currentInviteCode, devMode);
  }
  if (!provider) {
    throw new Error(
      '[OCR] OCR 제공자를 초기화할 수 없습니다.\n' +
      '  배포 모드: 앱에서 초대코드를 입력해주세요.\n' +
      '  개발 모드: .env에 ANTHROPIC_API_KEY 설정 필요',
    );
  }
  return provider;
}

export async function terminateOCRProviders(): Promise<void> {
  // no-op
}
