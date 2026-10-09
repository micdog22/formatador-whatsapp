// Lógica pura do formatador: Markdown <-> WhatsApp, leitura da formatação do
// WhatsApp para a pré-visualização, contagem, telefone e link wa.me. Sem DOM.

const KEEP_OPEN = '\uE000'; // trecho protegido (código, link, escape): \uE000<n>\uE001
const KEEP_CLOSE = '\uE001';
const BOLD = '\uE002';
const ITALIC = '\uE003';
const STRIKE = '\uE004';
const ESCAPABLE = '\\`*_{}[]()#+-.!~>|';

export function normalizeNewlines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

function keep(store, value) {
  store.push(value);
  return `${KEEP_OPEN}${store.length - 1}${KEEP_CLOSE}`;
}

function restore(text, store) {
  return text.replace(/\uE000(\d+)\uE001/g, (_, n) => restore(store[Number(n)] ?? '', store));
}

// Protege trechos de código e caracteres escapados, que nunca são alterados.
function protectCodeAndEscapes(text, store) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      out += keep(store, text[i + 1]);
      i += 2;
      continue;
    }
    if (ch === '`') {
      let run = 1;
      while (text[i + run] === '`') run++;
      const fence = '`'.repeat(run);
      let close = text.indexOf(fence, i + run);
      while (close !== -1 && text[close + run] === '`') {
        let skip = close;
        while (text[skip] === '`') skip++;
        close = text.indexOf(fence, skip);
      }
      if (close !== -1) {
        out += keep(store, text.slice(i, close + run));
        i = close + run;
        continue;
      }
      out += fence;
      i += run;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const LINK_RE = /!?\[((?:[^[\]]|\[[^[\]]*\])*)\]\(\s*<?([^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const AUTOLINK_RE = /<((?:https?|mailto):[^\s<>]+)>/g;
const URL_RE = /\bhttps?:\/\/[^\s<>\uE000-\uE004]+/g;

function trimUrl(url) {
  let end = url.length;
  while (end > 0 && '.,;:!?'.includes(url[end - 1])) end--;
  let clean = url.slice(0, end);
  if (clean.endsWith(')') && !clean.includes('(')) clean = clean.slice(0, -1);
  return clean;
}

function stripProtocol(url) {
  return url.replace(/^(?:https?:\/\/|mailto:)/, '').replace(/\/$/, '');
}

// Converte a formatação de uma linha de Markdown para os marcadores internos.
function convertInlineRaw(text, store) {
  let s = protectCodeAndEscapes(text, store);
  s = s.replace(AUTOLINK_RE, (_, url) => keep(store, url));
  s = s.replace(LINK_RE, (_, label, url) => {
    const shown = convertInlineRaw(label, store).trim();
    const plain = restore(shown, store).replace(/[\uE002-\uE004]/g, '');
    if (!plain || plain === url || plain === stripProtocol(url)) return keep(store, url);
    return keep(store, `${shown} (${keep(store, url)})`);
  });
  s = s.replace(URL_RE, (match) => {
    const url = trimUrl(match);
    return keep(store, url) + match.slice(url.length);
  });
  s = s.replace(/\*\*\*(?=\S)([^\n]*?\S)\*\*\*/g, `${BOLD}${ITALIC}$1${ITALIC}${BOLD}`);
  s = s.replace(/(^|[^\p{L}\p{N}_])___(?=\S)([^\n]*?\S)___(?![\p{L}\p{N}_])/gu, `$1${BOLD}${ITALIC}$2${ITALIC}${BOLD}`);
  s = s.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, `${BOLD}$1${BOLD}`);
  s = s.replace(/(^|[^\p{L}\p{N}_])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}_])/gu, `$1${BOLD}$2${BOLD}`);
  s = s.replace(/~~(?=\S)([^\n]*?\S)~~/g, `${STRIKE}$1${STRIKE}`);
  s = s.replace(/\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, `${ITALIC}$1${ITALIC}`);
  s = s.replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu, `$1${ITALIC}$2${ITALIC}`);
  return s;
}

function finalize(text, store, { heading = false } = {}) {
  let s = restore(text, store);
  if (heading) s = BOLD + s.replaceAll(BOLD, '') + BOLD;
  return s.replaceAll(BOLD, '*').replaceAll(ITALIC, '_').replaceAll(STRIKE, '~');
}

