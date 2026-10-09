# Formatador para WhatsApp — escreva em Markdown e cole no WhatsApp já formatado (HTML + JS)

Quem escreve em Markdown (no GitHub, no Notion, em documentação) sabe que colar o texto no WhatsApp quebra a formatação: `**negrito**` aparece com asteriscos duplos e títulos com `#`. Este formatador converte o Markdown para a sintaxe do WhatsApp, mostra uma pré-visualização parecida com uma conversa e ainda gera links `wa.me` com a mensagem pronta. Também faz o caminho inverso: WhatsApp para Markdown.

**Acesse online:** https://micdog22.github.io/formatador-whatsapp/

## Recursos

- Editor com barra de ferramentas: negrito, itálico, tachado, monoespaçado, código, lista, lista numerada e citação (Ctrl+B e Ctrl+I também funcionam).
- Conversão Markdown → WhatsApp em tempo real, e WhatsApp → Markdown com um clique.
- Pré-visualização em forma de balão de conversa, no tema claro e no escuro.
- O que está dentro de código (`` `assim` `` ou em blocos ```` ``` ````) nunca é alterado.
- Contador de caracteres e palavras (emojis contam como um caractere).
- Gerador de link `wa.me`: aceita o telefone em vários formatos, valida DDD e número e inclui a mensagem do editor, se você quiser.
- Botões de copiar e o texto fica salvo no seu navegador.

## Como usar

1. Escreva ou cole o texto em Markdown no editor.
2. Confira a pré-visualização e clique em **Copiar**.
3. Cole na conversa do WhatsApp.

Para gerar um link, informe o telefone com DDD no formato que preferir: `(19) 99999-9999`, `19999999999`, `+55 19 99999-9999`. O link fica assim:

```
https://wa.me/5519999999999?text=Ol%C3%A1%2C%20tudo%20bem%3F
```

## Como cada formatação é convertida

| Markdown | WhatsApp |
| --- | --- |
| `**negrito**` ou `__negrito__` | `*negrito*` |
| `*itálico*` ou `_itálico_` | `_itálico_` |
| `~~tachado~~` | `~tachado~` |
| bloco de código com ```` ``` ```` | ```` ```monoespaçado``` ```` |
| `` `código` `` | `` `código` `` (igual) |
| `- item`, `* item` ou `+ item` | `- item` |
| `1. item` | `1. item` (igual) |
| `> citação` | `> citação` (igual) |
| `# Título` (qualquer nível) | `*Título*` |
| `[texto](https://example.com)` | `texto (https://example.com)` |

Formatações aninhadas também funcionam: `**negrito com _itálico_**` vira `*negrito com _itálico_*`. Endereços com sublinhados, como `https://example.com/a_b_c`, e palavras como `snake_case` ficam intactos.

## Validação do telefone

- O número precisa ter DDD. O código do país (+55) é opcional e entra no link automaticamente.
- DDDs aceitos: 11 a 19, 21, 22, 24, 27, 28, 31 a 35, 37, 38, 41 a 49, 51, 53 a 55, 61 a 69, 71, 73 a 75, 77, 79, 81 a 89 e 91 a 99.
- Celular: 9 dígitos começando com 9. Fixo: 8 dígitos começando com 2, 3, 4 ou 5.
- Por enquanto só números do Brasil são aceitos.

## Como rodar localmente

Módulos ES não carregam via `file://`, então sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`, com Node 18 ou mais recente). Os testes cobrem as conversões nos dois sentidos (aninhamento, formatações vizinhas, código, listas, citações e links), a validação de telefones, a codificação do link (acentos, emoji e quebras de linha) e a barra de ferramentas.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT — veja [LICENSE](LICENSE).

Projeto independente, sem vínculo com o WhatsApp ou a Meta.
