import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const jsDir = resolve(import.meta.dirname)

export default defineConfig({
    plugins: [vue()],
    root: resolve(jsDir, '../demo'),
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            vue: resolve(jsDir, 'node_modules/vue'),
        },
    },
})
