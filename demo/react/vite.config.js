import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const demoDir = resolve(import.meta.dirname)

export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            react: resolve(demoDir, 'node_modules/react'),
            'react-dom': resolve(demoDir, 'node_modules/react-dom'),
        },
    },
})
