# flyql-react

React editor components for [FlyQL](https://docs.flyql.dev) — a schema-driven query input with autocomplete, syntax highlighting, and keyboard navigation, plus a dedicated columns expression editor.

## Installation

```bash
npm install flyql-react
# or
pnpm add flyql-react
```

`flyql-react` depends on the [`flyql`](https://www.npmjs.com/package/flyql) core package and is automatically installed alongside it. React 18 or 19 is required as a peer dependency:

```bash
npm install react react-dom
```

Requires Node.js 18+.

> `flyql-react` ships untranspiled JSX sources (mirroring `flyql-vue`, which ships raw `.vue` SFCs). Vite handles this out of the box; with webpack/Babel setups, make sure your JSX transform also covers `node_modules/flyql-react` (it is excluded by default).

## Quick Start

### Query editor

```jsx
import { useState } from 'react'
import { FlyqlEditor, ColumnSchema } from 'flyql-react'
import 'flyql-react/flyql.css'

const columns = ColumnSchema.fromPlainObject({
    status: { type: 'number', suggest: true },
    level: { type: 'enum', suggest: true, autocomplete: true, values: ['debug', 'info', 'error'] },
    service: { type: 'string', suggest: true, autocomplete: true },
    host: { type: 'string', suggest: true },
})

function App() {
    const [query, setQuery] = useState('')

    return (
        <FlyqlEditor
            value={query}
            onChange={setQuery}
            columns={columns}
            placeholder="Type a FlyQL query..."
            onSubmit={() => console.log('Query:', query)}
        />
    )
}
```

### Columns expression editor

```jsx
import { useState } from 'react'
import { FlyqlColumns, ColumnSchema } from 'flyql-react'
import 'flyql-react/flyql.css'

const columns = ColumnSchema.fromPlainObject({
    message: { type: 'string', suggest: true },
    status: { type: 'number', suggest: true },
    host: { type: 'string', suggest: true },
})

function App() {
    const [expr, setExpr] = useState('')

    return (
        <FlyqlColumns
            value={expr}
            onChange={setExpr}
            columns={columns}
            capabilities={{ transformers: true }}
            placeholder="message, status|upper, host as h"
        />
    )
}
```

## What's in the box

| Export | Description |
|---|---|
| `FlyqlEditor` | React query editor component with autocomplete and syntax highlighting |
| `FlyqlColumns` | React column expression editor component |
| `EditorEngine` | Framework-agnostic editor engine (re-exported from `flyql/editor`) |
| `ColumnsEngine` | Framework-agnostic columns engine (re-exported from `flyql/editor`) |
| `ColumnSchema`, `Column` | Schema helpers (re-exported from `flyql/core`) |
| `flyql-react/flyql.css` | Theme variables, suggestion panel styles, and token highlighting |

## Component API

`FlyqlEditor` props: `value`, `onChange`, `columns`, `parameters`, `onAutocomplete`, `onKeyDiscovery`, `placeholder`, `autofocus`, `debug`, `debounceMs` (default 150), `dark`, `registry`, `label`, plus callbacks `onSubmit`, `onParseError`, `onFocus`, `onBlur`, `onDiagnostics` and an `icon` render prop. A `ref` exposes `focus()`, `blur()`, `getQueryStatus()`, and `flushDiagnostics()`.

`FlyqlColumns` props: `value`, `onChange`, `columns`, `capabilities`, `onKeyDiscovery`, `placeholder`, `autofocus`, `debug`, `dark`, `registry`, `rendererRegistry`, `label`, `icon`, plus callbacks `onSubmit`, `onParseError`, `onParsedChange`, `onFocus`, `onBlur`, `onDiagnostics` and a `loading` render prop. A `ref` additionally exposes `getParsedColumns()`.

`label` and `icon` share the slot on the left of the field, ahead of the query text. `label` takes a string or any node; `icon` takes a node, a render function, or `false` to drop the built-in glyph. Clicking either focuses the input, and a text `label` becomes the input's accessible name. The label renders in the UI font (`--flyql-font-family`), baseline-corrected to sit on the query text's baseline.

```jsx
<FlyqlEditor value={query} onChange={setQuery} label="Filter" icon={false} />
```

> `capabilities` is read once when the component mounts (it configures the underlying engine's parser; the same is true of the Vue component). To change capabilities at runtime, remount the component with a `key`.

## Theming

The editor uses CSS custom properties (`--flyql-*` variables) for all visual styling. A built-in `dark` prop toggles the dark theme, and any variable can be overridden in your CSS to match your application's design.

```jsx
<FlyqlEditor value={query} onChange={setQuery} columns={columns} dark={isDark} />
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
