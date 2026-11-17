import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Accept v1.2.3 or 1.2.3, including SemVer prereleases and build metadata.
const numeric = '(?:0|[1-9]\\d*)'
const identifier = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)'
const versionPattern = new RegExp(`^v?(${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$`)

export function releaseConfig(config, env) {
  const match = versionPattern.exec(env.GITHUB_REF_NAME ?? '')
  if (!match || match[0] !== env.GITHUB_REF_NAME) throw new Error('Release tags must be SemVer, for example v0.1.1 or v0.2.0-beta.1.')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be the GitHub owner/repository.')
  }
  const pubkey = env.TAURI_SIGNING_PUBLIC_KEY?.trim()
  if (!pubkey) throw new Error('Set the TAURI_SIGNING_PUBLIC_KEY repository variable before releasing.')
  if (!env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    throw new Error('Set the TAURI_SIGNING_PRIVATE_KEY repository secret before releasing.')
  }
  const version = match[1]
  return {
    config: {
      ...config,
      version,
      bundle: { ...config.bundle, createUpdaterArtifacts: true },
      plugins: {
        ...config.plugins,
        updater: {
          ...config.plugins?.updater,
          pubkey,
          endpoints: [`https://github.com/${env.GITHUB_REPOSITORY}/releases/latest/download/latest.json`],
        },
      },
    },
    prerelease: version.split('+')[0].includes('-'),
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const path = resolve(root, 'apps/desktop/src-tauri/tauri.conf.json')
  const prepared = releaseConfig(JSON.parse(await readFile(path, 'utf8')), process.env)
  // Tauri config owns the shipped version. Package/Cargo development versions stay unchanged.
  await writeFile(path, JSON.stringify(prepared.config, null, 2) + '\n')
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `prerelease=${prepared.prerelease}\n`)
  }
  console.log(`Prepared Windows release ${prepared.config.version}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
