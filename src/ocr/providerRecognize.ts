import type { ImageBuffer } from '../types/ocr';
import type { OCRRecognitionPayload } from './contracts';
import { getDefaultProvider, terminateOCRProviders } from './providers';

export async function recognizeTextWithProviders(img: ImageBuffer): Promise<OCRRecognitionPayload> {
  console.log(`[recognize] ${img.width}x${img.height}`);
  return getDefaultProvider().recognize(img.data);
}

export async function terminateProviderWorkers(): Promise<void> {
  await terminateOCRProviders();
}
