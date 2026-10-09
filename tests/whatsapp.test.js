import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  markdownToWhatsApp, whatsAppToMarkdown, parseWhatsApp, parseWhatsAppInline, splitLinks,
  countText, normalizePhone, buildWaLink, VALID_DDDS, applyFormat,
} from '../src/whatsapp.js';

const md = markdownToWhatsApp;
const wa = whatsAppToMarkdown;

test('negrito, itálico e tachado', () => {
  assert.equal(md('**negrito**'), '*negrito*');
  assert.equal(md('__negrito__'), '*negrito*');
  assert.equal(md('*itálico*'), '_itálico_');
  assert.equal(md('_itálico_'), '_itálico_');
  assert.equal(md('~~tachado~~'), '~tachado~');
  assert.equal(md('***os dois***'), '*_os dois_*');
  assert.equal(md('Uma **palavra** só'), 'Uma *palavra* só');
});

test('formatação aninhada', () => {
  assert.equal(md('**negrito com _itálico_ dentro**'), '*negrito com _itálico_ dentro*');
  assert.equal(md('*itálico com **negrito** dentro*'), '_itálico com *negrito* dentro_');
  assert.equal(md('~~riscado com **negrito**~~'), '~riscado com *negrito*~');
});

test('formatações vizinhas', () => {
  assert.equal(md('**um** **dois**'), '*um* *dois*');
  assert.equal(md('**um**, *dois* e ~~três~~'), '*um*, _dois_ e ~três~');
  assert.equal(md('**a**/**b**'), '*a*/*b*');
});

test('não confunde sublinhados e asteriscos soltos', () => {
  assert.equal(md('snake_case_var e nome__do__arquivo'), 'snake_case_var e nome__do__arquivo');
  assert.equal(md('2 * 3 * 4 = 24'), '2 * 3 * 4 = 24');
  assert.equal(md('Hotel 5* no centro'), 'Hotel 5* no centro');
  assert.equal(md('#hashtag sem espaço'), '#hashtag sem espaço');
});

test('nunca mexe no que está dentro de código', () => {
  assert.equal(md('Rode `npm **test**` agora'), 'Rode `npm **test**` agora');
  assert.equal(md('``code com ` crase``'), '``code com ` crase``');
  assert.equal(md('```js\nconst a = **1**;\nconst b = _2_;\n```'), '```const a = **1**;\nconst b = _2_;```');
  assert.equal(md('~~~\n# não é título\n~~~'), '```# não é título```');
  // Bloco sem fechamento vai até o fim do texto.
  assert.equal(md('Antes\n```\n**solto**'), 'Antes\n```**solto**```');
  // Bloco vazio some.
  assert.equal(md('```\n```'), '');
});

test('títulos viram negrito', () => {
  assert.equal(md('# Título'), '*Título*');
  assert.equal(md('### Seção 2 ###'), '*Seção 2*');
  assert.equal(md('## Olá **mundo**'), '*Olá mundo*');
  assert.equal(md('# Olá _mundo_'), '*Olá _mundo_*');
});

test('listas, citações e linhas', () => {
  assert.equal(md('- item'), '- item');
  assert.equal(md('* item'), '- item');
  assert.equal(md('+ item'), '- item');
  assert.equal(md('  - subitem **forte**'), '  - subitem *forte*');
  assert.equal(md('1. primeiro\n2. segundo'), '1. primeiro\n2. segundo');
  assert.equal(md('> citação com **destaque**'), '> citação com *destaque*');
  assert.equal(md('> * item citado'), '> - item citado');
  assert.equal(md('---'), '---');
  assert.equal(md('***'), '***');
});

test('links e endereços', () => {
  assert.equal(md('Veja [o site](https://example.com/agenda).'), 'Veja o site (https://example.com/agenda).');
  assert.equal(md('[https://example.com](https://example.com)'), 'https://example.com');
  assert.equal(md('[example.com](https://example.com/)'), 'https://example.com/');
  assert.equal(md('![logo](https://example.com/logo.png)'), 'logo (https://example.com/logo.png)');
  assert.equal(md('[**forte**](https://example.com)'), '*forte* (https://example.com)');
  assert.equal(md('<https://example.com/a_b_>'), 'https://example.com/a_b_');
  assert.equal(md('Acesse https://example.com/a__b__c, ok?'), 'Acesse https://example.com/a__b__c, ok?');
  assert.equal(md('[wiki](https://example.com/Foo_(bar))'), 'wiki (https://example.com/Foo_(bar))');
});

test('caracteres escapados aparecem sem a barra', () => {
  assert.equal(md('\\# não é título'), '# não é título');
  assert.equal(md('1\\. não é lista'), '1. não é lista');
});

