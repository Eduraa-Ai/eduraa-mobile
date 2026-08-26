const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const repoRoot = path.resolve(__dirname, '../../../..')
const QRCode = require(path.join(repoRoot, 'node_modules/qrcode-terminal/vendor/QRCode'))
const QRErrorCorrectLevel = require(
  path.join(repoRoot, 'node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel'),
)

const value = process.argv[2]
const outputBaseArg = process.argv[3]

if (!value || !outputBaseArg) {
  console.error('Usage: node render-qr.cjs <exp-url> <output-base>')
  process.exit(2)
}

if (!/^exp:\/\/[^\s]+$/i.test(value)) {
  console.error('The QR value must be a single exp:// URL printed by Metro.')
  process.exit(2)
}

const outputBase = path.resolve(outputBaseArg.replace(/\.(png|svg)$/i, ''))
const pngPath = `${outputBase}.png`
const svgPath = `${outputBase}.svg`
const quietZone = 4
const moduleSize = 12
const dark = [7, 21, 45]
const light = [255, 255, 255]

const qr = new QRCode(-1, QRErrorCorrectLevel.M)
qr.addData(value)
qr.make()

const moduleCount = qr.getModuleCount()
const imageSize = (moduleCount + quietZone * 2) * moduleSize
const isDarkPixel = (x, y) => {
  const column = Math.floor(x / moduleSize) - quietZone
  const row = Math.floor(y / moduleSize) - quietZone
  return (
    row >= 0 &&
    row < moduleCount &&
    column >= 0 &&
    column < moduleCount &&
    qr.isDark(row, column)
  )
}

const svgSquares = []
for (let row = 0; row < moduleCount; row += 1) {
  for (let column = 0; column < moduleCount; column += 1) {
    if (!qr.isDark(row, column)) continue
    svgSquares.push(
      `<rect x="${(column + quietZone) * moduleSize}" y="${(row + quietZone) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`,
    )
  }
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize}" viewBox="0 0 ${imageSize} ${imageSize}" role="img" aria-label="Expo Go QR code for Eduraa Mobile">`,
  '<rect width="100%" height="100%" fill="#FFFFFF"/>',
  '<g fill="#07152D">',
  ...svgSquares,
  '</g>',
  '</svg>',
  '',
].join('\n')

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

const crc32 = (buffer) => {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, checksum])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(imageSize, 0)
ihdr.writeUInt32BE(imageSize, 4)
ihdr[8] = 8
ihdr[9] = 2

const rowLength = 1 + imageSize * 3
const pixels = Buffer.alloc(rowLength * imageSize)
for (let y = 0; y < imageSize; y += 1) {
  const rowOffset = y * rowLength
  pixels[rowOffset] = 0
  for (let x = 0; x < imageSize; x += 1) {
    const color = isDarkPixel(x, y) ? dark : light
    const pixelOffset = rowOffset + 1 + x * 3
    pixels[pixelOffset] = color[0]
    pixels[pixelOffset + 1] = color[1]
    pixels[pixelOffset + 2] = color[2]
  }
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(pixels, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

fs.mkdirSync(path.dirname(outputBase), { recursive: true })
fs.writeFileSync(svgPath, svg, 'utf8')
fs.writeFileSync(pngPath, png)

console.log(JSON.stringify({ url: value, png: pngPath, svg: svgPath }, null, 2))
