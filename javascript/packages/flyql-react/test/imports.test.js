import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC_DIR = resolve(import.meta.dirname, '../src')

const editorContent = readFileSync(resolve(SRC_DIR, 'FlyqlEditor.jsx'), 'utf-8')
const columnsContent = readFileSync(resolve(SRC_DIR, 'FlyqlColumns.jsx'), 'utf-8')
const indexContent = readFileSync(resolve(SRC_DIR, 'index.js'), 'utf-8')

const ALLOWED_IMPORT = /from\s+'(react|react-dom|flyql\/editor|flyql\/core|\.\/[\w.-]+\.(jsx|js|css))'/

function importSpecifiers(content) {
    return [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
}

describe('flyql-react imports', () => {
    it('FlyqlEditor imports only react, flyql/editor, and local files', () => {
        for (const spec of importSpecifiers(editorContent)) {
            expect(`from '${spec}'`).toMatch(ALLOWED_IMPORT)
        }
    })

    it('FlyqlColumns imports only react, flyql/editor, and local files', () => {
        for (const spec of importSpecifiers(columnsContent)) {
            expect(`from '${spec}'`).toMatch(ALLOWED_IMPORT)
        }
    })

    it('has no vue imports anywhere', () => {
        for (const content of [editorContent, columnsContent, indexContent]) {
            expect(content).not.toMatch(/from\s+['"]vue['"]/)
            expect(content).not.toMatch(/from\s+['"]@vue\//)
        }
    })

    it('components import engines from flyql/editor', () => {
        expect(editorContent).toMatch(/import\s+\{[^}]*EditorEngine[^}]*\}\s+from\s+'flyql\/editor'/)
        expect(columnsContent).toMatch(/import\s+\{[^}]*ColumnsEngine[^}]*\}\s+from\s+'flyql\/editor'/)
    })

    it('barrel exports are complete', () => {
        expect(indexContent).toContain("export { FlyqlEditor } from './FlyqlEditor.jsx'")
        expect(indexContent).toContain("export { FlyqlColumns } from './FlyqlColumns.jsx'")
        expect(indexContent).toContain("export { EditorEngine, ColumnsEngine } from 'flyql/editor'")
        expect(indexContent).toContain("export { Column, ColumnSchema } from 'flyql/core'")
    })
})
