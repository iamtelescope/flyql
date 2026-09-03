---
title: Registro de mudanças
---

## 2026.08.25
Versão: **1.4.0**

Controle sobre onde o painel de sugestões fica na página, para editores embutidos dentro de uma sobreposição do anfitrião.

Novos recursos:

- **`--flyql-panel-z-index`** (padrão `100`). A posição de empilhamento do painel era um literal, então um anfitrião cuja sobreposição ficava acima só podia resolver a colisão escrevendo uma regra sobre `.flyql-panel`. Drawers e modais costumam ficar bem acima de 100, o que escondia o painel por completo enquanto o editor continuava funcionando.
- **Prop `panelContainer` em `FlyqlEditor` e `FlyqlColumns`** (padrão `body`), nos dois pacotes. Aceita um seletor ou um elemento; o painel passa a ser portado para lá em vez de `document.body` e herda o contexto de empilhamento dele, sem aritmética de z-index. Um destino que não puder ser resolvido cai de volta em `body`, e o destino é resolvido novamente sempre que o painel abre, então uma sobreposição montada depois do editor também funciona.
- **Atributo `data-flyql-panel`** no nó portado, para que anfitriões que fecham a sobreposição em clique externo reconheçam o painel sem depender de um nome de classe interno. Com `panelContainer` definido, o painel é descendente da sobreposição e a verificação deixa de ser necessária.

Nada muda para os usuários atuais: o painel continua sendo portado para `document.body` e continua empilhado em 100.

## 2026.08.25
Versão: **1.3.0**

Pontos de integração para embutir os editores em um design system anfitrião: um modo de uma linha, um botão de limpar e as medidas de caixa que antes estavam fixas no código.

Novos recursos:

- **Prop `multiline` em `FlyqlEditor` e `FlyqlColumns`** (padrão `true`), nos dois pacotes. Com `false` o campo permanece em uma linha: Shift+Enter não insere mais quebra, as quebras vindas de colagem, arrastar ou IME viram espaços, e consultas longas rolam na horizontal em vez de quebrar.
- **Props `hasClear` e `clearButtonLabel`** (padrão `false` e `'Clear'`). Um botão de limpar na extremidade final, visível apenas quando o campo tem valor. Clicar esvazia o campo pelo caminho normal de alteração — o painel de sugestões fecha e os diagnósticos somem como em uma exclusão manual — e devolve o foco à entrada.
- **Novas variáveis de tema** `--flyql-border-radius`, `--flyql-padding-block`, `--flyql-label-font-weight` e `--flyql-border-hover`, para o raio dos cantos, o espaçamento vertical, o peso do rótulo e a borda ao passar o mouse. Todas mantêm os valores atuais, então nada muda até o anfitrião defini-las. Veja [Temas](/pt-br/editor/theming/).

Correções de bugs:

- **O espaço inicial não some mais ao rolar.** Ele ficava no `padding-inline-start` da entrada, e o espaçamento de uma caixa com rolagem horizontal só existe na posição 0, então uma consulta rolada passava por baixo do rótulo. Ambos os espaços horizontais agora ficam em `.flyql-<root>__container`, que não rola.
- **A camada de destaque não fica mais um pixel atrás do cursor na rolagem máxima.** Um `width: 100%` anulava seu deslocamento `right` — em uma caixa posicionada de forma absoluta, `width` vence `right` — deixando as duas camadas de texto com amplitudes diferentes.
- **`Home` e `End` movem a visão, não só o cursor.** Ambos definem a seleção depois de `preventDefault()`, o que suprime a rolagem automática do navegador; em uma consulta rolável o cursor saía da tela e a tecla parecia não fazer nada.

Documentação:

- O evento `submit` e a tabela de teclado diziam Shift+Enter; os componentes sempre o emitiram em Ctrl/Cmd+Enter. Corrigido nos 11 idiomas, documentando também o comportamento real de Shift+Enter.

Anfitriões que sobrescrevem diretamente o espaçamento de `.flyql-<root>__input` devem revisá-lo: o resultado é o mesmo, mas o espaçamento horizontal passou para o contêiner.

## 2026.08.23
Versão: **1.2.0**

Os componentes do editor passaram a aceitar um rótulo de texto ao lado do ícone existente, no espaço à esquerda do campo. Veja [Componente do editor](/pt-br/editor/).

Novos recursos:

- **Prop `label` em `FlyqlEditor` e `FlyqlColumns`**, tanto no pacote Vue quanto no React. O rótulo é renderizado dentro do campo, antes do texto da consulta; um rótulo muito longo é truncado com reticências na metade da largura do campo em vez de espremer a entrada. Clicar nele foca a entrada, e um rótulo de texto passa a ser o nome acessível da entrada. O Vue também expõe um slot `label` para conteúdo mais rico.
- **`icon` agora é uma prop no Vue**, onde antes existia apenas como slot. Aceita uma string (renderizada como texto), um componente, ou `false` para remover o ícone embutido; o slot `icon` continua tendo precedência sobre a prop. No React, a prop de render `icon` também aceita `false`.

Mudanças de comportamento:

- **O ícone e o rótulo compartilham um novo elemento flex de prefixo.** `.flyql-<root>__icon` não é mais posicionado de forma absoluta — ele fica dentro de `.flyql-<root>__prefix`, e o padding esquerdo da entrada não reserva mais espaço para ele. Folhas de estilo que posicionavam o ícone precisam ser atualizadas; overrides que apenas redefinem variáveis `--flyql-*` não são afetados.
- **`--flyql-code-font-family` agora usa uma pilha de fontes real** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — em vez do simples `monospace`, que era resolvido para uma fonte diferente em cada navegador (Menlo no Chrome no macOS, Courier no Safari) e mudava as métricas com as quais o ícone e o rótulo se alinham. Defina a variável explicitamente para manter o comportamento anterior.
- **O ícone de lupa embutido desceu uma unidade do viewBox**, para que seu anel — e não o anel mais o cabo — fique centralizado no texto.

Novas variáveis de tema — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset` e `--flyql-label-offset` — controlam a cor do rótulo, a caixa de linha da entrada, o espaço entre ícone, rótulo e texto, e as duas correções ópticas. Veja [Temas](/pt-br/editor/theming/).

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
