import { createOCRProvider } from './ClaudeOCRProvider';
import type { OCRProvider } from '../contracts';

function initProvider(): OCRProvider {
  const p = createOCRProvider();
  if (!p) {
    throw new Error(
      '[OCR] OCR 제공자를 초기화할 수 없습니다.\n' +
      '  배포 모드: .env에 SERVER_URL + INVITE_CODE 설정 필요\n' +
      '  개발 모드: .env에 ANTHROPIC_API_KEY 설정 필요',
    );
  }
  return p;
}

const provider = initProvider();

export function getDefaultProvider(): OCRProvider {
  return provider;
}

export async function terminateOCRProviders(): Promise<void> {
  // no-op
}
