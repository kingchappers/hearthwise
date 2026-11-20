// Finds the ways a source file can reach the network or run something else: an import, a require, a dynamic import, a call to fetch (or
// WebSocket and its kin), and the tricks that hide a module name (a computed require, createRequire, process.binding, eval). It reads
// the text with a small lexer, so a comment or a string that only mentions "fetch(" or "require('https')" is not a use, and code after
// one is still seen.

export interface NetworkUse {
  what: string;
  line: number;
}

const NETWORK_MODULES = new Set(['http', 'https', 'http2', 'net', 'tls', 'dns', 'dgram', 'child_process', 'undici', 'axios', 'got', 'node-fetch', 'cross-fetch', 'isomorphic-fetch', 'ws', 'request', 'superagent', 'needle', 'ky']);
const GLOBAL_CLIENTS = ['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource'];
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);

interface Lexed {
  // Comments blanked, strings kept: read module names from here.
  kept: string;
  // Comments, strings and regular expressions blanked (the quotes stay): find keywords here, so text inside a string never counts.
  blanked: string;
}

function lex(source: string): Lexed {
  const n = source.length;
  const kept = source.split('');
  const blanked = source.split('');
  let i = 0;

  const blank = (index: number, inBoth: boolean): void => {
    if (source[index] === '\n') return;
    blanked[index] = ' ';
    if (inBoth) kept[index] = ' ';
  };

  function scanString(quote: string): void {
    i++;
    while (i < n && source[i] !== quote) {
      if (source[i] === '\n') return;
      if (source[i] === '\\') blank(i++, false);
      if (i < n) blank(i, false);
      i++;
    }
    i++;
  }

  function scanTemplate(): void {
    i++;
    while (i < n && source[i] !== '`') {
      if (source[i] === '\\') {
        blank(i++, false);
        if (i < n) blank(i++, false);
      } else if (source[i] === '$' && source[i + 1] === '{') {
        i += 2;
        scanCode(true);
        i++;
      } else {
        blank(i++, false);
      }
    }
    i++;
  }

  function scanRegex(): void {
    i++;
    let inClass = false;
    while (i < n) {
      const ch = source[i];
      if (ch === '\n') return;
      if (ch === '\\') {
        blank(i++, false);
      } else if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) {
        i++;
        return;
      }
      if (i < n) blank(i, false);
      i++;
    }
  }

  function scanCode(stopAtBrace: boolean): void {
    let depth = 0;
    let last = '';
    let lastWord = '';
    let word = '';
    while (i < n) {
      const c = source[i];
      const next = source[i + 1];
      if (/[\w$]/.test(c)) {
        word += c;
        last = c;
        lastWord = word;
        i++;
        continue;
      }
      word = '';
      if (c === '/' && next === '/') {
        while (i < n && source[i] !== '\n') blank(i++, true);
      } else if (c === '/' && next === '*') {
        blank(i++, true);
        blank(i++, true);
        while (i < n && !(source[i] === '*' && source[i + 1] === '/')) blank(i++, true);
        if (i < n) {
          blank(i++, true);
          blank(i++, true);
        }
      } else if (c === '"' || c === "'") {
        scanString(c);
        last = ')';
        lastWord = '';
      } else if (c === '`') {
        scanTemplate();
        last = ')';
        lastWord = '';
      } else if (c === '/') {
        const regexAllowed = last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last) || REGEX_AFTER_WORD.has(lastWord);
        if (regexAllowed) {
          scanRegex();
          last = ')';
          lastWord = '';
        } else {
          last = c;
          lastWord = '';
          i++;
        }
      } else if (c === '{') {
        depth++;
        last = c;
        lastWord = '';
        i++;
      } else if (c === '}') {
        if (stopAtBrace && depth === 0) return;
        depth--;
        last = c;
        lastWord = '';
        i++;
      } else {
        if (!/\s/.test(c)) {
          last = c;
          lastWord = '';
        }
        i++;
      }
    }
  }

  scanCode(false);
  return { kept: kept.join(''), blanked: blanked.join('') };
}

// A non-test file must not import from a test folder or a test file.
const isTestPath = (specifier: string): boolean => /(^|\/)__tests__(\/|$)|\.test(\.|$)/.test(specifier);
const moduleName = (specifier: string): string => specifier.replace(/^node:/, '').split('/')[0];
const isNetworkModule = (specifier: string): boolean => !/^[./]/.test(specifier) && NETWORK_MODULES.has(moduleName(specifier));

