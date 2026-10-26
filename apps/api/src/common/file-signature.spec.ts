import { BadRequestException } from "@nestjs/common";
import { assertContentMatchesType, contentMatchesType, looksLikeXml } from "./file-signature";

const bytes = (...b: number[]) => Buffer.from(b);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const GIF = Buffer.from("GIF89a\x01\x00", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF"), bytes(0x24, 0, 0, 0), Buffer.from("WEBPVP8 ")]);
const HEIC = Buffer.concat([bytes(0, 0, 0, 0x18), Buffer.from("ftypheic"), bytes(0, 0, 0, 0)]);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0);
const OLE2 = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0);
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");

describe("contentMatchesType", () => {
  it.each([
    ["application/pdf", PDF],
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/gif", GIF],
    ["image/webp", WEBP],
    ["image/heic", HEIC],
    ["application/zip", ZIP],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP],
    ["application/msword", OLE2],
    ["application/vnd.ms-excel", OLE2],
    ["application/vnd.ms-excel", Buffer.from("name;amount\nNails;12,50\n")],
    ["text/plain", Buffer.from("Bauabnahme: Mängel siehe Liste\n")],
    ["text/plain", bytes(0xff, 0xfe, 0x41, 0, 0x42, 0)],
  ])("accepts real %s bytes", (type, buffer) => {
    expect(contentMatchesType(buffer, type)).toBe(true);
  });

  it.each([
    ["application/pdf", HTML],
    ["application/pdf", Buffer.concat([HTML, PDF])],
    ["image/png", JPEG],
    ["image/jpeg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["image/webp", Buffer.concat([Buffer.from("RIFF"), bytes(0, 0, 0, 0), Buffer.from("WAVE")])],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", PDF],
    ["application/msword", ZIP],
    ["text/plain", PNG],
  ])("refuses %s that is something else", (type, buffer) => {
    expect(contentMatchesType(buffer, type)).toBe(false);
  });

  it("refuses an empty file, a truncated header and a type it has no check for", () => {
    expect(contentMatchesType(Buffer.alloc(0), "text/plain")).toBe(false);
    expect(contentMatchesType(bytes(0x89, 0x50), "image/png")).toBe(false);
    expect(contentMatchesType(HTML, "text/html")).toBe(false);
  });

  it("ignores the case of the type", () => {
    expect(contentMatchesType(PDF, "Application/PDF")).toBe(true);
  });
});

describe("assertContentMatchesType", () => {
  it("throws a 400 naming the claimed type", () => {
    expect(() => assertContentMatchesType({ buffer: HTML, mimetype: "image/png" })).toThrow(BadRequestException);
    expect(() => assertContentMatchesType({ buffer: HTML, mimetype: "image/png" })).toThrow(/image\/png/);
    expect(() => assertContentMatchesType({ buffer: PNG, mimetype: "image/png" })).not.toThrow();
  });
});

describe("looksLikeXml", () => {
  it("accepts XML after a BOM and leading blank lines", () => {
    expect(looksLikeXml(Buffer.from('﻿\n  <?xml version="1.0"?><Invoice/>'))).toBe(true);
  });

  it("refuses plain text and binary data", () => {
    expect(looksLikeXml(Buffer.from("not xml"))).toBe(false);
    expect(looksLikeXml(Buffer.concat([Buffer.from("<a>"), bytes(0, 1, 2)]))).toBe(false);
  });
});
