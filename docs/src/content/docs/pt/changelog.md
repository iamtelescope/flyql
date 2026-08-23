---
title: Registo de alterações
---

## 2026.08.23
Versão: **1.2.0**

Os componentes do editor passaram a aceitar um rótulo de texto ao lado do ícone existente, no espaço à esquerda do campo. Ver [Componente do editor](/pt/editor/).

Novas funcionalidades:

- **Prop `label` em `FlyqlEditor` e `FlyqlColumns`**, tanto no pacote Vue como no React. O rótulo é apresentado dentro do campo, antes do texto da consulta; um rótulo demasiado longo é truncado com reticências a metade da largura do campo em vez de comprimir a entrada. Clicar nele foca a entrada, e um rótulo de texto passa a ser o nome acessível da entrada. O Vue disponibiliza ainda um slot `label` para conteúdo mais rico.
- **`icon` é agora uma prop no Vue**, onde antes só existia como slot. Aceita uma string (apresentada como texto), um componente, ou `false` para remover o ícone incorporado; o slot `icon` continua a ter precedência sobre a prop. No React, a prop de render `icon` também aceita `false`.

Alterações de comportamento:

- **O ícone e o rótulo partilham um novo elemento flex de prefixo.** `.flyql-<root>__icon` deixou de ter posicionamento absoluto — passa a viver dentro de `.flyql-<root>__prefix`, e o padding esquerdo da entrada já não reserva espaço para ele. Folhas de estilo que posicionavam o ícone precisam de ser actualizadas; overrides que apenas redefinem variáveis `--flyql-*` não são afectados.
- **`--flyql-code-font-family` passa a usar uma pilha de tipos de letra real** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — em vez do simples `monospace`, que era resolvido para um tipo de letra diferente em cada navegador (Menlo no Chrome em macOS, Courier no Safari) e alterava as métricas com que o ícone e o rótulo se alinham. Defina a variável explicitamente para manter o comportamento anterior.
- **O ícone de lupa incorporado desceu uma unidade do viewBox**, para que o seu anel — e não o anel mais a pega — fique centrado no texto.

Novas variáveis de tema — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset` e `--flyql-label-offset` — controlam a cor do rótulo, a caixa de linha da entrada, o espaço entre ícone, rótulo e texto, e as duas correcções ópticas. Ver [Temas](/pt/editor/theming/).

## 2026.08.14
Versão: **1.1.1**

Correções de erros:

- **Comparações booleanas em caminhos JSON no gerador PostgreSQL.** Um literal booleano simples num caminho JSON (`jsonb_column.enabled = true`) caía na comparação de texto por omissão, gerando SQL inválido (`text = boolean`), enquanto um booleano entre aspas (`= 'true'`) era protegido por `jsonb_typeof = 'string'` e silenciosamente não correspondia a nada face a booleanos JSON. Os booleanos simples geram agora uma guarda `jsonb_typeof(...) = 'boolean'` com um cast `::boolean`, à semelhança do tratamento de números, em Go, Python e JavaScript.

## 2026.08.12
Versão: **1.1.0**

A allowlist `values` nas colunas é agora aplicada de forma consistente — e apenas onde faz sentido — nos geradores SQL, no matcher em memória e no validador. Consulte [Allowlist de Valores](/pt/syntax/values/#allowlist-de-valores) para a semântica completa.

Alterações de comportamento:

- **As listas `in` / `not in` são validadas contra a allowlist.** Cada elemento de lista numa coluna com allowlist é verificado durante a geração de SQL; um elemento fora da allowlist falha agora com `unknown value` em vez de corresponder silenciosamente a zero linhas. Elementos null e referências de coluna estão isentos. Consultas que anteriormente geravam SQL com elementos de lista com gralhas serão agora rejeitadas.
- **O matcher em memória aplica a allowlist.** Ao avaliar com um esquema cujas colunas declaram `values`, um valor `=` / `!=` ou elemento de lista `in` fora da allowlist lança `unknown value` (anteriormente avaliava silenciosamente, quebrando a paridade com os geradores). A avaliação sem esquema mantém-se inalterada.
- **Novo diagnóstico do validador `value_not_allowed`.** `diagnose()` emite agora um erro posicionado quando um valor de igualdade ou um elemento de lista in fica fora da allowlist da coluna. As pontes de esquema dialeto-para-núcleo (`ToFlyQLSchema` / `toFlyQLSchema`) transportam agora `values`, pelo que os esquemas convertidos participam no diagnóstico.

Para desativar a aplicação numa coluna, remova a sua lista `values` do esquema.

Correções de erros:

- **`= null` funciona em colunas com allowlist.** Null é um predicado de presença, não um valor de domínio: `col = null` / `col != null` numa coluna com uma allowlist `values` geram agora `IS NULL` / `IS NOT NULL` em vez de falharem com `unknown value`.
- **Os padrões deixaram de ser verificados contra a allowlist.** Padrões `like` / `ilike` / `~` / `!~` em colunas com allowlist geram normalmente; anteriormente, qualquer padrão que não estivesse literalmente presente na allowlist era rejeitado, tornando impossível a correspondência de padrões nessas colunas.
- **O gerador PostgreSQL de Go resolve referências de coluna no lado direito antes da verificação da allowlist.** `col = other_column` numa coluna com allowlist gera agora uma comparação coluna-a-coluna em todos os geradores; anteriormente, o gerador PostgreSQL de Go rejeitava-a com `unknown value`, enquanto ClickHouse e StarRocks a aceitavam.

Documentação:

- Nova secção [Allowlist de Valores](/pt/syntax/values/#allowlist-de-valores) e uma nota [NOT IN e o NULL do SQL](/pt/syntax/lists/#not-in-e-o-null-do-sql) sobre lógica de três valores, em todos os 11 idiomas.

## 2026.07.21
Versão: **1.0.2**

Correções de erros:

- **Offsets de caracteres consistentes para entrada não ASCII.** O parser percorre agora a entrada por code point Unicode nas três linguagens (Go percorre como `[]rune`, JavaScript como `Array.from(text)`), pelo que os offsets de `Range` avançam um passo por carácter, independentemente da largura em bytes ou em UTF-16. Anteriormente, caracteres cirílicos e outros caracteres multi-byte/astrais dessincronizavam os offsets entre os ports Go, JavaScript e Python.
- **Offsets de tokens em code points em `tokenize()`.** `tokenize()` reporta agora `start`/`end` como offsets em code points Unicode em todas as linguagens, idênticos entre Python, Go e JavaScript para qualquer entrada. Anteriormente, o Go emitia extensões de tokens em largura de bytes e o JavaScript emitia extensões em unidades de código UTF-16 para caracteres não ASCII (e astrais), quebrando a invariante de offsets sem lacunas.
- **Escape válido de strings em PostgreSQL.** O gerador PostgreSQL emite agora literais de string com escape (`E'...'`) para valores que contêm sequências de escape com barra invertida, como aspas ou novas linhas. Um literal simples `'...'` trata as barras invertidas literalmente sob `standard_conforming_strings` (a predefinição), o que podia produzir SQL inválido; os valores que não precisam de escaping continuam a ser renderizados como `'...'` simples.

## 2026.05.08
Versão: **1.0.0**

Lançamento público inicial.