// Reads a plain string (or a template with no holes) at the start of `text`, then expects `)` or `,`. Anything else is not plain.
function plainArgument(text: string, afterCall = true): string | undefined {
  const match = (afterCall ? /^\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)\s*[),]/ : /^\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)/).exec(text);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

export function findNetworkUse(source: string): NetworkUse[] {
  const { kept, blanked } = lex(source);
  const found: NetworkUse[] = [];
  const lineOf = (index: number): number => source.slice(0, index).split('\n').length;
  const add = (what: string, index: number): void => {
    found.push({ what, line: lineOf(index) });
  };

  // require(...) and import(...): the module is read from the plain text, and anything that is not plain text is a use.
  for (const match of blanked.matchAll(/(?<![\w$.])(require|import)\s*\(/g)) {
    const specifier = plainArgument(kept.slice(match.index + match[0].length));
    if (specifier === undefined) add(`<computed ${match[1]}>`, match.index);
    else if (isTestPath(specifier)) add('<test import>', match.index);
    else if (isNetworkModule(specifier)) add(moduleName(specifier), match.index);
  }
  for (const match of blanked.matchAll(/(?<![\w$.])require\b(?!\s*[(.])/g)) add('<require alias>', match.index);
  for (const match of blanked.matchAll(/\bmodule\s*\.\s*require\b/g)) add('<module.require>', match.index);
  for (const match of blanked.matchAll(/\bcreateRequire\b/g)) add('<createRequire>', match.index);
  for (const match of blanked.matchAll(/\bprocess\s*\.\s*(binding|dlopen|_linkedBinding|getBuiltinModule)\b/g)) add(`<process.${match[1]}>`, match.index);
  // process['getBuiltinModule'](...) and the like: any computed access on process.
  for (const match of blanked.matchAll(/(?<![\w$.])process\s*\[/g)) add('<process[...]>', match.index);
  // The global object handed around or aliased (const g = globalThis; g.fetch(...)) hides a fetch from the name scan.
  for (const match of blanked.matchAll(/(?<![\w$.])(globalThis|self|window|global)\b(?!\s*(?:\.\s*[\w$]|:))/g)) add(`<${match[1]} alias>`, match.index);
  for (const match of blanked.matchAll(/(?<![\w$.])eval\s*\(|(?<![\w$.])Function\s*\(|\bnew\s+Function\b/g)) add('<dynamic code>', match.index);

  // import 'x' and import ... from 'x' and export ... from 'x' (a type-only one has no effect at run time).
  for (const match of blanked.matchAll(/(?<![\w$.])import\s*(['"`])/g)) {
    const specifier = plainArgument(kept.slice(match.index + match[0].length - 1), false);
    if (specifier === undefined) continue;
    if (isTestPath(specifier)) add('<test import>', match.index);
    else if (isNetworkModule(specifier)) add(moduleName(specifier), match.index);
  }
  for (const match of blanked.matchAll(/(?<![\w$.])from\s*(['"`])/g)) {
    const before = blanked.slice(0, match.index);
    const start = Math.max(before.lastIndexOf('import'), before.lastIndexOf('export'));
    if (start < 0) continue;
    const between = before.slice(start).replace(/^(import|export)/, '');
    if (!/^[\s\w$*{},]*$/.test(between)) continue;
    if (/^\s+type\b(?!\s*,)/.test(between) && /^\s+type\s*[{*\w]/.test(between)) continue;
    const specifier = plainArgument(kept.slice(match.index + match[0].length - 1), false);
    if (specifier === undefined) continue;
    if (isTestPath(specifier)) add('<test import>', match.index);
    else if (isNetworkModule(specifier)) add(moduleName(specifier), match.index);
  }
  // import x = require('y') is covered by the require scan above.

  for (const name of GLOBAL_CLIENTS) {
    for (const match of blanked.matchAll(new RegExp(`(?<![\\w$.])${name}(?![\\w$])`, 'g'))) add(name, match.index);
    for (const match of blanked.matchAll(new RegExp(`\\b(?:globalThis|window|self|global)\\s*\\.\\s*${name}\\b`, 'g'))) add(name, match.index);
    for (const match of kept.matchAll(new RegExp(`\\b(?:globalThis|window|self|global)\\s*\\[\\s*['"\`]${name}['"\`]\\s*\\]`, 'g'))) add(name, match.index);
  }
  for (const match of blanked.matchAll(/\bsendBeacon\b/g)) add('sendBeacon', match.index);

  return found;
}
