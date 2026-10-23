import { storedFileResponse } from "./file-response";

describe("storedFileResponse", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"])("keeps the display-only type %s, as an attachment", (mimeType) => {
    const headers = storedFileResponse(Buffer.from("x"), mimeType).getHeaders();
    expect(headers.type).toBe(mimeType);
    expect(headers.disposition).toBe("attachment");
  });

  it.each(["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", ""])("sends %j as an opaque download", (mimeType) => {
    const headers = storedFileResponse(Buffer.from("x"), mimeType).getHeaders();
    expect(headers.type).toBe("application/octet-stream");
    expect(headers.disposition).toBe("attachment");
  });
});