function convertInline(text, options) {
  const store = [];
  return finalize(convertInlineRaw(text, store), store, options);
}

function convertMarkdownLine(line) {
  if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return line; // linha horizontal
  let m = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
  if (m) return m[1] ? convertInline(m[1], { heading: true }) : line;
  m = /^ {0,3}>[ \t]?(.*)$/.exec(line);
  if (m) return `> ${convertMarkdownLine(m[1])}`.trimEnd();
  m = /^([ \t]*)[-*+][ \t]+(.*)$/.exec(line);
  if (m) return `${m[1]}- ${convertInline(m[2])}`;
  m = /^([ \t]*)(\d{1,9}[.)])[ \t]+(.*)$/.exec(line);
  if (m) return `${m[1]}${m[2]} ${convertInline(m[3])}`;
  return convertInline(line);
}

/** Markdown -> texto formatado para o WhatsApp. */
export function markdownToWhatsApp(markdown) {
  const lines = normalizeNewlines(markdown).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,})[^`]*$|^ {0,3}(~{3,}).*$/.exec(lines[i]);
    if (open) {
      const fence = open[1] || open[2];
      const closer = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
      const body = [];
      let j = i + 1;
      while (j < lines.length && !closer.test(lines[j])) body.push(lines[j++]);
      if (body.some((l) => l.trim())) out.push('```' + body.join('\n') + '```');
      i = j;
      continue;
    }
    out.push(convertMarkdownLine(lines[i]));
  }
  return out.join('\n');
}

// ---------- WhatsApp -> nós (pré-visualização) e -> Markdown ----------

const WA_MARKERS = { '*': 'bold', _: 'italic', '~': 'strike' };
const isWordChar = (ch) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const isSpace = (ch) => ch === undefined || /\s/.test(ch);

/** Lê a formatação do WhatsApp em uma linha: negrito, itálico, tachado, código. */
export function parseWhatsAppInline(text) {
  const nodes = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (text.startsWith('```', i)) {
      const end = text.indexOf('```', i + 3);
      if (end > i + 3) {
        flush();
        nodes.push({ type: 'mono', text: text.slice(i + 3, end) });
        i = end + 3;
        continue;
      }
    }
    if (ch === '`' && text[i + 1] !== '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (WA_MARKERS[ch] && !isWordChar(text[i - 1]) && !isSpace(text[i + 1]) && text[i + 1] !== ch) {
      let close = text.indexOf(ch, i + 2);
      while (close !== -1 && (isSpace(text[close - 1]) || isWordChar(text[close + 1]))) {
        close = text.indexOf(ch, close + 1);
      }
      if (close !== -1) {
        flush();
        nodes.push({ type: WA_MARKERS[ch], children: parseWhatsAppInline(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    buffer += ch;
    i++;
  }
  flush();
  return nodes;
}

function splitMonoBlocks(text) {
  const parts = [];
  const re = /```([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (!m[1].includes('\n')) continue;
    parts.push({ type: 'text', text: text.slice(last, m.index) });
    parts.push({ type: 'mono', text: m[1] });
    last = re.lastIndex;
  }
  parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

function parseWhatsAppLine(line) {
  let m = /^([ \t]*)[*-][ \t]+(.*)$/.exec(line);
  if (m) return { type: 'bullet', indent: m[1], nodes: parseWhatsAppInline(m[2]) };
  m = /^([ \t]*)(\d{1,9}[.)])[ \t]+(.*)$/.exec(line);
  if (m) return { type: 'numbered', indent: m[1], marker: m[2], nodes: parseWhatsAppInline(m[3]) };
  m = /^>[ \t]?(.*)$/.exec(line);
  if (m) return { type: 'quote', nodes: parseWhatsAppInline(m[1]) };
  return { type: 'line', nodes: parseWhatsAppInline(line) };
}

/** Texto do WhatsApp -> blocos para desenhar a pré-visualização. */
export function parseWhatsApp(text) {
  const blocks = [];
  const parts = splitMonoBlocks(normalizeNewlines(text));
  parts.forEach((part, index) => {
    if (part.type === 'mono') {
      blocks.push({ type: 'mono', text: part.text.replace(/^\n/, '').replace(/\n$/, '') });
      return;
    }
    let lines = part.text.split('\n');
    // A quebra de linha colada a um bloco monoespaçado não vira linha vazia.
    if (index > 0 && lines[0] === '') lines = lines.slice(1);
    if (index < parts.length - 1 && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
    for (const line of lines) blocks.push(parseWhatsAppLine(line));
  });
  return blocks;
}

function inlineToMarkdown(nodes) {
  return nodes.map((node) => {
    switch (node.type) {
      case 'bold': return `**${inlineToMarkdown(node.children)}**`;
      case 'italic': return `_${inlineToMarkdown(node.children)}_`;
      case 'strike': return `~~${inlineToMarkdown(node.children)}~~`;
      case 'code': return `\`${node.text}\``;
      case 'mono': return node.text.includes('`') ? `\`\`\`${node.text}\`\`\`` : `\`${node.text}\``;
      default: return node.text;
    }
  }).join('');
}

