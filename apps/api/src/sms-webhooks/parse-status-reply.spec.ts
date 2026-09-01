import { parseStatusReply } from "./parse-status-reply";

describe("parseStatusReply", () => {
  it("recognizes a bare 'done' in English", () => {
    expect(parseStatusReply("en", "done")).toBe("done");
  });

  it("recognizes 'done' as a substring of a longer natural message", () => {
    expect(parseStatusReply("en", "Job is done, heading out")).toBe("done");
  });

  it("recognizes a Ukrainian done-keyword", () => {
    expect(parseStatusReply("uk", "готово, все зробили")).toBe("done");
  });

  it("recognizes a German started-keyword", () => {
    expect(parseStatusReply("de", "Habe gerade begonnen")).toBe("in_progress");
  });

  it("falls back to another locale's keywords when the worker texts in a different language than their profile", () => {
    // Worker's profile locale is "en" but they text in Ukrainian.
    expect(parseStatusReply("en", "готово")).toBe("done");
  });

  it("returns null for an unrecognized message", () => {
    expect(parseStatusReply("en", "running late, traffic")).toBeNull();
  });

  it("returns null for an empty or whitespace-only message", () => {
    expect(parseStatusReply("en", "   ")).toBeNull();
    expect(parseStatusReply("en", "")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseStatusReply("en", "DONE")).toBe("done");
    expect(parseStatusReply("en", "Started")).toBe("in_progress");
  });

  it("prefers a done match over a started match when both could plausibly appear", () => {
    expect(parseStatusReply("en", "started and now done")).toBe("done");
  });
});