test('quebras de linha do Windows', () => {
  assert.equal(md('**a**\r\n**b**'), '*a*\n*b*');
});

test('WhatsApp para Markdown', () => {
  assert.equal(wa('*negrito*'), '**negrito**');
  assert.equal(wa('_itálico_'), '_itálico_');
  assert.equal(wa('~tachado~'), '~~tachado~~');
  assert.equal(wa('*negrito _e itálico_*'), '**negrito _e itálico_**');
  assert.equal(wa('`código`'), '`código`');
  assert.equal(wa('```mono```'), '`mono`');
  assert.equal(wa('```linha 1\nlinha 2```'), '```\nlinha 1\nlinha 2\n```');
  assert.equal(wa('* item\n- outro'), '- item\n- outro');
  assert.equal(wa('1. um'), '1. um');
  assert.equal(wa('> *citação*'), '> **citação**');
  // Marcadores no meio da palavra ou com espaço não são formatação no WhatsApp.
  assert.equal(wa('a*b*c e * solto *'), 'a*b*c e * solto *');
  assert.equal(wa('snake_case_var'), 'snake_case_var');
});

test('ida e volta preserva a formatação principal', () => {
  const original = '**Oi**, tudo _bem_?\n\n- item ~~velho~~\n1. passo\n> nota';
  assert.equal(wa(md(original)), original);
});

test('lê a formatação do WhatsApp para a pré-visualização', () => {
  assert.deepEqual(parseWhatsAppInline('*a* e _b_'), [
    { type: 'bold', children: [{ type: 'text', text: 'a' }] },
    { type: 'text', text: ' e ' },
    { type: 'italic', children: [{ type: 'text', text: 'b' }] },
  ]);
  const blocks = parseWhatsApp('Olá\n- item\n2. dois\n> nota\n```x\ny```\nfim');
  assert.deepEqual(blocks.map((b) => b.type), ['line', 'bullet', 'numbered', 'quote', 'mono', 'line']);
  assert.equal(blocks[4].text, 'x\ny');
  assert.equal(blocks[2].marker, '2.');
  assert.deepEqual(splitLinks('veja https://example.com/x. ok'), [
    { text: 'veja ' }, { text: 'https://example.com/x', link: true }, { text: '. ok' },
  ]);
});

test('conta caracteres e palavras', () => {
  assert.deepEqual(countText(''), { chars: 0, words: 0 });
  assert.deepEqual(countText('Olá, mundo!'), { chars: 11, words: 2 });
  // Emoji com tom de pele conta como 1 caractere; símbolos soltos não são palavras.
  assert.deepEqual(countText('Oi 👍🏽 — R$ 10,50'), { chars: 15, words: 3 });
});

test('normaliza telefones brasileiros', () => {
  const ok = (input) => normalizePhone(input).digits;
  assert.equal(ok('+55 (19) 99999-9999'), '5519999999999');
  assert.equal(ok('19999999999'), '5519999999999');
  assert.equal(ok('(19) 99999-9999'), '5519999999999');
  assert.equal(ok('19 9 9999 9999'), '5519999999999');
  assert.equal(ok('5519999999999'), '5519999999999');
  assert.equal(ok('0055 19 99999-9999'), '5519999999999');
  assert.equal(ok('(019) 99999-9999'), '5519999999999');
  assert.equal(ok('(19) 3333-4444'), '551933334444');
  assert.equal(ok('55 11 2345-6789'), '551123456789');
  // DDD 55 sem o código do país.
  assert.equal(ok('55 99999-9999'), '5555999999999');
  assert.equal(normalizePhone('(19) 99999-9999').type, 'celular');
  assert.equal(normalizePhone('(19) 3333-4444').type, 'fixo');
  assert.equal(normalizePhone('11999998888').formatted, '+55 (11) 99999-8888');
  assert.equal(normalizePhone('1133334444').formatted, '+55 (11) 3333-4444');
});

test('valida DDD e formato do número', () => {
  const expected = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74,
    75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99];
  assert.deepEqual([...VALID_DDDS].sort((a, b) => a - b), expected);
  for (const ddd of [10, 20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 60, 70, 72, 76, 78, 80, 90]) {
    const r = normalizePhone(`(${ddd}) 99999-9999`);
    assert.equal(r.ok, false, `DDD ${ddd}`);
    assert.match(r.error, /DDD/);
  }
  assert.match(normalizePhone('(19) 89999-9999').error, /começa com 9/);
  assert.match(normalizePhone('(19) 9999-9999').error, /8 dígitos/);
  assert.match(normalizePhone('(19) 6333-4444').error, /2, 3, 4 ou 5/);
  assert.match(normalizePhone('99999-9999').error, /DDD/);
  assert.match(normalizePhone('+55 19 99999-99999').error, /longo/);
  assert.match(normalizePhone('+1 415 555 0100').error, /Brasil/);
  assert.match(normalizePhone('abc').error, /números/);
  assert.match(normalizePhone('').error, /DDD/);
});

