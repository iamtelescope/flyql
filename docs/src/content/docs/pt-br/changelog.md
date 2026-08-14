---
title: Registro de mudanças
---

## 2026.08.14
Versão: **1.1.1**

Correções de bugs:

- **Comparações booleanas em caminhos JSON no gerador PostgreSQL.** Um literal booleano sem aspas em um caminho JSON (`jsonb_column.enabled = true`) caía na comparação de texto padrão, gerando SQL inválido (`text = boolean`), enquanto um booleano entre aspas (`= 'true'`) era protegido por `jsonb_typeof = 'string'` e silenciosamente não correspondia a nada contra booleanos JSON. Booleanos sem aspas agora geram uma guarda `jsonb_typeof(...) = 'boolean'` com um cast `::boolean`, espelhando o tratamento de números, em Go, Python e JavaScript.

## 2026.08.12
Versão: **1.1.0**

A allowlist `values` em colunas agora é aplicada de forma consistente — e apenas onde faz sentido — nos geradores SQL, no matcher em memória e no validador. Veja [Allowlist de Valores](/pt-br/syntax/values/#allowlist-de-valores) para a semântica completa.

Mudanças de comportamento:

- **Listas `in` / `not in` são validadas contra a allowlist.** Cada elemento de lista em uma coluna com allowlist é verificado durante a geração do SQL; um elemento fora da allowlist agora falha com `unknown value` em vez de corresponder silenciosamente a zero linhas. Elementos null e referências de coluna são isentos. Consultas que antes geravam SQL com elementos de lista digitados incorretamente agora serão rejeitadas.
- **O matcher em memória aplica a allowlist.** Ao avaliar com um esquema cujas colunas declaram `values`, um valor `=` / `!=` ou elemento de lista `in` fora da allowlist lança `unknown value` (antes a avaliação ocorria silenciosamente, quebrando a paridade com os geradores). A avaliação sem esquema não muda.
- **Novo diagnóstico do validador `value_not_allowed`.** `diagnose()` agora emite um erro posicionado quando um valor de igualdade ou elemento de lista in fica fora da allowlist da coluna. As pontes de esquema dialeto-para-core (`ToFlyQLSchema` / `toFlyQLSchema`) agora carregam `values`, então os esquemas convertidos por elas participam do diagnóstico.

Para desativar a aplicação em uma coluna, remova sua lista `values` do esquema.

Correções de bugs:

- **`= null` funciona em colunas com allowlist.** Null é um predicado de presença, não um valor de domínio: `col = null` / `col != null` em uma coluna com allowlist `values` agora geram `IS NULL` / `IS NOT NULL` em vez de falhar com `unknown value`.
- **Padrões não são mais verificados contra a allowlist.** Padrões `like` / `ilike` / `~` / `!~` em colunas com allowlist geram normalmente; antes, qualquer padrão que não estivesse literalmente presente na allowlist era rejeitado, tornando impossível a correspondência de padrões nessas colunas.
- **O gerador PostgreSQL em Go resolve referências de coluna do lado direito antes da verificação da allowlist.** `col = other_column` em uma coluna com allowlist agora gera uma comparação coluna-com-coluna em todos os geradores; antes, o gerador PostgreSQL em Go a rejeitava com `unknown value`, enquanto ClickHouse e StarRocks a aceitavam.

Documentação:

- Nova seção [Allowlist de Valores](/pt-br/syntax/values/#allowlist-de-valores) e uma nota [NOT IN e SQL NULL](/pt-br/syntax/lists/#not-in-e-sql-null) sobre lógica de três valores, em todos os 11 idiomas.

## 2026.07.21
Versão: **1.0.2**

Correções de bugs:

- **Offsets de caracteres consistentes para entrada não ASCII.** O parser agora percorre a entrada por code point Unicode nas três linguagens (Go percorre como `[]rune`, JavaScript como `Array.from(text)`), então os offsets de `Range` avançam um passo por caractere, independentemente da largura em bytes ou UTF-16. Antes, caracteres cirílicos e outros caracteres multi-byte/astrais dessincronizavam os offsets entre os ports em Go, JavaScript e Python.
- **Offsets de token em code points em `tokenize()`.** `tokenize()` agora reporta `start`/`end` como offsets de code points Unicode em todas as linguagens, idênticos em Python, Go e JavaScript para qualquer entrada. Antes, Go emitia spans de token com largura em bytes e JavaScript emitia spans em unidades de código UTF-16 para caracteres não ASCII (e astrais), quebrando a invariante de offsets sem lacunas.
- **Escape válido de strings no PostgreSQL.** O gerador PostgreSQL agora emite literais escape-string (`E'...'`) para valores que contêm escapes de barra invertida, como aspas ou quebras de linha. Um literal simples `'...'` trata barras invertidas literalmente sob `standard_conforming_strings` (o padrão), o que podia produzir SQL inválido; valores que não precisam de escape continuam sendo renderizados como `'...'` simples.

## 2026.05.08
Versão: **1.0.0**

Lançamento público inicial.
