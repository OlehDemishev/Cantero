import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createWorker } from "tesseract.js";
import { localWorkerOptions, ocrLanguageString } from "../common/ocr/ocr-languages";
import { extractAmount, extractDate, extractVendor } from "./receipt-fields";

export interface ReceiptExtraction {
  rawText: string;
  amount: number | null;
  incurredAt: string | null;
  vendorGuess: string | null;
}

const EMPTY_EXTRACTION: ReceiptExtraction = { rawText: "", amount: null, incurredAt: null, vendorGuess: null };

@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Best-effort — a receipt the OCR engine can't read (blurry photo, unsupported format, worker
   * init failure) returns an all-null extraction rather than throwing, so the caller always falls
   * back to the pre-existing manual expense-entry form instead of blocking the user.
   */
  async extract(buffer: Buffer): Promise<ReceiptExtraction> {
    let rawText: string;
    try {
      // German, English, Polish and Ukrainian receipts, read with the models shipped in the app.
      const worker = await createWorker(ocrLanguageString(this.config.get<string>("OCR_LANGUAGES")), undefined, localWorkerOptions());
      try {
        const result = await worker.recognize(buffer);
        rawText = result.data.text;
      } finally {
        await worker.terminate();
      }
    } catch (err) {
      this.logger.warn(`Receipt OCR failed, falling back to manual entry: ${err instanceof Error ? err.message : String(err)}`);
      return EMPTY_EXTRACTION;
    }

    return {
      rawText,
      amount: extractAmount(rawText),
      incurredAt: extractDate(rawText),
      vendorGuess: extractVendor(rawText),
    };
  }
}
