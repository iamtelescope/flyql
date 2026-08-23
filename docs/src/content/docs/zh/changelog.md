---
title: 更新日志
---

## 2026.08.23
版本：**1.2.0**

编辑器组件新增了与图标并列的文本标签，位于字段左侧。参见[编辑器组件](/zh/editor/)。

新功能：

- **`FlyqlEditor` 与 `FlyqlColumns` 的 `label` 属性**，Vue 与 React 两个包均支持。标签渲染在字段内、查询文本之前；过长的标签会在字段宽度一半处以省略号截断，而不会挤压输入框。点击标签会聚焦输入框，文本标签同时成为输入框的可访问名称。Vue 还提供 `label` 插槽以放置更丰富的内容。
- **Vue 中 `icon` 现在是属性**，此前仅有插槽。它接受字符串（按文本渲染）、组件，或 `false` 以移除内置图标；`icon` 插槽仍优先于属性。React 中现有的 `icon` 渲染属性同样接受 `false`。

行为变更：

- **图标与标签共用新的 flex 前缀元素。** `.flyql-<root>__icon` 不再使用绝对定位，而是位于 `.flyql-<root>__prefix` 内，输入框的左内边距也不再为其预留空间。自行定位该图标的样式表需要更新；仅重新映射 `--flyql-*` 变量的覆盖不受影响。
- **`--flyql-code-font-family` 的默认值改为真实字体栈** —— `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`，取代原先的裸 `monospace`。后者在各浏览器中解析为不同字体（macOS 上 Chrome 为 Menlo，Safari 为 Courier），从而改变图标与标签对齐所依据的度量。如需保持旧行为，请显式设置该变量。
- **内置放大镜图标在 viewBox 中下移了一个单位**，使其圆环（而非圆环加手柄）相对文本居中。

新增主题变量 —— `--flyql-label-color`、`--flyql-line-height`、`--flyql-prefix-gap`、`--flyql-icon-offset` 与 `--flyql-label-offset` —— 分别控制标签颜色、输入行框、图标/标签/文本之间的间距，以及两处视觉对齐微调。参见[主题](/zh/editor/theming/)。

## 2026.08.14
版本：**1.1.1**

Bug 修复：

- **PostgreSQL 生成器中 JSON 路径上的布尔比较。** JSON 路径上的裸布尔字面量（`jsonb_column.enabled = true`）会落入默认的文本比较，生成无效的 SQL（`text = boolean`）；而带引号的布尔值（`= 'true'`）由 `jsonb_typeof = 'string'` 守护，针对 JSON 布尔值会悄悄地匹配不到任何内容。裸布尔值现在会生成 `jsonb_typeof(...) = 'boolean'` 守护并附带 `::boolean` 转换，与数字的处理方式一致，覆盖 Go、Python 和 JavaScript。

## 2026.08.12
版本：**1.1.0**

列上的 `values` 允许列表现在在 SQL 生成器、内存中的 matcher 和验证器之间得到一致的强制执行——并且只在合理的地方执行。完整语义参见[值允许列表](/zh/syntax/values/#值允许列表)。

行为变更：

- **`in` / `not in` 列表会针对允许列表进行验证。** 声明了允许列表的列上的每个列表元素都会在 SQL 生成期间被检查；不在允许列表中的元素现在会以 `unknown value` 失败，而不是悄悄地匹配零行。空值元素和列引用被豁免。此前带有拼写错误的列表元素也能生成 SQL 的查询现在会被拒绝。
- **内存中的 matcher 强制执行允许列表。** 当使用列声明了 `values` 的模式进行求值时，不在允许列表中的 `=` / `!=` 值或 `in` 列表元素会抛出 `unknown value`（此前它会静默求值，与生成器形成破坏一致性的对比）。无模式求值不受影响。
- **新的验证器诊断 `value_not_allowed`。** 当相等性值或 in 列表元素落在列的允许列表之外时，`diagnose()` 现在会发出带位置信息的错误。方言到核心模式的桥接（`ToFlyQLSchema` / `toFlyQLSchema`）现在会携带 `values`，因此桥接后的模式也参与该诊断。

要为某一列停用强制执行，从模式中移除它的 `values` 列表即可。

Bug 修复：

- **`= null` 在声明了允许列表的列上可用。** 空值是存在性谓词，不是域值：在具有 `values` 允许列表的列上，`col = null` / `col != null` 现在生成 `IS NULL` / `IS NOT NULL`，而不是以 `unknown value` 失败。
- **模式不再针对允许列表检查。** 声明了允许列表的列上的 `like` / `ilike` / `~` / `!~` 模式正常生成；此前任何未逐字出现在允许列表中的模式都会被拒绝，使得这类列上的模式匹配无法进行。
- **Go PostgreSQL 生成器在允许列表检查之前解析右侧列引用。** 声明了允许列表的列上的 `col = other_column` 现在在所有生成器上都生成列与列的比较；此前 Go PostgreSQL 生成器会以 `unknown value` 拒绝它，而 ClickHouse 和 StarRocks 则接受。

文档：

- 新增[值允许列表](/zh/syntax/values/#值允许列表)一节，以及关于三值逻辑的 [NOT IN 与 SQL NULL](/zh/syntax/lists/#not-in-与-sql-null) 说明，覆盖全部 11 个语言版本。

## 2026.07.21
版本：**1.0.2**

Bug 修复：

- **非 ASCII 输入的字符偏移量保持一致。** 解析器现在在全部三种语言中都按 Unicode 码点扫描输入（Go 以 `[]rune` 扫描，JavaScript 以 `Array.from(text)` 扫描），因此 `Range` 偏移量按每个字符前进一步，与字节宽度或 UTF-16 宽度无关。此前西里尔字母等多字节/辅助平面字符会使 Go、JavaScript 与 Python 移植版之间的偏移量失去同步。
- **`tokenize()` 的码点级 token 偏移量。** `tokenize()` 现在在每种语言中都以 Unicode 码点偏移量报告 `start`/`end`，对所有输入在 Python、Go 和 JavaScript 之间完全一致。此前对于非 ASCII（以及辅助平面）字符，Go 输出字节宽度的 token 区间，JavaScript 输出 UTF-16 码元宽度的区间，破坏了无间隙偏移量不变式。
- **有效的 PostgreSQL 字符串转义。** PostgreSQL 生成器现在对包含引号或换行符等反斜杠转义的值输出转义字符串字面量（`E'...'`）。在 `standard_conforming_strings`（默认设置）下，普通的 `'...'` 字面量会把反斜杠当作字面字符处理，可能产生无效的 SQL；无需转义的值仍渲染为普通的 `'...'`。

## 2026.05.08
版本：**1.0.0**

首次公开发布。
