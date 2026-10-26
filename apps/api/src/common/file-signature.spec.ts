import { BadRequestException } from "@nestjs/common";
import { assertContentMatchesType, contentMatchesType } from "./file-signature";

const bytes = (...b: number[]) => Buffer.from(b);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const OLE2 = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0);
const ZIP = Buffer.concat([bytes(0x50, 0x4b, 0x03, 0x04), Buffer.from("[Content_Types].xml")]);
const HTML = Buffer.from("<!doctype html><script>fetch('/api/me')</script>");

describe("contentMatchesType", () => {
  it.each([
    ["application/pdf", Buffer.from("%PDF-1.7\n%âãÏÓ")],
    ["application/pdf", Buffer.concat([Buffer.from("\r\n\r\n"), Buffer.from("%PDF-1.4")])],
    ["image/jpeg", JPEG],
    ["IMAGE/JPEG", JPEG],
    ["image/png", PNG],
    ["image/gif", Buffer.from("GIF89a\x01\x00")],
    ["image/webp", Buffer.concat([Buffer.from("RIFF"), bytes(1, 2, 3, 4), Buffer.from("WEBPVP8 ")])],
    ["image/heic", Buffer.concat([bytes(0, 0, 0, 24), Buffer.from("ftypheic")])],
    ["image/heif", Buffer.concat([bytes(0, 0, 0, 24), Buffer.from("ftypmif1")])],
    ["application/msword", OLE2],
    ["application/vnd.ms-excel", OLE2],
    ["application/vnd.ms-excel", Buffer.from("date;amount\n2026-10-01;12,50\n")],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP],
    ["application/zip", ZIP],
    ["application/zip", bytes(0x50, 0x4b, 0x05, 0x06, 0, 0)],
    ["text/plain", Buffer.from("Baustelle Nord — Notizen\n")],
    ["text/plain", Buffer.from("﻿notes", "utf16le")],
  ])("accepts a real %s", (type, buffer) => {
    expect(contentMatchesType(buffer, type)).toBe(true);
  });

  it.each([
    ["image/jpeg", HTML],
    ["image/png", JPEG],
    ["image/jpeg", Buffer.alloc(0)],
    ["application/pdf", Buffer.concat([Buffer.alloc(1024, 0x20), Buffer.from("%PDF-1.7")])],
    ["image/webp", Buffer.concat([Buffer.from("RIFF"), bytes(1, 2, 3, 4), Buffer.from("WAVE")])],
    ["image/heic", Buffer.concat([bytes(0, 0, 0, 24), Buffer.from("ftypisom")])],
    ["application/msword", ZIP],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", OLE2],
    ["application/vnd.ms-excel", PNG],
    ["text/plain", PNG],
    ["image/svg+xml", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")],
    ["text/html", HTML],
  ])("refuses %s whose bytes are something else", (type, buffer) => {
    expect(contentMatchesType(buffer, type)).toBe(false);
  });
});

describe("assertContentMatchesType", () => {
  it("passes a matching file and answers 400 for a mismatch", () => {
    expect(() => assertContentMatchesType({ buffer: PNG, mimetype: "image/png" })).not.toThrow();
    expect(() => assertContentMatchesType({ buffer: HTML, mimetype: "image/png" })).toThrow(BadRequestException);
  });
});