test('link wa.me com mensagem codificada', () => {
  assert.equal(buildWaLink('5519999999999'), 'https://wa.me/5519999999999');
  assert.equal(buildWaLink('5519999999999', '   '), 'https://wa.me/5519999999999');
  assert.equal(buildWaLink('5519999999999', 'Olá, João!'), 'https://wa.me/5519999999999?text=Ol%C3%A1%2C%20Jo%C3%A3o!');
  assert.equal(buildWaLink('5519999999999', 'Oi 😀'), 'https://wa.me/5519999999999?text=Oi%20%F0%9F%98%80');
  assert.equal(buildWaLink('5519999999999', 'linha 1\r\nlinha 2'), 'https://wa.me/5519999999999?text=linha%201%0Alinha%202');
  assert.equal(buildWaLink('5519999999999', 'a&b=c?#'), 'https://wa.me/5519999999999?text=a%26b%3Dc%3F%23');
  assert.equal(buildWaLink('5519999999999', '*negrito* _itálico_'), 'https://wa.me/5519999999999?text=*negrito*%20_it%C3%A1lico_');
  // Surrogate solto não derruba a codificação.
  assert.equal(buildWaLink('5519999999999', 'x\uD83D'), 'https://wa.me/5519999999999?text=x%EF%BF%BD');
});

test('barra de ferramentas: envolve a seleção', () => {
  const text = 'um dois três';
  assert.deepEqual(applyFormat(text, 3, 7, 'bold'), { start: 3, end: 7, insert: '**dois**', selStart: 5, selEnd: 9 });
  assert.equal(applyFormat(text, 3, 7, 'bold', 'whatsapp').insert, '*dois*');
  assert.equal(applyFormat(text, 3, 7, 'italic').insert, '_dois_');
  assert.equal(applyFormat(text, 3, 7, 'strike').insert, '~~dois~~');
  assert.equal(applyFormat(text, 3, 7, 'strike', 'whatsapp').insert, '~dois~');
  assert.equal(applyFormat(text, 3, 7, 'code').insert, '`dois`');
  // Espaços nas bordas ficam de fora.
  assert.deepEqual(applyFormat(text, 2, 8, 'bold'), { start: 3, end: 7, insert: '**dois**', selStart: 5, selEnd: 9 });
  // Sem seleção: insere um exemplo selecionado.
  assert.deepEqual(applyFormat('', 0, 0, 'bold'), { start: 0, end: 0, insert: '**negrito**', selStart: 2, selEnd: 9 });
  // Clicar de novo remove a formatação.
  assert.deepEqual(applyFormat('um **dois** três', 5, 9, 'bold'), { start: 3, end: 11, insert: 'dois', selStart: 3, selEnd: 7 });
  // Várias linhas: cada linha recebe a marcação.
  assert.equal(applyFormat('a\nb', 0, 3, 'bold').insert, '**a**\n**b**');
  assert.equal(applyFormat('a\nb', 0, 3, 'mono', 'whatsapp').insert, '```a\nb```');
  assert.equal(applyFormat('ver isto', 4, 8, 'mono').insert, '\n```\nisto\n```');
});

test('barra de ferramentas: listas e citação', () => {
  assert.deepEqual(applyFormat('a\nb', 0, 3, 'bullet'), { start: 0, end: 3, insert: '- a\n- b', selStart: 0, selEnd: 7 });
  assert.equal(applyFormat('- a\n- b', 0, 7, 'bullet').insert, 'a\nb');
  assert.equal(applyFormat('a\n\nb', 0, 4, 'numbered').insert, '1. a\n\n2. b');
  assert.equal(applyFormat('- a\n- b', 0, 7, 'numbered').insert, '1. a\n2. b');
  assert.equal(applyFormat('nota', 2, 2, 'quote').insert, '> nota');
  assert.equal(applyFormat('> nota', 0, 0, 'quote').insert, 'nota');
  // Cursor numa linha vazia: o marcador entra e o cursor fica depois dele.
  assert.deepEqual(applyFormat('x\n', 2, 2, 'bullet'), { start: 2, end: 2, insert: '- ', selStart: 4, selEnd: 4 });
});
