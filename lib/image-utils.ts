import sharp from 'sharp'

export async function padToSixteenNine(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata()
    const width = metadata.width ?? 1024
    const height = metadata.height ?? 1024

    let finalWidth: number
    let finalHeight: number
    let padLeft: number
    let padTop: number

    if (width / height < 16 / 9) {
      // Image is taller than 16:9 — add horizontal padding
      finalWidth = Math.round(height * (16 / 9))
      finalHeight = height
      padLeft = Math.round((finalWidth - width) / 2)
      padTop = 0
    } else {
      // Image is already 16:9 or wider — add vertical padding
      finalWidth = width
      finalHeight = Math.round(width * (9 / 16))
      padLeft = 0
      padTop = Math.round((finalHeight - height) / 2)
    }

    // Sample the first pixel of the left and right edges; flatten removes alpha
    // so raw() always gives 3-byte RGB triplets
    const leftEdge = await sharp(imageBuffer)
      .extract({ left: 0, top: 0, width: 1, height })
      .flatten()
      .raw()
      .toBuffer()

    const rightEdge = await sharp(imageBuffer)
      .extract({ left: width - 1, top: 0, width: 1, height })
      .flatten()
      .raw()
      .toBuffer()

    const r = Math.round((leftEdge[0] + rightEdge[0]) / 2)
    const g = Math.round((leftEdge[1] + rightEdge[1]) / 2)
    const b = Math.round((leftEdge[2] + rightEdge[2]) / 2)

    const padded = await sharp(imageBuffer)
      .extend({
        top: padTop,
        bottom: padTop,
        left: padLeft,
        right: padLeft,
        background: { r, g, b, alpha: 1 },
      })
      .png()
      .toBuffer()

    console.log(
      `[image-utils] padToSixteenNine: ${width}×${height} → ${finalWidth}×${finalHeight}`,
    )
    return padded
  } catch (err) {
    console.error('[image-utils] padToSixteenNine failed — returning original buffer:', err)
    return imageBuffer
  }
}
