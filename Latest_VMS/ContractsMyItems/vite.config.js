import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const cert = path.resolve('./cert/localhost.crt')
const key = path.resolve('./cert/localhost.key')
const https = existsSync(cert) && existsSync(key) ? { cert, key } : undefined

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        {
            name: 'emit-manifest-vite-plugin',
            writeBundle() {
                writeFileSync(
                    resolve(__dirname, 'dist/manifest.json'),
                    JSON.stringify({ Category: 'Page', Framework: 'React' }, null, 2),
                )
            },
        },
    ],
    base: '',
    build: {
        target: 'es2022',
    },
    server: {
        https,
        host: '0.0.0.0',
    },
})
