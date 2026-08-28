import sharp from 'sharp'
import fs from 'node:fs/promises'

/* The mark: a khata page seen edge-on — the red margin rule every Indian
   ledger has, three written lines, and the last one climbing. No gradients,
   no gloss; it should read at 48px on a cracked screen in sunlight. */

const ink = '#0E3D33'
const page = '#F4F2ED'
const rule = '#A32233'
const green = '#0E5E4E'

const mark = (size, pad) => {
  const s = size
  const p = pad
  const w = s - p * 2
  const x = p
  const y = p
  const marginX = x + w * 0.26
  const line = (i, len, color, thick) => {
    const ly = y + w * (0.3 + i * 0.185)
    return `<rect x="${marginX + w * 0.08}" y="${ly}" width="${w * len}" height="${w * thick}" rx="${w * thick / 2}" fill="${color}"/>`
  }
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${w * 0.17}" fill="${page}"/>
    <rect x="${marginX}" y="${y + w * 0.12}" width="${w * 0.022}" height="${w * 0.76}" rx="${w * 0.011}" fill="${rule}"/>
    ${line(0, 0.42, ink, 0.055)}
    ${line(1, 0.30, ink, 0.055)}
    ${line(2, 0.52, green, 0.075)}
  `
}

const svg = (size, bg, pad) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
     ${bg ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${green}"/>` : ''}
     ${mark(size, pad)}
   </svg>`

// Adaptive foreground: the mark sits inside the safe circle, on transparency.
const fg = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
     ${mark(size, size * 0.30)}
   </svg>`

const png = (markup, size) => sharp(Buffer.from(markup)).resize(size, size).png().toBuffer()

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const root = 'android/app/src/main/res'

await fs.mkdir('public', { recursive: true })
await fs.writeFile('public/icon.svg', svg(512, true, 512 * 0.19))
await fs.writeFile('public/favicon.png', await png(svg(512, true, 512 * 0.19), 64))

try {
  await fs.access('android')
  for (const [d, px] of Object.entries(DENSITIES)) {
    const dir = `${root}/mipmap-${d}`
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(`${dir}/ic_launcher.png`, await png(svg(px * 4, true, px * 4 * 0.19), px))
    await fs.writeFile(`${dir}/ic_launcher_round.png`, await png(svg(px * 4, true, px * 4 * 0.19), px))
    await fs.writeFile(`${dir}/ic_launcher_foreground.png`, await png(fg(px * 4 * 1.5), Math.round(px * 1.5)))
  }
  await fs.mkdir(`${root}/values`, { recursive: true })
  await fs.writeFile(`${root}/values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${green}</color>\n</resources>\n`)
  await fs.mkdir(`${root}/drawable`, { recursive: true })
  await fs.writeFile(`${root}/drawable/splash_logo.png`, await png(svg(1024, true, 1024 * 0.19), 512))
  console.log('icons written into android/')
} catch {
  console.log('icons written into public/ (no android/ yet)')
}
