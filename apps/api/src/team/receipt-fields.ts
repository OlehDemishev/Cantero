/**
 * Receipt field extraction lives in @cantero/shared so the mobile app parses on-device OCR text
 * exactly the way the server parses its own (see packages/shared/src/receipt-fields.ts).
 */
export { extractAmount, extractDate, extractVendor } from "@cantero/shared";
