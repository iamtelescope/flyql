import { describe, it, expect } from 'vitest'
import { Renderer, RendererRegistry, ArgSpec, defaultRegistry } from '../../src/renderers/index.js'
import { Type } from '../../src/flyql_type.js'

class PlainRenderer extends Renderer {
    get name() {
        return 'plain'
    }
}

class HrefRenderer extends Renderer {
    get name() {
        return 'href'
    }
    get argSchema() {
        return [new ArgSpec(Type.String, true)]
    }
}

describe('RendererRegistry', () => {
    it('defaultRegistry is empty', () => {
        const reg = defaultRegistry()
        expect(reg.names()).toEqual([])
    })

    it('register + get', () => {
        const reg = new RendererRegistry()
        reg.register(new PlainRenderer())
        expect(reg.get('plain')).not.toBeNull()
        expect(reg.get('missing')).toBeNull()
    })

    it('duplicate register throws', () => {
        const reg = new RendererRegistry()
        reg.register(new PlainRenderer())
        expect(() => reg.register(new PlainRenderer())).toThrow()
    })

    it('names returns all registered', () => {
        const reg = new RendererRegistry()
        reg.register(new PlainRenderer())
        reg.register(new HrefRenderer())
        expect(new Set(reg.names())).toEqual(new Set(['plain', 'href']))
    })

    it('setDiagnose stores hook', () => {
        const reg = new RendererRegistry()
        expect(reg.getDiagnose()).toBeNull()
        const hook = () => []
        reg.setDiagnose(hook)
        expect(reg.getDiagnose()).toBe(hook)
    })

    it('renderer defaults: metadata is empty and diagnose returns []', () => {
        const r = new PlainRenderer()
        expect(r.metadata).toEqual({})
        expect(r.diagnose([], {})).toEqual([])
    })
})
