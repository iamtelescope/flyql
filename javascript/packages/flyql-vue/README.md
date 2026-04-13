# flyql-vue

Vue 3 editor components for [FlyQL](https://docs.flyql.dev) — a schema-driven query input with autocomplete, syntax highlighting, and keyboard navigation, plus a dedicated columns expression editor.

## Installation

```bash
npm install flyql-vue
# or
pnpm add flyql-vue
```

`flyql-vue` depends on the [`flyql`](https://www.npmjs.com/package/flyql) core package and is automatically installed alongside it. Vue 3 is required as a peer dependency:

```bash
npm install vue
```

Requires Node.js 16+.

## Quick Start

### Query editor

```vue
<script setup>
import { ref } from 'vue'
import { FlyqlEditor, ColumnSchema } from 'flyql-vue'
import 'flyql-vue/flyql.css'

const query = ref('')
const columns = ColumnSchema.fromPlainObject({
    status: { type: 'number', suggest: true },
    level: { type: 'enum', suggest: true, autocomplete: true, values: ['debug', 'info', 'error'] },
    service: { type: 'string', suggest: true, autocomplete: true },
    host: { type: 'string', suggest: true },
})

function onSubmit() {
    console.log('Query:', query.value)
}
</script>

<template>
    <FlyqlEditor
        v-model="query"
        :columns="columns"
        placeholder="Type a FlyQL query..."
        @submit="onSubmit"
    />
</template>
```

### Columns expression editor

```vue
<script setup>
import { ref } from 'vue'
import { FlyqlColumns, ColumnSchema } from 'flyql-vue'
import 'flyql-vue/flyql.css'

const expr = ref('')
const columns = ColumnSchema.fromPlainObject({
    message: { type: 'string', suggest: true },
    status: { type: 'number', suggest: true },
    host: { type: 'string', suggest: true },
})
</script>

<template>
    <FlyqlColumns
        v-model="expr"
        :columns="columns"
        :capabilities="{ transformers: true }"
        placeholder="message, status|upper, host as h"
    />
</template>
```

## What's in the box

| Export | Description |
|---|---|
| `FlyqlEditor` | Vue 3 query editor component with autocomplete and syntax highlighting |
| `FlyqlColumns` | Vue 3 column expression editor component |
| `EditorEngine` | Framework-agnostic editor engine (no Vue dependency) |
| `ColumnsEngine` | Framework-agnostic columns engine (no Vue dependency) |
| `ColumnSchema`, `Column` | Schema helpers (re-exported from `flyql/core`) |
| `flyql-vue/flyql.css` | Theme variables, suggestion panel styles, and token highlighting |

## Theming

The editor uses CSS custom properties (`--flyql-*` variables) for all visual styling. A built-in `dark` prop toggles the dark theme, and any variable can be overridden in your CSS to match your application's design.

```html
<FlyqlEditor v-model="query" :columns="columns" :dark="isDark" />
```

See the [theming documentation](https://docs.flyql.dev/editor/theming/) for the full list of variables and customization patterns.

## Documentation

Full reference: [docs.flyql.dev/editor](https://docs.flyql.dev/editor/)

- [Editor Component](https://docs.flyql.dev/editor/) — props, events, exposed methods, async autocomplete, keyboard shortcuts
- [Columns Component](https://docs.flyql.dev/editor/columns-component/) — column expression editor
- [Schema Configuration](https://docs.flyql.dev/editor/schema/) — `ColumnSchema` structure, nested columns, remote key discovery
- [Theming](https://docs.flyql.dev/editor/theming/) — CSS variables and dark mode

## License

MIT
