import { Test } from "@nestjs/testing";
import { createWorker } from "tesseract.js";
import { ReceiptOcrService } from "./receipt-ocr.service";

jest.mock("tesseract.js", () => ({ createWorker: jest.fn() }));

describe("ReceiptOcrService", () => {
  let service: ReceiptOcrService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ providers: [ReceiptOcrService] }).compile();
    service = module.get(ReceiptOcrService);
    jest.clearAllMocks();
  });

  it("extracts amount/date/vendor from the OCR'd text", async () => {
    const terminate = jest.fn().mockResolvedValue(undefined);
    const recognize = jest.fn().mockResolvedValue({ data: { text: "ACME Supply\n2026-08-27\nTotal: 42.50" } });
    (createWorker as jest.Mock).mockResolvedValue({ recognize, terminate });

    const result = await service.extract(Buffer.from("fake-image"));

    expect(result.vendorGuess).toBe("ACME Supply");
    expect(result.amount).toBe(42.5);
    expect(result.incurredAt).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
    expect(terminate).toHaveBeenCalled();
  });

  it("returns an all-null extraction instead of throwing when OCR fails", async () => {
    (createWorker as jest.Mock).mockRejectedValue(new Error("worker init failed"));

    const result = await service.extract(Buffer.from("fake-image"));

    expect(result).toEqual({ rawText: "", amount: null, incurredAt: null, vendorGuess: null });
  });

  it("terminates the worker even when recognize() throws", async () => {
    const terminate = jest.fn().mockResolvedValue(undefined);
    const recognize = jest.fn().mockRejectedValue(new Error("recognize failed"));
    (createWorker as jest.Mock).mockResolvedValue({ recognize, terminate });

    const result = await service.extract(Buffer.from("fake-image"));

    expect(result.amount).toBeNull();
    expect(terminate).toHaveBeenCalled();
  });
});