/** Texto formatado do WhatsApp -> Markdown. */
export function whatsAppToMarkdown(text) {
  const out = [];
  for (const block of parseWhatsApp(text)) {
    if (block.type === 'mono') out.push('```', block.text, '```');
    else if (block.type === 'bullet') out.push(`${block.indent}- ${inlineToMarkdown(block.nodes)}`);
    else if (block.type === 'numbered') out.push(`${block.indent}${block.marker} ${inlineToMarkdown(block.nodes)}`);
    else if (block.type === 'quote') out.push(`> ${inlineToMarkdown(block.nodes)}`.trimEnd());
    else out.push(inlineToMarkdown(block.nodes));
  }
  return out.join('\n');
}

/** Separa endereços web dentro de um texto (para destacar na pré-visualização). */
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>]+/g)) {
    const url = trimUrl(m[0]);
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: url, link: true });
    last = m.index + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// ---------- Contagem ----------

export function countText(text) {
  const s = String(text ?? '');
  let chars = 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const _ of new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(s)) chars++;
  } else {
    chars = Array.from(s).length;
  }
  const words = s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { chars, words };
}

// ---------- Telefone e link wa.me ----------

const DDD_RANGES = [
  [11, 19], [21, 22], [24, 24], [27, 28], [31, 35], [37, 38], [41, 49], [51, 51], [53, 55],
  [61, 69], [71, 71], [73, 75], [77, 77], [79, 79], [81, 89], [91, 99],
];
export const VALID_DDDS = new Set(DDD_RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)));

export function formatPhone(national) {
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  const cut = rest.length === 9 ? 5 : 4;
  return `+55 (${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** Normaliza e valida um telefone brasileiro com DDD. Retorna os dígitos com 55. */
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'Informe o número com DDD.' };
  if (/[^\d\s().+\-/]/.test(raw)) return { ok: false, error: 'Use só números (espaços, parênteses, + e - são aceitos).' };
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') || digits.startsWith('00')) {
    digits = digits.replace(/^00/, '');
    if (!digits.startsWith('55')) return { ok: false, error: 'Só números do Brasil (+55) são aceitos.' };
    digits = digits.slice(2);
  } else if (digits.length >= 12 && digits.startsWith('55')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1); // prefixo de longa distância, como em (019)
  }
  if (digits.length < 10) return { ok: false, error: 'Número curto demais: inclua o DDD (2 dígitos) e o número.' };
  if (digits.length > 11) return { ok: false, error: 'Número longo demais: use DDD + número, com ou sem +55.' };
  const ddd = Number(digits.slice(0, 2));
  if (!VALID_DDDS.has(ddd)) return { ok: false, error: `O DDD ${digits.slice(0, 2)} não existe.` };
  const number = digits.slice(2);
  if (number.length === 9 && number[0] !== '9') {
    return { ok: false, error: 'Celular tem 9 dígitos e começa com 9.' };
  }
  if (number.length === 8 && !/^[2-5]/.test(number)) {
    return { ok: false, error: 'Número de 8 dígitos precisa ser fixo (começa com 2, 3, 4 ou 5). Celular tem 9 dígitos e começa com 9.' };
  }
  return {
    ok: true,
    digits: `55${digits}`,
    type: number.length === 9 ? 'celular' : 'fixo',
    formatted: formatPhone(digits),
  };
}

function wellFormed(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    out += code >= 0xd800 && code <= 0xdfff ? '\uFFFD' : ch;
  }
  return out;
}

/** Monta o link https://wa.me/55DDDNUMERO com a mensagem opcional. */
export function buildWaLink(digits, message = '') {
  const base = `https://wa.me/${String(digits).replace(/\D/g, '')}`;
  const text = normalizeNewlines(message);
  return text.trim() ? `${base}?text=${encodeURIComponent(wellFormed(text))}` : base;
}

