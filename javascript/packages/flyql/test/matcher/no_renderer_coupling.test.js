import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('matcher/renderer coupling', () => {
    it('matcher evaluator never mentions renderer', () => {
        const evaluatorPath = path.resolve(__dirname, '..', '..', 'src', 'matcher', 'evaluator.js')
        const source = fs.readFileSync(evaluatorPath, 'utf-8').toLowerCase()
        expect(source).not.toContain('renderer')
    })
})
