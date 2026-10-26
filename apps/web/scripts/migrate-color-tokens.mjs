#!/usr/bin/env node
// Rewrites hand-paired light/dark text colours to the semantic tokens in app/globals.css
// (text-fg, text-fg-muted, text-fg-subtle, text-danger-fg, ...). Run from apps/web:
//
//   node scripts/migrate-color-tokens.mjs [--write] [--defects-only] <files...>
//
// Without --write it only prints what it would change. --defects-only limits it to the dark-mode
// defects (error/hover text with no dark variant), skipping pairs that already look right.
//
// It works one class string at a time ("..." and the static parts of `...`): a pair is rewritten
// only when the string holds exactly one plain text colour and at most one dark: text colour, so
// ternaries and status maps with several colours in one string are left alone. Review the diff.
import fs from "node:fs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const defectsOnly = args.includes("--defects-only");
const files = args.filter((a) => !a.startsWith("--"));

const LIGHT = /^text-(gray|error|success|warning)-\d+$/;
const DARK = /^dark:text-\S+$/;
const HOVER = /^hover:text-(gray|error)-\d+$/;
const DARK_HOVER = /^dark:hover:text-\S+$/;
const stats = new Map();

function textRule(light, dark = "") {
  // Defects: no dark variant at all, or one that fails contrast.
  if (light === "text-error-600" && dark === "") return "text-danger-fg";
  if (defectsOnly) return null;
  if (light === "text-gray-400" && ["", "dark:text-gray-400", "dark:text-gray-500"].includes(dark)) return "text-fg-subtle";
  if ((light === "text-gray-900" || light === "text-gray-800") && /^dark:text-(gray-50|gray-100|white|white\/90)$/.test(dark)) return "text-fg";
  if (light === "text-gray-700" && /^dark:text-gray-(200|300)$/.test(dark)) return "text-fg-muted";
  if (light === "text-gray-500" && dark === "dark:text-gray-400") return "text-fg-subtle";
  if (light === "text-error-700" && dark === "dark:text-error-500") return "text-danger-fg";
  if (light === "text-success-700" && dark === "dark:text-success-500") return "text-success-fg";
  if (light === "text-warning-700" && dark === "dark:text-warning-500") return "text-warning-fg";
  return null;
}

function hoverRule(light, dark = "") {
  if (/^hover:text-gray-[67]00$/.test(light) && dark === "") return "hover:text-fg-muted";
  if (light === "hover:text-error-600" && dark === "") return "hover:text-danger-fg";
  if (defectsOnly) return null;
  if (light === "hover:text-gray-700" && /^dark:hover:text-gray-(200|300)$/.test(dark)) return "hover:text-fg-muted";
  return null;
}

/** Applies one rule to `toks` in place (removed tokens become null). */
function applyRule(toks, isLight, isDark, rule) {
  const li = toks.flatMap((t, i) => (t !== null && isLight.test(t) ? [i] : []));
  const di = toks.flatMap((t, i) => (t !== null && isDark.test(t) ? [i] : []));
  if (li.length !== 1 || di.length > 1) return false;
  const dark = di.length ? toks[di[0]] : undefined;
  const rep = rule(toks[li[0]], dark);
  if (!rep) return false;
  const key = `${toks[li[0]]}${dark ? " " + dark : ""} -> ${rep}`;
  stats.set(key, (stats.get(key) ?? 0) + 1);
  toks[li[0]] = rep;
  if (di.length) toks[di[0]] = null;
  return true;
}

function transform(str) {
  const parts = str.split(/(\s+)/); // even indexes: tokens, odd: the whitespace between them
  const toks = parts.filter((_, i) => i % 2 === 0);
  const ws = parts.filter((_, i) => i % 2 === 1);
  const a = applyRule(toks, LIGHT, DARK, textRule);
  const b = applyRule(toks, HOVER, DARK_HOVER, hoverRule);
  if (!a && !b) return str;
  // Drop each removed token with the whitespace before it, keeping all other spacing as it was.
  let out = "";
  let started = false;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === null) continue;
    if (started) out += ws[i - 1];
    else if (toks[0] === "" && i > 0) out += ws[0]; // leading whitespace of the string
    out += toks[i];
    started = true;
  }
  return out;
}

const transformQuoted = (s) => s.replace(/"([^"\n]*)"/g, (_, x) => `"${transform(x)}"`);

let touched = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(/"([^"\n]*)"|`([^`]*)`/g, (m, dq, tpl) => {
    if (dq !== undefined) return `"${transform(dq)}"`;
    const segs = tpl.split(/(\$\{[^}]*\})/); // odd: ${...} expressions, whose own strings count too
    return "`" + segs.map((s, i) => (i % 2 ? transformQuoted(s) : transform(s))).join("") + "`";
  });
  if (out !== src) {
    touched++;
    if (write) fs.writeFileSync(file, out);
  }
}
for (const [k, v] of [...stats].sort((x, y) => y[1] - x[1])) console.log(String(v).padStart(5), k);
console.log(`${write ? "changed" : "would change"} ${touched} file(s)`);
