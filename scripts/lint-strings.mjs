#!/usr/bin/env node
// Literal-string lint (BUILD-PLAN M0.4). Flags player-facing English written inline instead of going through
// t('key') (engine, src/**/*.ts) or tr("KEY") (front-end, godot/**/*.gd). Plain Node ESM, no dependencies.
//
// Usage: node scripts/lint-strings.mjs [paths...]     (default paths: src godot, relative to the repo root)
// Prints `file:line: <snippet>` per finding and exits 1; prints `lint-strings: 0 literals` and exits 0 otherwise.
// Allow a line with a trailing `// lint-ok` (TS) or `# lint-ok` (GDScript) comment.
//
// PROSE: a literal "looks like prose" when it has two consecutive letter-words separated by whitespace,
//        /[A-Za-z]{2,}\s+[A-Za-z]{2,}/ (interpolations `${...}` count as a space). GDScript also flags a single
//        capitalised word of 3+ letters, such as "Resume" or "VALVE".
//
// TypeScript (src/**/*.ts), a literal is flagged when it is:
//   - the first argument of fail(, ok(, or the second argument of need( and log( (bare calls only, not obj.log());
//   - the value of a property title, hint, lesson, what, why, name, description, message, text, label.
// Not flagged: anything inside a t(...) call (its arguments are keys and variables); describe (agent text);
//   new Error(...) and throw; console.*; equation and source properties; import paths.
//
// GDScript (godot/**/*.gd), a literal is flagged when it is:
//   - the right-hand side of .text =, text =, tooltip_text =, placeholder_text =, title =;
//   - any literal argument of add_item(, add_button(, label(, button(, heading(, chip(, toast( on that line.
// Not flagged: literals wrapped directly in tr(...); lines starting with print/push_error/push_warning/print_debug;
//   res:// and user:// paths; node paths; signal names; lowercase or punctuated engine keys.
//
// Skipped paths: node_modules, dot-directories (.godot), core/, godot/addons/, godot/sidecar/, *.test.ts,
//   src/locales/, src/regions/, src/oracles/, src/__golden__/, godot/locales/.
// Known limits (false negatives are acceptable): multi-line calls are only checked on the line that opens them,
//   regex literals containing quotes confuse the TypeScript tokenizer, GDScript triple-quoted strings are ignored.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROSE = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/;
const TS_CALL_RULES = { fail: 0, ok: 0, need: 1, log: 1 };
const TS_PROPS = new Set(['title', 'hint', 'lesson', 'what', 'why', 'name', 'description', 'message', 'text', 'label']);
const GD_ASSIGN = /(^|[^\w])(text|tooltip_text|placeholder_text|title)\s*=(?!=)\s*(["'])/g;
const GD_HELPERS = /\b(add_item|add_button|label|button|heading|chip|toast)\s*\(/g;
const GD_NON_UI = /^\s*(print|push_error|push_warning|print_debug|printerr)\s*\(/;

const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)\.[^/]+\//,
  /(^|\/)core\//,
  /(^|\/)godot\/addons\//,
  /(^|\/)godot\/sidecar\//,
  /\.test\.ts$/,
  /(^|\/)src\/(locales|regions|oracles|__golden__)\//,
  /(^|\/)godot\/locales\//,
];

function isProse(s) {
  return PROSE.test(s);
}

function gdProse(s) {
  return isProse(s) || /^[A-Z][A-Za-z]{2,}$/.test(s);
}

// Tokenizer for TypeScript: strings, templates (interpolations blanked), identifiers, punctuation.
function tokenizeTs(src) {
  const toks = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') { v += src[j] + (src[j + 1] ?? ''); j += 2; } else { v += src[j]; j++; }
      }
      toks.push({ type: 'str', value: v, line });
      i = j + 1;
      continue;
    }
    if (c === '`') {
      const startLine = line;
      let j = i + 1;
      let raw = '';
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { raw += src[j] + (src[j + 1] ?? ''); j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          j += 2;
          let depth = 1;
          while (j < n && depth > 0) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}') depth--;
            else if (src[j] === '\n') line++;
            j++;
          }
          raw += ' ';
          continue;
        }
        if (src[j] === '\n') line++;
        raw += src[j];
        j++;
      }
      toks.push({ type: 'str', value: raw, line: startLine });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      toks.push({ type: 'id', value: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[\w.]/.test(src[j])) j++;
      toks.push({ type: 'num', value: src.slice(i, j), line });
      i = j;
      continue;
    }
    toks.push({ type: 'p', value: c, line });
    i++;
  }
  return toks;
}