// ---------- Barra de ferramentas ----------

const WRAP_MARKERS = {
  markdown: { bold: '**', italic: '_', strike: '~~', code: '`' },
  whatsapp: { bold: '*', italic: '_', strike: '~', code: '`', mono: '```' },
};
const PLACEHOLDERS = { bold: 'negrito', italic: 'itálico', strike: 'tachado', code: 'código', mono: 'texto' };

function wrapSelection(text, start, end, marker, placeholder, perLine = true) {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  const selected = text.slice(s, e);
  const n = marker.length;
  if (selected && text.slice(s - n, s) === marker && text.slice(e, e + n) === marker) {
    return { start: s - n, end: e + n, insert: selected, selStart: s - n, selEnd: e - n };
  }
  if (perLine && selected.includes('\n')) {
    const insert = selected.split('\n').map((line) => {
      const t = line.trim();
      return t ? line.replace(t, marker + t + marker) : line;
    }).join('\n');
    return { start: s, end: e, insert, selStart: s, selEnd: s + insert.length };
  }
  const inner = selected || placeholder;
  return { start: s, end: e, insert: marker + inner + marker, selStart: s + n, selEnd: s + n + inner.length };
}

function codeBlock(text, start, end) {
  const inner = text.slice(start, end) || 'código';
  const before = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
  const after = end < text.length && text[end] !== '\n' ? '\n' : '';
  const insert = `${before}\`\`\`\n${inner}\n\`\`\`${after}`;
  const selStart = start + before.length + 4;
  return { start, end, insert, selStart, selEnd: selStart + inner.length };
}

const LINE_PATTERNS = { bullet: /^([ \t]*)[-*+][ \t]+/, numbered: /^([ \t]*)\d{1,9}[.)][ \t]+/, quote: /^()>[ \t]?/ };

function prefixLines(text, start, end, kind) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const endAt = end > start && text[end - 1] === '\n' ? end - 1 : end;
  let lineEnd = text.indexOf('\n', endAt);
  if (lineEnd === -1) lineEnd = text.length;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const pattern = LINE_PATTERNS[kind];
  const filled = lines.filter((l) => l.trim());
  const remove = filled.length > 0 && filled.every((l) => pattern.test(l));
  let count = 0;
  const out = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    if (remove) return line.replace(pattern, '$1');
    count++;
    const prefix = kind === 'bullet' ? '- ' : kind === 'numbered' ? `${count}. ` : '> ';
    const bare = kind === 'quote' ? line : line.replace(/^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+/, '$1');
    const indent = kind === 'quote' ? '' : /^[ \t]*/.exec(bare)[0];
    return indent + prefix + bare.slice(indent.length);
  });
  const insert = out.join('\n');
  const collapsed = start === end;
  return {
    start: lineStart,
    end: lineEnd,
    insert,
    selStart: collapsed ? lineStart + insert.length : lineStart,
    selEnd: lineStart + insert.length,
  };
}

/**
 * Aplica uma ação da barra de ferramentas na seleção [start, end).
 * Retorna o trecho a substituir ({start, end, insert}) e a nova seleção.
 */
export function applyFormat(text, start, end, action, mode = 'markdown') {
  if (action === 'bullet' || action === 'numbered' || action === 'quote') return prefixLines(text, start, end, action);
  if (action === 'mono' && mode === 'markdown') return codeBlock(text, start, end);
  const marker = WRAP_MARKERS[mode === 'whatsapp' ? 'whatsapp' : 'markdown'][action];
  if (!marker) throw new Error(`Ação desconhecida: ${action}`);
  // Negrito, itálico etc. não atravessam linhas no WhatsApp; o monoespaçado sim.
  return wrapSelection(text, start, end, marker, PLACEHOLDERS[action], action !== 'mono');
}
