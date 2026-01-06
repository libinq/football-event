import QRCode from 'qrcode'

export async function generateQRCode(text, outPath) {
  await QRCode.toFile(outPath, text, {
    type: 'png',
    width: 512,
    color: { dark: '#000000', light: '#ffffff' }
  })
  return outPath
}

