import { GoogleGenAI, Modality } from '@google/genai'
import { AI_COMPLIANCE_GUARDRAILS } from '@/lib/ai-guardrails'

export interface GenerateThumbnailParams {
  userPhotoBase64: string | null
  thumbnailBrief: string
  ideaTitle: string
  photoIsDefault: boolean
}

type InlineData = { mimeType: string; data: string }
type Part = { text?: string; inlineData?: InlineData }

export async function generateThumbnail(
  params: GenerateThumbnailParams,
): Promise<{ imageBase64: string } | { error: string }> {
  const { userPhotoBase64, thumbnailBrief, ideaTitle, photoIsDefault } = params

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { error: 'Gemini API key not configured.' }

  const useRealPhoto = userPhotoBase64 !== null && !photoIsDefault

  const photoInstructions = useRealPhoto
    ? `Image 1: A photo of the creator. Place this person prominently in the thumbnail — typically the right or center third of the frame. Show their face clearly with a strong emotion (surprise, focus, excitement) appropriate to the topic and brief.
Image 2: A stick figure illustration. IGNORE this image — only use it if the first image is unusable.`
    : `No creator photo is being used for this thumbnail. Design a bold text-and-graphic only thumbnail with:
- No people, no faces, no characters, no stick figures
- Strong typography as the hero element
- Bold background colors, shapes, icons, or graphic elements that match the video topic
- High contrast, punchy, mobile-readable
- Make it feel designed and intentional — like a professional motion graphics thumbnail
- Examples of what works: large numbers, bold statements, split color backgrounds, icons, arrows, data visuals`

  const prompt = `You are designing a high-converting YouTube thumbnail.

ASPECT RATIO: 16:9 LANDSCAPE (widescreen, 1280×720px). CRITICAL — The output image MUST be wider than it is tall. Compose everything for a widescreen canvas. All text, faces, and key elements must sit within the center 80% of a 16:9 frame. Do NOT compose for a square canvas.

VIDEO TITLE: "${ideaTitle}"

THUMBNAIL DIRECTION FROM CONTENT STRATEGIST:
${thumbnailBrief}

${photoInstructions}

DESIGN REQUIREMENTS:
- CRITICAL: This image will be cropped to 16:9 widescreen (1280×720px). Design for a 16:9 canvas. Place ALL important content — text, faces, numbers, key graphics — within the center 80% of the frame. Treat the outer 10% on all sides as bleed zone that may be cropped.
- Mentally draw a 16:9 rectangle as your canvas before composing. Everything that matters must be inside it. The composition should look complete and intentional within a widescreen frame — not a square frame.
- MUST be 16:9 landscape format (1280×720px) — wider than tall, never square
- Bold, high-contrast colors that pop on a phone screen at thumbnail size
- One clear focal point — the viewer's eye should immediately know where to look
- Any text on the thumbnail should be 4-6 words maximum, large and bold, readable at 200×113px preview size
- Mobile-first: assume viewers see this small first, full-size second
- Vibrant, intentional, professional — avoid generic stock-photo aesthetics
- Avoid: cluttered backgrounds, tiny text, weak contrast, distorted faces

OUTPUT: Generate one final YouTube thumbnail image matching the brief above.

${AI_COMPLIANCE_GUARDRAILS}`

  const parts: Part[] = []

  if (useRealPhoto && userPhotoBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: userPhotoBase64 } })
  }
  parts.push({ text: prompt })

  try {
    const ai = new GoogleGenAI({ apiKey })

    const generatePromise = ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: parts as never }],
      config: {
        responseModalities: [Modality.IMAGE],
      },
    })

    // 50s hard timeout — Fluid Compute allows 60s, leaving 10s for Supabase upload
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 50_000),
    )

    const response = await Promise.race([generatePromise, timeoutPromise])

    const responseParts: Part[] = (response.candidates?.[0]?.content?.parts as Part[]) ?? []
    const imagePart = responseParts.find((p) => p.inlineData?.data)

    if (!imagePart?.inlineData?.data) {
      console.error('[gemini-image] No image in response. Parts:', JSON.stringify(responseParts).slice(0, 200))
      return { error: 'Gemini returned no image — try again in a moment.' }
    }

    return { imageBase64: imagePart.inlineData.data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gemini-image] generateThumbnail error:', msg)
    if (msg.includes('timeout') || msg.includes('Gemini timeout')) {
      return { error: 'Thumbnail generation timed out. Please try again.' }
    }
    return { error: 'Sorry, thumbnail generation is temporarily unavailable. Please try again in a few minutes.' }
  }
}
