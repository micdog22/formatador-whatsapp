import {
  markdownToWhatsApp, whatsAppToMarkdown, parseWhatsApp, splitLinks, countText,
  normalizePhone, buildWaLink, applyFormat,
} from './whatsapp.js';

const STORAGE_KEY = 'formatador-whatsapp';
const EXAMPLE = `# Reunião de sexta

Olá, **equipe**! Seguem os _pontos_ de hoje:

- Revisar o ~~orçamento antigo~~ novo orçamento
- Enviar o relatório até as **18h**
- Rodar o comando \`npm test\` antes de publicar

1. Abertura
2. Resultados do mês

> Lembrete: a reunião começa **pontualmente**.

Pauta completa em [nosso site](https://example.com/agenda).`;

const $ = (id) => document.getElementById(id);
const els = {
  modes: document.querySelectorAll('input[name="mode"]'),
  editor: $('editor'),
  editorLabel: $('editor-label'),
  editorCount: $('editor-count'),
  tools: document.querySelectorAll('.tool'),
  example: $('example'),
  clear: $('clear'),
  preview: $('preview'),
  time: $('time'),
  output: $('output'),
  outputCount: $('output-count'),
  resultKind: $('result-kind'),
  copy: $('copy'),
  copyStatus: $('copy-status'),
  phone: $('phone'),
  phoneStatus: $('phone-status'),
  includeMessage: $('include-message'),
  link: $('link'),
  copyLink: $('copy-link'),
  openLink: $('open-link'),
  linkStatus: $('link-status'),
};

const state = { mode: 'markdown', text: EXAMPLE, phone: '', includeMessage: true };
let currentLink = '';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return;
    if (saved.mode === 'markdown' || saved.mode === 'whatsapp') state.mode = saved.mode;
    if (typeof saved.text === 'string') state.text = saved.text;
    if (typeof saved.phone === 'string') state.phone = saved.phone;
    if (typeof saved.includeMessage === 'boolean') state.includeMessage = saved.includeMessage;
  } catch {
    // Sem armazenamento disponível: começa com o exemplo.
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignora: as preferências só não ficam salvas.
  }
}

function plural(n, one, many) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}

function describeCount(text) {
  const { chars, words } = countText(text);
  return `${plural(chars, 'caractere', 'caracteres')} · ${plural(words, 'palavra', 'palavras')}`;
}

// Texto no formato do WhatsApp (o que vai para a conversa e para o link).
function whatsappText() {
  return state.mode === 'markdown' ? markdownToWhatsApp(state.text) : state.text;
}

function renderNodes(nodes, parent) {
  for (const node of nodes) {
    if (node.type === 'text') {
      for (const part of splitLinks(node.text)) {
        if (part.link) {
          const span = document.createElement('span');
          span.className = 'wa-link';
          span.textContent = part.text;
          parent.appendChild(span);
        } else {
          parent.appendChild(document.createTextNode(part.text));
        }
      }
    } else if (node.type === 'code' || node.type === 'mono') {
      const el = document.createElement(node.type === 'code' ? 'code' : 'span');
      el.className = node.type === 'code' ? 'wa-code' : 'wa-mono';
      el.textContent = node.text;
      parent.appendChild(el);
    } else {
      const el = document.createElement({ bold: 'strong', italic: 'em', strike: 's' }[node.type]);
      renderNodes(node.children, el);
      parent.appendChild(el);
    }
  }
}

function renderPreview(text) {
  if (!text.trim()) {
    const span = document.createElement('span');
    span.className = 'placeholder';
    span.textContent = 'Sua mensagem aparece aqui.';
    els.preview.replaceChildren(span);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const block of parseWhatsApp(text)) {
    let el;
    if (block.type === 'mono') {
      el = document.createElement('div');
      el.className = 'wa-mono-block';
      el.textContent = block.text;
    } else if (block.type === 'bullet' || block.type === 'numbered') {
      el = document.createElement('div');
      el.className = 'wa-li';
      const marker = document.createElement('span');
      marker.className = 'marker';
      marker.textContent = `${block.indent}${block.type === 'bullet' ? '•' : block.marker}`;
      const content = document.createElement('span');
      renderNodes(block.nodes, content);
      el.append(marker, content);
    } else {
      el = document.createElement('div');
      el.className = block.type === 'quote' ? 'wa-quote' : 'wa-line';
      renderNodes(block.nodes, el);
    }
    frag.appendChild(el);
  }
  els.preview.replaceChildren(frag);
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.classList.toggle('error', kind === 'error');
  el.classList.toggle('ok', kind === 'ok');
}