function lintTs(file, src, lines) {
  const findings = [];
  const toks = tokenizeTs(src);
  const stack = [];
  const report = (ln) => {
    if (/\/\/\s*lint-ok\s*$/.test(lines[ln - 1] ?? '')) return;
    findings.push({ file, line: ln, snippet: (lines[ln - 1] ?? '').trim().slice(0, 160) });
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const prev = toks[k - 1];
    const next = toks[k + 1];
    if (t.type === 'p' && (t.value === '(' || t.value === '{' || t.value === '[')) {
      const dotted = !!(toks[k - 2] && toks[k - 2].type === 'p' && toks[k - 2].value === '.');
      const callee = t.value === '(' && prev && prev.type === 'id' ? prev.value : null;
      stack.push({ ch: t.value, callee, dotted, argIndex: 0 });
      continue;
    }
    if (t.type === 'p' && (t.value === ')' || t.value === '}' || t.value === ']')) {
      stack.pop();
      continue;
    }
    if (t.type === 'p' && t.value === ',') {
      const top = stack[stack.length - 1];
      if (top) top.argIndex++;
      continue;
    }
    const top = stack[stack.length - 1];
    // Call rules: fail( / ok( first argument, need( / log( second argument.
    if (t.type === 'str' && top && top.ch === '(' && top.callee && !top.dotted &&
        Object.prototype.hasOwnProperty.call(TS_CALL_RULES, top.callee) &&
        top.argIndex === TS_CALL_RULES[top.callee] &&
        prev && prev.type === 'p' && (prev.value === '(' || prev.value === ',') &&
        isProse(t.value)) {
      report(t.line);
      continue;
    }
    // Property rules: { title: '...' } etc., unless inside a t(...) call.
    if (t.type === 'id' && TS_PROPS.has(t.value) && next && next.type === 'p' && next.value === ':' &&
        prev && prev.type === 'p' && (prev.value === '{' || prev.value === ',') &&
        top && top.ch === '{') {
      const value = toks[k + 2];
      const inT = stack.some((e) => e.ch === '(' && e.callee === 't' && !e.dotted);
      if (!inT && value && value.type === 'str' && isProse(value.value)) report(value.line);
    }
  }
  return findings;
}

function gdLiterals(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '#') break;
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = '';
      while (j < line.length && line[j] !== c) {
        if (line[j] === '\\') { v += line[j] + (line[j + 1] ?? ''); j += 2; } else { v += line[j]; j++; }
      }
      out.push({ start: i, value: v });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

function lintGd(file, lines) {
  const findings = [];
  lines.forEach((line, idx) => {
    const ln = idx + 1;
    if (/#\s*lint-ok\s*$/.test(line) || GD_NON_UI.test(line)) return;
    const lits = gdLiterals(line);
    if (lits.length === 0) return;
    const flagged = new Set();
    const isPath = (v) => /^(res|user):\/\//.test(v);
    const isTr = (start) => /\btr\(\s*$/.test(line.slice(0, start));
    // Assignments: the literal right after `.text =` and friends.
    for (const m of line.matchAll(GD_ASSIGN)) {
      const q = m.index + m[0].length - 1;
      const lit = lits.find((l) => l.start === q);
      if (lit && !isPath(lit.value) && !isTr(lit.start) && gdProse(lit.value)) flagged.add(q);
    }
    // Helper calls: any literal argument after the call opens on this line.
    for (const m of line.matchAll(GD_HELPERS)) {
      const from = m.index + m[0].length;
      for (const lit of lits) {
        if (lit.start < from || flagged.has(lit.start)) continue;
        if (isPath(lit.value) || isTr(lit.start)) continue;
        if (gdProse(lit.value)) flagged.add(lit.start);
      }
    }
    if (flagged.size > 0) {
      findings.push({ file, line: ln, snippet: line.trim().slice(0, 160) });
    }
  });
  return findings;
}

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
}

/**
 * Lint the given paths (files or directories, relative to `opts.root`, default the cwd).
 * Returns [{ file, line, snippet }], with `file` relative to root and posix-slashed.
 */
export function lintFiles(paths = ['src', 'godot'], opts = {}) {
  const root = resolve(opts.root ?? process.cwd());
  const files = [];
  for (const p of paths) {
    const abs = resolve(root, p);
    if (!existsSync(abs)) throw new Error(`lint-strings: no such path: ${p}`);
    if (statSync(abs).isDirectory()) walk(abs, files);
    else files.push(abs);
  }
  const findings = [];
  for (const abs of files.sort()) {
    const rel = relative(root, abs).split(sep).join('/');
    const ext = extname(abs);
    if (ext !== '.ts' && ext !== '.gd') continue;
    if (SKIP.some((re) => re.test(rel))) continue;
    const src = readFileSync(abs, 'utf8');
    const lines = src.split('\n');
    findings.push(...(ext === '.ts' ? lintTs(rel, src, lines) : lintGd(rel, lines)));
  }
  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const findings = lintFiles(args.length ? args : ['src', 'godot']);
  if (findings.length) {
    for (const f of findings) console.log(`${f.file}:${f.line}: ${f.snippet}`);
    process.exitCode = 1;
  } else {
    console.log('lint-strings: 0 literals');
  }
}
