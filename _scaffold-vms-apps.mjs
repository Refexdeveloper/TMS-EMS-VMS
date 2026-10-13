/**
 * One-shot scaffold: copy Lead_KF VMS pages into standalone Kissflow apps
 * under For_Murugesh_VMS, matching approvers/employee/expense layout.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'For_Murugesh_VMS')

const APPS = [
  { dir: 'VMS2.0', title: 'VMS 2.0', component: 'VMS2_0', importPath: './VMS2.0.jsx', entry: 'VMS2.0.jsx' },
  { dir: 'ContractsMyItems', title: 'Contracts My Items', component: 'ContractsMyItems', importPath: './ContractsMyItems.jsx', entry: 'ContractsMyItems.jsx' },
  { dir: 'ContractsMyItemsPro', title: 'Contracts My Items Pro', component: 'ContractsMyItemsPro', importPath: './ContractsMyItemsPro.jsx', entry: 'ContractsMyItemsPro.jsx' },
  { dir: 'VendorManagementSystem', title: 'Vendor Management System', component: 'VendorManagementSystem', importPath: './VendorManagementSystem.jsx', entry: 'VendorManagementSystem.jsx' },
  { dir: 'VendorMaster2', title: 'Vendor Master 2', component: 'VendorMaster2', importPath: './VendorMaster2.jsx', entry: 'VendorMaster2.jsx' },
]

const IMPORT_RE =
  /(?:import\s+(?:[\s\S]*?from\s+)?|export\s+[\s\S]*?from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g
const CSS_IMPORT_RE = /@import\s+['"](\.[^'"]+)['"]/g

function resolveLocal(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ]
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null
}

function collectFrom(entryRel) {
  const files = new Set()
  const queue = [path.join(SRC, entryRel)]
  while (queue.length) {
    const file = queue.pop()
    if (!file || files.has(file) || !fs.existsSync(file)) continue
    if (!file.startsWith(SRC)) continue
    files.add(file)
    const text = fs.readFileSync(file, 'utf8')
    const specs = []
    for (const re of [IMPORT_RE, CSS_IMPORT_RE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text))) specs.push(m[1])
    }
    for (const spec of specs) {
      const resolved = resolveLocal(file, spec)
      if (resolved) queue.push(resolved)
    }
  }
  return files
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function writeText(to, contents) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.writeFileSync(to, contents)
}

const PACKAGE_JSON = (name) => `{
    "name": "${name}",
    "private": true,
    "version": "0.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "zip": "node scripts/zip.js",
        "build": "vite build",
        "preview": "vite preview"
    },
    "dependencies": {
        "@kissflow/lowcode-client-sdk": "latest",
        "aos": "^2.3.4",
        "framer-motion": "^12.38.0",
        "react": "^18.2.0",
        "react-dom": "^18.2.0",
        "recharts": "^3.2.0"
    },
    "engines": {
        "node": "^18.0.0 || >=20.0.0"
    },
    "devDependencies": {
        "@tailwindcss/postcss": "^4.2.1",
        "@tailwindcss/vite": "^4.0.0",
        "@types/react": "^18.2.64",
        "@types/react-dom": "^18.2.21",
        "@vitejs/plugin-react": "^4.2.1",
        "archiver": "^7.0.1",
        "autoprefixer": "^10.4.27",
        "eslint": "^8.57.0",
        "eslint-plugin-react": "^7.34.0",
        "eslint-plugin-react-hooks": "^4.6.0",
        "eslint-plugin-react-refresh": "^0.4.5",
        "postcss": "^8.5.8",
        "tailwindcss": "^4.0.0",
        "vite": "^5.1.6"
    }
}
`

const VITE_CONFIG = `import { defineConfig } from 'vite'
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
`

const POSTCSS = `module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
`

const NPMRC = 'engine-strict=true\n'

const GITIGNORE = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

cert
node_modules
dist
dist-ssr
*.local
*.zip

.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`

const ZIP_JS = `import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

import archiver from 'archiver'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distPath = path.resolve(__dirname, '../dist')

const data = fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
const { name: packageName } = JSON.parse(data)
const zipFilePath = path.resolve(__dirname, \`../\${packageName}.zip\`)

if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath)
}

function removeDirSafe(targetPath, phase) {
    if (!fs.existsSync(targetPath)) return
    try {
        fs.rmSync(targetPath, {
            recursive: true,
            force: true,
            maxRetries: 6,
            retryDelay: 200,
        })
    } catch (err) {
        if (err?.code === 'EPERM' || err?.code === 'EBUSY') {
            console.warn(\`[zip] Skipping \${phase} cleanup: \${err.code} on \${targetPath}\`)
            return
        }
        throw err
    }
}
removeDirSafe(distPath, 'pre-build')

function buildProject() {
    execSync('npm run build', { stdio: 'inherit' })
}

async function zipDistFolder() {
    const output = fs.createWriteStream(zipFilePath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => {})
    archive.on('error', (err) => {
        throw err
    })
    archive.pipe(output)
    archive.directory(distPath, false)
    await archive.finalize()
}

buildProject()
await zipDistFolder()
removeDirSafe(distPath, 'post-zip')
`

function indexHtml(title) {
  return `<!doctype html>
<html lang="en" style="height:100%;width:100%;">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=5, user-scalable=yes" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet" />
        <title>${title}</title>
    </head>
    <body style="height:100%;width:100%;margin:0;">
        <div id="root" style="height:100%;min-height:100%;width:100%;background:#f3f8fb"></div>
        <script type="module" src="/src/main.jsx"></script>
    </body>
</html>
`
}

const MAIN_JSX = `import React from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import { SDKWrapper } from './sdk/index.js'

import './index.css'

const Root = createRoot(document.getElementById('root'))
Root.render(
    <SDKWrapper>
        <App />
    </SDKWrapper>
)
`

function appJsx(component, importPath) {
  return `import ${component} from '${importPath}'

function App() {
    return (
        <div className="rootDiv">
            <${component} />
        </div>
    )
}

export default App
`
}

function scaffold(app) {
  const dest = path.join(OUT, app.dir)
  fs.mkdirSync(dest, { recursive: true })

  const files = collectFrom(app.entry)
  for (const extra of ['index.css', 'sdk/index.js', 'sdk/wrapper.jsx', 'sdk/context.jsx', 'vms/tfx-kpi.css']) {
    const abs = path.join(SRC, extra)
    if (fs.existsSync(abs)) files.add(abs)
  }

  for (const file of files) {
    const rel = path.relative(SRC, file)
    copyFile(file, path.join(dest, 'src', rel))
  }

  writeText(path.join(dest, 'src/App.jsx'), appJsx(app.component, app.importPath))
  writeText(path.join(dest, 'src/main.jsx'), MAIN_JSX)
  writeText(path.join(dest, 'package.json'), PACKAGE_JSON(app.dir))
  writeText(path.join(dest, 'vite.config.js'), VITE_CONFIG)
  writeText(path.join(dest, 'postcss.config.cjs'), POSTCSS)
  writeText(path.join(dest, '.npmrc'), NPMRC)
  writeText(path.join(dest, '.gitignore'), GITIGNORE)
  writeText(path.join(dest, 'index.html'), indexHtml(app.title))
  writeText(path.join(dest, 'scripts/zip.js'), ZIP_JS)
  writeText(
    path.join(dest, 'public/manifest.json'),
    JSON.stringify({ Category: 'Page', Framework: 'React' }, null, 2) + '\n',
  )

  const favSrc = path.join(OUT, 'employee-dashboard-v2/public/favicon.svg')
  if (fs.existsSync(favSrc)) copyFile(favSrc, path.join(dest, 'public/favicon.svg'))

  for (const asset of ['vms-hero.jpg', 'refexone-logo.png']) {
    const from = path.join(ROOT, 'public/p2p', asset)
    if (fs.existsSync(from)) copyFile(from, path.join(dest, 'public/p2p', asset))
  }

  console.log(`${app.dir}: ${files.size} source files`)
}

for (const app of APPS) scaffold(app)
console.log('done')
