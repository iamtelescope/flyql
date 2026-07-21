import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const demoDir = resolve(import.meta.dirname)

export default defineConfig({
    plugins: [vue(), tailwindcss()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            vue: resolve(demoDir, 'node_modules/vue'),
        },
    },
})
