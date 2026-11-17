import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseConfig } from './prepare-release.mjs'

const env = {
  GITHUB_REF_NAME: 'v1.2.3', GITHUB_REPOSITORY: 'example/simple-copy',
  TAURI_SIGNING_PUBLIC_KEY: 'test-public-key', TAURI_SIGNING_PRIVATE_KEY: 'test-private-key',
}
const base = { version: '0.1.0', bundle: { targets: ['nsis'], windows: { nsis: { installMode: 'currentUser' } } }, plugins: { updater: { windows: { installMode: 'passive' } } } }

test('the tag owns the shipped version and endpoint follows the repository', () => {
  const original = structuredClone(base)
  const result = releaseConfig(base, env)
  assert.equal(result.config.version, '1.2.3')
  assert.equal(result.prerelease, false)
  assert.equal(result.config.bundle.createUpdaterArtifacts, true)
  assert.deepEqual(result.config.bundle.windows, base.bundle.windows)
  assert.deepEqual(result.config.plugins.updater.windows, { installMode: 'passive' })
  assert.deepEqual(result.config.plugins.updater.endpoints, ['https://github.com/example/simple-copy/releases/latest/download/latest.json'])
  assert.equal(result.config.plugins.updater.pubkey, env.TAURI_SIGNING_PUBLIC_KEY)
  assert.ok(!JSON.stringify(result).includes(env.TAURI_SIGNING_PRIVATE_KEY))
  assert.deepEqual(base, original)
})

test('stable, prerelease and metadata tags are classified correctly', () => {
  for (const [tag, version, prerelease] of [
    ['0.1.0', '0.1.0', false], ['v0.2.0-beta.1', '0.2.0-beta.1', true],
    ['v1.0.0+build-1', '1.0.0+build-1', false], ['v1.0.0-rc.1+build.5', '1.0.0-rc.1+build.5', true],
  ]) {
    const result = releaseConfig(base, { ...env, GITHUB_REF_NAME: tag })
    assert.equal(result.config.version, version)
    assert.equal(result.prerelease, prerelease)
  }
})

test('malformed versions and missing signing inputs fail before building', () => {
  for (const tag of ['', 'release', 'v01.0.0', 'v1.2', 'v1.2.3-01', 'v1.2.3;echo secret', 'v1.2.3\n']) {
    assert.throws(() => releaseConfig(base, { ...env, GITHUB_REF_NAME: tag }))
  }
  for (const key of ['GITHUB_REPOSITORY', 'TAURI_SIGNING_PUBLIC_KEY', 'TAURI_SIGNING_PRIVATE_KEY']) {
    assert.throws(() => releaseConfig(base, { ...env, [key]: '' }))
  }
  assert.throws(() => releaseConfig(base, { ...env, GITHUB_REPOSITORY: 'https://github.com/example/repo' }))
})
