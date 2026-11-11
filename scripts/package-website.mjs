import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, basename, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'))

try {
  let installer = process.argv[2] ? resolve(process.argv[2]) : undefined
  if (!installer) {
    const bundleDirectory = join(root, 'apps/desktop/src-tauri/target/release/bundle/nsis')
    const entries = await readdir(bundleDirectory).catch((error) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const matches = entries.filter((name) => name.startsWith(`${config.productName}_${config.version}_`) && name.endsWith('-setup.exe'))
    if (matches.length !== 1) {
      throw new Error(matches.length === 0
        ? 'No installer found for the current version. Run pnpm build:installer first.'
        : 'Multiple installers found. Pass the desired installer: pnpm package:website "<installer path>".')
    }
    installer = join(bundleDirectory, matches[0])
  }

  if (!(await stat(installer)).isFile() || !installer.endsWith('.exe')) {
    throw new Error('The installer must be an existing .exe file.')
  }
  if (!process.env.npm_execpath) throw new Error('Run this script using pnpm package:website.')

  const filename = basename(installer)
  const result = spawnSync(process.execPath, [process.env.npm_execpath, '--filter', '@simple-copy/website', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_DOWNLOAD_URL: `/downloads/${encodeURIComponent(filename)}` },
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Website build failed (${result.status ?? result.signal}).`)

  const downloads = join(root, 'apps/website/dist/downloads')
  await mkdir(downloads, { recursive: true })
  await copyFile(installer, join(downloads, filename))
  const checksum = createHash('sha256').update(await readFile(join(downloads, filename))).digest('hex')
  await writeFile(join(downloads, filename + '.sha256'), `${checksum}  ${filename}\n`)
  console.log(`Website and Windows installer ready: ${join(root, 'apps/website/dist')}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
