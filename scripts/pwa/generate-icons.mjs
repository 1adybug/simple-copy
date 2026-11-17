import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { resolve, relative } from "node:path"
import { parseArgs } from "node:util"
import { IOS_ICON_PATH } from "./lib/ios-mask.mjs"
import { loadSharp, writableProjectPath } from "./lib/runtime.mjs"

const { values } = parseArgs({
  options: {
    project: { type: "string", default: process.cwd() },
    source: { type: "string" },
    background: { type: "string" },
    output: { type: "string", default: "public/icons" },
    "url-prefix": { type: "string", default: "icons/" },
    "sharp-from": { type: "string" },
    "maskable-source": { type: "string" },
    "maskable-layout": { type: "string", default: "safe" },
    overwrite: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
})

if (values.help) {
  console.log(`Generate PWA icons from confirmed project artwork (Node.js 20+).
  --project <root>               Project root (default: current directory)
  --source <path>                Confirmed SVG/PNG/JPEG/WebP artwork
  --background <#RRGGBB>         Confirmed opaque background
  --output <path>                Output within project (default: public/icons)
  --url-prefix <prefix>          URLs relative to manifest, or app base (default: icons/)
  --maskable-source <path>       Optional dedicated maskable artwork
  --maskable-layout safe|full    Safe-circle placement (default) or reviewed full artwork
  --sharp-from <root>            Explicit existing dependency root
  --overwrite                   Replace the four known generated filenames
Writes PNGs only; prints manifest entries as JSON. It does not edit project configuration.`)
  process.exit(0)
}

try {
  if (!values.source || !/^#[\da-f]{6}$/i.test(values.background ?? ""))
    throw new Error(
      "--source and --background '#RRGGBB' are required after branding confirmation."
    )
  if (!["safe", "full"].includes(values["maskable-layout"]))
    throw new Error("--maskable-layout must be safe or full.")
  if (
    /[?#]/.test(values["url-prefix"]) ||
    /^(?:https?:)?\/\//i.test(values["url-prefix"])
  )
    throw new Error(
      "--url-prefix must be an application path without query or fragment."
    )
  const root = resolve(values.project)
  const output = await writableProjectPath(root, values.output)
  const sourcePath = resolve(root, values.source)
  const maskableSourcePath = resolve(
    root,
    values["maskable-source"] ?? values.source
  )
  const sharp = loadSharp(resolve(values["sharp-from"] ?? root))
  const filenames = [
    "pwa-192x192.png",
    "pwa-512x512.png",
    "pwa-maskable-512x512.png",
    "apple-touch-icon.png",
  ]
  for (const name of filenames) {
    const destination = await writableProjectPath(root, resolve(output, name))
    if ([sourcePath, maskableSourcePath].includes(destination))
      throw new Error("Output would overwrite source artwork.")
    if (
      !values.overwrite &&
      (await stat(destination).then(
        () => true,
        (error) => {
          if (error.code === "ENOENT") return false
          throw error
        }
      ))
    )
      throw new Error(
        `${destination} exists; review it and pass --overwrite to regenerate.`
      )
  }
  async function source(path) {
    const bytes = await readFile(path)
    if (bytes.length > 20 * 1024 * 1024)
      throw new Error(`Source exceeds 20 MiB: ${path}`)
    const metadata = await sharp(bytes, {
      limitInputPixels: 40_000_000,
    }).metadata()
    if (!["svg", "png", "jpeg", "webp"].includes(metadata.format))
      throw new Error(`Unsupported artwork format: ${metadata.format}`)
    const density =
      metadata.format === "svg"
        ? Math.min(
            100000,
            Math.ceil(
              72 * Math.max(1, 512 / Math.max(metadata.width, metadata.height))
            )
          )
        : 72
    return { bytes, density }
  }
  const artwork = await source(sourcePath)
  const maskable =
    sourcePath === maskableSourcePath
      ? artwork
      : await source(maskableSourcePath)
  const background = values.background
  const render = (input, size) =>
    sharp(input.bytes, { density: input.density, limitInputPixels: 40_000_000 })
      .resize(size, size, { fit: "contain", background })
      .flatten({ background })
      .png()
      .toBuffer()
  const images = new Map()
  for (const size of [192, 512]) {
    const square = await render(artwork, size)
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1 1"><path fill="white" d="${IOS_ICON_PATH}"/></svg>`
    )
    images.set(
      `pwa-${size}x${size}.png`,
      await sharp(square)
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer()
    )
  }
  if (values["maskable-layout"] === "full") {
    images.set("pwa-maskable-512x512.png", await render(maskable, 512))
  } else {
    const innerSize = 2 * Math.floor((512 * 0.8) / Math.SQRT2 / 2)
    const inner = await render(maskable, innerSize)
    images.set(
      "pwa-maskable-512x512.png",
      await sharp({
        create: { width: 512, height: 512, channels: 4, background },
      })
        .composite([
          {
            input: inner,
            left: Math.floor((512 - innerSize) / 2),
            top: Math.floor((512 - innerSize) / 2),
          },
        ])
        .png()
        .toBuffer()
    )
  }
  images.set("apple-touch-icon.png", await render(artwork, 180))
  await mkdir(output, { recursive: true })
  for (const [name, bytes] of images)
    await writeFile(resolve(output, name), bytes)
  const prefix = values["url-prefix"]
    ? values["url-prefix"].replace(/\/?$/, "/")
    : ""
  console.log(
    JSON.stringify(
      {
        output: relative(root, output),
        files: [...images].map(([name, bytes]) => ({
          name,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        })),
        icons: [
          {
            src: `${prefix}pwa-192x192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${prefix}pwa-512x512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${prefix}pwa-maskable-512x512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        appleTouchIcon: `${prefix}apple-touch-icon.png`,
        maskableLayout: values["maskable-layout"],
        needsVisualSafeZoneReview: values["maskable-layout"] === "full",
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }))
  process.exitCode = 1
}
