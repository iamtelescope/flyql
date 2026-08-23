---
title: Registro de cambios
---

## 2026.08.23
Versión: **1.2.0**

Los componentes del editor ahora admiten una etiqueta de texto junto al icono existente, en el espacio a la izquierda del campo. Consulta [Componente del editor](/es/editor/#etiqueta-e-icono).

Nuevas funcionalidades:

- **Prop `label` en `FlyqlEditor` y `FlyqlColumns`**, tanto en el paquete de Vue como en el de React. La etiqueta se renderiza dentro del campo, delante del texto de la consulta; una etiqueta demasiado larga se trunca con puntos suspensivos a la mitad del ancho del campo en lugar de comprimir la entrada. Al hacer clic en ella se enfoca la entrada, y una etiqueta de texto pasa a ser el nombre accesible de la entrada. Vue expone además un slot `label` para contenido más rico.
- **`icon` ahora es una prop en Vue**, donde antes solo existía como slot. Acepta una cadena (renderizada como texto), un componente o `false` para eliminar el icono integrado; el slot `icon` sigue teniendo prioridad sobre la prop. En React, la prop de render `icon` también acepta `false`.

Cambios de comportamiento:

- **El icono y la etiqueta comparten un nuevo elemento flex de prefijo.** `.flyql-<root>__icon` ya no está posicionado de forma absoluta: vive dentro de `.flyql-<root>__prefix`, y el relleno izquierdo de la entrada ya no reserva espacio para él. Las hojas de estilo que posicionaban el icono por su cuenta deben actualizarse; las que solo redefinen variables `--flyql-*` no se ven afectadas.
- **`--flyql-code-font-family` ahora usa una pila de fuentes real** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — en lugar de `monospace` a secas, que se resolvía a una fuente distinta en cada navegador (Menlo en Chrome en macOS, Courier en Safari) y cambiaba las métricas con las que se alinean el icono y la etiqueta. Define la variable explícitamente para conservar el comportamiento anterior.
- **El icono integrado de lupa se desplazó una unidad del viewBox hacia abajo** para que su aro, y no el aro más el mango, quede centrado sobre el texto.

Nuevas variables de tema — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset` y `--flyql-label-offset` — controlan el color de la etiqueta, la caja de línea de la entrada, el espacio entre icono, etiqueta y texto, y los dos ajustes ópticos. Consulta [Temas](/es/editor/theming/).

## 2026.08.14
Versión: **1.1.1**

Correcciones de errores:

- **Comparaciones booleanas sobre rutas JSON en el generador de PostgreSQL.** Un literal booleano sin comillas sobre una ruta JSON (`jsonb_column.enabled = true`) caía en la comparación de texto por defecto, generando SQL inválido (`text = boolean`), mientras que un booleano entre comillas (`= 'true'`) quedaba protegido por `jsonb_typeof = 'string'` y silenciosamente no coincidía con ningún booleano JSON. Los booleanos sin comillas ahora generan una guarda `jsonb_typeof(...) = 'boolean'` con un cast `::boolean`, reflejando el manejo de números, en Go, Python y JavaScript.

## 2026.08.12
Versión: **1.1.0**

La lista de valores permitidos `values` de las columnas ahora se aplica de forma consistente — y solo donde tiene sentido — en los generadores SQL, el matcher en memoria y el validador. Consulta [Lista de valores permitidos](/es/syntax/values/#lista-de-valores-permitidos) para la semántica completa.

Cambios de comportamiento:

- **Las listas `in` / `not in` se validan contra la lista de valores permitidos.** Cada elemento de la lista en una columna con lista de valores permitidos se comprueba durante la generación de SQL; un elemento fuera de la lista ahora falla con `unknown value` en lugar de coincidir silenciosamente con cero filas. Los elementos null y las referencias a columna están exentos. Las consultas que antes generaban SQL con elementos de lista con erratas ahora serán rechazadas.
- **El matcher en memoria aplica la lista de valores permitidos.** Al evaluar con un schema cuyas columnas declaran `values`, un valor `=` / `!=` o un elemento de lista `in` fuera de la lista permitida lanza `unknown value` (antes se evaluaba silenciosamente, rompiendo la paridad con los generadores). La evaluación sin schema no cambia.
- **Nuevo diagnóstico del validador `value_not_allowed`.** `diagnose()` ahora emite un error posicionado cuando un valor de igualdad o un elemento de una lista `in` queda fuera de la lista de valores permitidos de la columna. Los puentes de schema de dialecto a core (`ToFlyQLSchema` / `toFlyQLSchema`) ahora transportan `values`, por lo que los schemas puenteados participan en el diagnóstico.

Para desactivar la comprobación en una columna, elimina su lista `values` del schema.

Correcciones de errores:

- **`= null` funciona en columnas con lista de valores permitidos.** Null es un predicado de presencia, no un valor de dominio: `col = null` / `col != null` en una columna con lista de valores permitidos `values` ahora generan `IS NULL` / `IS NOT NULL` en lugar de fallar con `unknown value`.
- **Los patrones ya no se comprueban contra la lista de valores permitidos.** Los patrones `like` / `ilike` / `~` / `!~` en columnas con lista de valores permitidos se generan con normalidad; antes, cualquier patrón que no estuviera literalmente presente en la lista era rechazado, lo que hacía imposible el emparejamiento de patrones en esas columnas.
- **El generador de PostgreSQL en Go resuelve las referencias a columna del lado derecho antes de la comprobación de la lista de valores permitidos.** `col = other_column` en una columna con lista de valores permitidos ahora genera una comparación columna a columna en todos los generadores; antes, el generador de PostgreSQL en Go lo rechazaba con `unknown value` mientras que ClickHouse y StarRocks lo aceptaban.

Documentación:

- Nueva sección [Lista de valores permitidos](/es/syntax/values/#lista-de-valores-permitidos) y una nota [NOT IN y NULL de SQL](/es/syntax/lists/#not-in-y-null-de-sql) sobre la lógica de tres valores, en los 11 idiomas.

## 2026.07.21
Versión: **1.0.2**

Correcciones de errores:

- **Offsets de caracteres consistentes para entrada no ASCII.** El parser ahora recorre la entrada por punto de código Unicode en los tres lenguajes (Go la recorre como `[]rune`, JavaScript como `Array.from(text)`), por lo que los offsets de `Range` avanzan un paso por carácter independientemente del ancho en bytes o UTF-16. Antes, el cirílico y otros caracteres multibyte/astrales desincronizaban los offsets entre los ports de Go, JavaScript y Python.
- **Offsets de tokens por punto de código en `tokenize()`.** `tokenize()` ahora reporta `start`/`end` como offsets de puntos de código Unicode en todos los lenguajes, idénticos entre Python, Go y JavaScript para cualquier entrada. Antes, Go emitía spans de tokens en ancho de bytes y JavaScript emitía spans en unidades de código UTF-16 para caracteres no ASCII (y astrales), rompiendo la invariante de offsets sin huecos.
- **Escapado de strings válido para PostgreSQL.** El generador de PostgreSQL ahora emite literales de string con escape (`E'...'`) para los valores que contienen secuencias de escape con barra invertida, como comillas o saltos de línea. Un literal simple `'...'` trata las barras invertidas literalmente bajo `standard_conforming_strings` (el valor por defecto), lo que podía producir SQL inválido; los valores que no necesitan escapado se siguen renderizando como `'...'` simples.

## 2026.05.08
Versión: **1.0.0**

Lanzamiento público inicial.
