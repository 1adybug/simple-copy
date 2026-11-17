import { createRequire } from "node:module"
import { readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

export function projectPath(root, path) {
  const target = resolve(root, path)
  const inside = relative(root, target)
  if (
    inside === ".." ||
    inside.startsWith("../") ||
    inside.startsWith("..\\") ||
    isAbsolute(inside)
  ) {
    throw new Error(`Path must stay within the project: ${path}`)
  }
  return target
}

export async function writableProjectPath(root, path) {
  const target = projectPath(root, path)
  const actualRoot = await realpath(root)
  let ancestor = target
  while (true) {
    try {
      const actualAncestor = await realpath(ancestor)
      projectPath(actualRoot, actualAncestor)
      return target
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      ancestor = parent
    }
  }
}

export function loadSharp(root) {
  const require = createRequire(resolve(root, "package.json"))
  try {
    return require("sharp")
  } catch (directError) {
    if (directError.code !== "MODULE_NOT_FOUND") throw directError
    try {
      const nextRequire = createRequire(require.resolve("next/package.json"))
      return nextRequire("sharp")
    } catch (nextError) {
      if (nextError.code !== "MODULE_NOT_FOUND") throw nextError
      throw new Error(
        `sharp was not found in ${root}. Use the project's installed dependency, add it through the project's package manager when authorized, or pass --sharp-from <directory>.`
      )
    }
  }
}

export async function readResource(url, localRoot, basePath = "/") {
  if (localRoot) {
    if (url.origin !== "https://pwa.local")
      throw new Error(
        `External resource cannot be checked in local-only mode: ${url}`
      )
    const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`
    if (!url.pathname.startsWith(prefix))
      throw new Error(
        `Resource is outside --base-path ${prefix}: ${url.pathname}`
      )
    const path = projectPath(
      localRoot,
      decodeURIComponent(url.pathname.slice(prefix.length))
    )
    return { bytes: await readFile(path), url, headers: null }
  }
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error(`Unsupported URL: ${url}`)
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    cache: "no-cache",
    credentials: "omit",
  })
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}: ${url}`)
  const chunks = []
  let length = 0
  for await (const chunk of response.body) {
    length += chunk.length
    if (length > 20 * 1024 * 1024)
      throw new Error(`Resource exceeds 20 MiB: ${url}`)
    chunks.push(chunk)
  }
  return {
    bytes: Buffer.concat(chunks),
    url: new URL(response.url),
    headers: response.headers,
    redirected: response.redirected,
  }
}

export function attributes(text) {
  const result = {}
  for (const item of text.matchAll(
    /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  )) {
    result[item[1].toLowerCase()] = item[2] ?? item[3] ?? item[4]
  }
  return result
}
