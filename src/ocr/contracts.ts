import type { ParsedOCRResult } from '../types/ocr';
import type { ParsedName } from './ocrParser';

export type OCRZone = 'name' | 'job' | 'row3';

export interface OCRResult {
  source: string;
  text: string;
  confidence?: number;
  zone: OCRZone;
}

export interface OCRProvider {
  readonly source: string;
  recognize(input: Buffer): Promise<OCRRecognitionPayload>;
}

export interface OCRRecognitionPayload {
  name: OCRResult[];
  job: OCRResult[];
  row3: OCRResult[];
}

export interface ParsedNameOCRCandidate {
  ocr: OCRResult;
  parsed: ParsedName;
}

export interface SelectedNameCandidate {
  candidate: ParsedNameOCRCandidate | null;
  score: number;
  debugReason: string[];
}

export interface ParsedOCRResultWithCandidates extends ParsedOCRResult {
  ocrResults: OCRRecognitionPayload;
  nameSelectionDebug: string[];
}
