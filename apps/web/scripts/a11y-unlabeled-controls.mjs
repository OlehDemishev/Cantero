#!/usr/bin/env node
// Lists <input>/<select>/<textarea> elements in the web app's TSX that have no accessible name:
// no aria-label / aria-labelledby / title, no wrapping <label>, no <label htmlFor> in the same file
// matching their id, and not the sole child of <Field> (which wires label and id itself).
// Controls with className "hidden", or aria-hidden with tabIndex -1 (a honeypot), are skipped. Controls that spread props ({...rest}) are reported separately — their name comes from the caller.
//
//   node apps/web/scripts/a11y-unlabeled-controls.mjs [--json] [--quiet]
//
// Static and per-file: a control rendered by a component that a <label> elsewhere wraps shows up
// as unlabelled here; give it its own name instead.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(webRoot, "package.json"))("typescript");

const args = new Set(process.argv.slice(2));
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);
const UNNAMED_INPUT_TYPES_SKIPPED = new Set(["hidden", "submit", "button", "reset", "image"]);
const NAME_ATTRS = ["aria-label", "aria-labelledby", "title"];

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function tagName(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.tagName.getText();
}

function attributes(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes.properties;
}

function attr(node, name) {
  return attributes(node).find((p) => ts.isJsxAttribute(p) && p.name.getText() === name);
}

function attrValueText(a) {
  if (!a || !a.initializer) return null;
  if (ts.isStringLiteral(a.initializer)) return JSON.stringify(a.initializer.text);
  if (ts.isJsxExpression(a.initializer) && a.initializer.expression) {
    const e = a.initializer.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return JSON.stringify(e.text);
    return e.getText();
  }
  return null;
}

function meaningfulChildren(el) {
  return el.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces) && !(ts.isJsxExpression(c) && !c.expression));
}

function scanFile(file) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const htmlFors = new Set();
  const controls = [];

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      if (name === "label") {
        const v = attrValueText(attr(node, "htmlFor"));
        if (v) htmlFors.add(v);
      }
      if (CONTROL_TAGS.has(name)) controls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  const unlabelled = [];
  const spread = [];
  for (const node of controls) {
    const name = tagName(node);
    const typeText = attrValueText(attr(node, "type"));
    const type = typeText && typeText.startsWith('"') ? JSON.parse(typeText) : name === "input" ? "text" : name;
    if (name === "input" && UNNAMED_INPUT_TYPES_SKIPPED.has(type)) continue;
    if (NAME_ATTRS.some((n) => attr(node, n))) continue;
    // display:none (a file input behind a styled button) is out of the accessibility tree.
    const cls = attrValueText(attr(node, "className")) ?? "";
    if (/(^|[\s"`])hidden([\s"`]|$)/.test(cls)) continue;
    if (attrValueText(attr(node, "aria-hidden")) === '"true"' && attrValueText(attr(node, "tabIndex")) === "-1") continue;
    const id = attrValueText(attr(node, "id"));
    if (id && htmlFors.has(id)) continue;

    let labelled = false;
    let child = node;
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxElement(p)) {
        const pName = tagName(p);
        if (pName === "label") {
          labelled = true;
          break;
        }
        if (pName === "Field") {
          // Field labels only its sole child (it clones the id onto it).
          const kids = meaningfulChildren(p);
          labelled = kids.length === 1 && (kids[0] === child || kids[0].pos <= child.pos && child.end <= kids[0].end && !ts.isJsxElement(kids[0]));
          break;
        }
        child = p;
      }
      if (ts.isSourceFile(p)) break;
    }
    if (labelled) continue;

    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    const entry = { file: relative(webRoot, file), line: line + 1, tag: name, type, placeholder: !!attr(node, "placeholder") };
    if (attributes(node).some((p) => ts.isJsxSpreadAttribute(p))) spread.push(entry);
    else unlabelled.push(entry);
  }
  return { unlabelled, spread, total: controls.length };
}

const files = [...walkFiles(join(webRoot, "app")), ...walkFiles(join(webRoot, "components"))];
const all = [];
const spreads = [];
let total = 0;
for (const f of files) {
  const r = scanFile(f);
  all.push(...r.unlabelled);
  spreads.push(...r.spread);
  total += r.total;
}

if (args.has("--json")) {
  console.log(JSON.stringify({ total, unlabelled: all, spread: spreads }, null, 2));
} else {
  if (!args.has("--quiet")) {
    for (const e of all) console.log(`${e.file}:${e.line}  <${e.tag}${e.tag === "input" ? ` type=${e.type}` : ""}>${e.placeholder ? "  (placeholder only)" : ""}`);
    if (spreads.length) {
      console.log("\nSpread props (name comes from the caller):");
      for (const e of spreads) console.log(`${e.file}:${e.line}  <${e.tag}>`);
    }
  }
  const byFile = new Map();
  for (const e of all) byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1);
  const worst = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\n${all.length} unlabelled of ${total} controls in ${byFile.size} files (${all.filter((e) => e.placeholder).length} placeholder only, ${all.filter((e) => e.tag === "select").length} select); ${spreads.length} with spread props.`);
  if (worst.length) console.log("Worst: " + worst.map(([f, n]) => `${f.split("/").pop()} ${n}`).join(", "));
}
process.exitCode = all.length ? 1 : 0;