function renderLink(waText) {
  const raw = state.phone.trim();
  if (!raw) {
    setStatus(els.phoneStatus, 'Exemplos: (19) 99999-9999, 19999999999 ou +55 19 99999-9999.');
    currentLink = '';
  } else {
    const phone = normalizePhone(raw);
    if (phone.ok) {
      setStatus(els.phoneStatus, `${phone.type === 'celular' ? 'Celular' : 'Telefone fixo'} válido: ${phone.formatted}`, 'ok');
      currentLink = buildWaLink(phone.digits, state.includeMessage ? waText : '');
    } else {
      setStatus(els.phoneStatus, phone.error, 'error');
      currentLink = '';
    }
  }
  els.link.value = currentLink;
  if (currentLink) {
    els.openLink.href = currentLink;
    els.openLink.removeAttribute('aria-disabled');
    els.openLink.removeAttribute('tabindex');
  } else {
    els.openLink.removeAttribute('href');
    els.openLink.setAttribute('aria-disabled', 'true');
    els.openLink.setAttribute('tabindex', '-1');
  }
  els.copyLink.disabled = !currentLink;
}

function render() {
  const markdownMode = state.mode === 'markdown';
  const waText = whatsappText();
  const output = markdownMode ? waText : whatsAppToMarkdown(state.text);
  els.output.value = output;
  els.editorLabel.textContent = markdownMode ? 'Texto em Markdown' : 'Texto no formato do WhatsApp';
  els.editor.placeholder = markdownMode
    ? 'Escreva em Markdown: **negrito**, *itálico*, ~~tachado~~, listas, citações…'
    : 'Cole uma mensagem do WhatsApp: *negrito*, _itálico_, ~tachado~…';
  els.resultKind.textContent = markdownMode ? 'Texto pronto para colar no WhatsApp' : 'Markdown';
  els.editorCount.textContent = describeCount(state.text);
  els.outputCount.textContent = describeCount(output);
  renderPreview(waText);
  renderLink(waText);
  save();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function runAction(action) {
  const ta = els.editor;
  const change = applyFormat(ta.value, ta.selectionStart, ta.selectionEnd, action, state.mode);
  ta.focus();
  ta.setSelectionRange(change.start, change.end);
  let done = false;
  try {
    // insertText mantém o desfazer (Ctrl+Z) do navegador funcionando.
    done = document.execCommand('insertText', false, change.insert);
  } catch {
    done = false;
  }
  if (!done || ta.value.slice(change.start, change.start + change.insert.length) !== change.insert) {
    ta.setRangeText(change.insert, change.start, change.end, 'end');
  }
  ta.setSelectionRange(change.selStart, change.selEnd);
  state.text = ta.value;
  render();
}

for (const tool of els.tools) {
  tool.addEventListener('click', () => runAction(tool.dataset.action));
}
els.editor.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const key = e.key.toLowerCase();
  if (key === 'b' || key === 'i') {
    e.preventDefault();
    runAction(key === 'b' ? 'bold' : 'italic');
  }
});
els.editor.addEventListener('input', () => {
  state.text = els.editor.value;
  setStatus(els.copyStatus, '');
  render();
});
for (const radio of els.modes) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.mode = radio.value;
    setStatus(els.copyStatus, '');
    render();
  });
}
els.example.addEventListener('click', () => {
  state.text = state.mode === 'markdown' ? EXAMPLE : markdownToWhatsApp(EXAMPLE);
  els.editor.value = state.text;
  render();
});
els.clear.addEventListener('click', () => {
  state.text = '';
  els.editor.value = '';
  render();
  els.editor.focus();
});
els.copy.addEventListener('click', async () => {
  if (!els.output.value.trim()) {
    setStatus(els.copyStatus, 'Nada para copiar: escreva algo no editor.', 'error');
    return;
  }
  const ok = await copyText(els.output.value);
  setStatus(els.copyStatus, ok ? 'Copiado! Agora é só colar na conversa.' : 'Não foi possível copiar. Selecione o texto e copie manualmente.', ok ? 'ok' : 'error');
});
els.phone.addEventListener('input', () => {
  state.phone = els.phone.value;
  setStatus(els.linkStatus, '');
  renderLink(whatsappText());
  save();
});
els.includeMessage.addEventListener('change', () => {
  state.includeMessage = els.includeMessage.checked;
  renderLink(whatsappText());
  save();
});
els.copyLink.addEventListener('click', async () => {
  if (!currentLink) return;
  const ok = await copyText(currentLink);
  setStatus(els.linkStatus, ok ? 'Link copiado.' : 'Não foi possível copiar. Selecione o link e copie manualmente.', ok ? 'ok' : 'error');
});

load();
els.editor.value = state.text;
els.phone.value = state.phone;
els.includeMessage.checked = state.includeMessage;
for (const radio of els.modes) radio.checked = radio.value === state.mode;
els.time.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
render();
