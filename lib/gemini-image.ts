import { GoogleGenAI, Modality } from '@google/genai'

export interface GenerateThumbnailParams {
  userPhotoBase64: string | null
  stickFigureBase64: string
  thumbnailBrief: string
  ideaTitle: string
  photoIsDefault: boolean
}

type InlineData = { mimeType: string; data: string }
type Part = { text?: string; inlineData?: InlineData }

export async function generateThumbnail(
  params: GenerateThumbnailParams,
): Promise<{ imageBase64: string } | { error: string }> {
  const { userPhotoBase64, stickFigureBase64, thumbnailBrief, ideaTitle, photoIsDefault } = params

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { error: 'Gemini API key not configured.' }

  const useRealPhoto = userPhotoBase64 !== null && !photoIsDefault

  const photoInstructions = useRealPhoto
    ? `Image 1: A photo of the creator. Place this person prominently in the thumbnail — typically the right or center third of the frame. Show their face clearly with a strong emotion (surprise, focus, excitement) appropriate to the topic and brief.
Image 2: A stick figure illustration. IGNORE this image — only use it if the first image is unusable.`
    : `Image 1: A stick figure illustration. This IS your character for the thumbnail — keep it as a stick figure. Do NOT replace it with a realistic human or AI-generated person. Do NOT make it photorealistic.
Instead:
- Keep the stick figure style exactly as shown
- Give it a strong pose and facial expression that matches the video topic and brief (shocked, excited, pointing, thinking etc.)
- Make it bold, large, and expressive — big eyes, clear emotion, dynamic pose
- Place it prominently in the thumbnail composition
- The stick figure should feel like a fun intentional design choice, not a placeholder
- Style the rest of the thumbnail (background, text, colors, graphics) to complement the stick figure aesthetic`

  const prompt = `You are designing a high-converting YouTube thumbnail.

ASPECT RATIO: 16:9 LANDSCAPE (widescreen). The output image MUST be wider than it is tall — like a widescreen TV or YouTube video frame. Do NOT generate a square image. Do NOT generate a portrait image.

VIDEO TITLE: "${ideaTitle}"

THUMBNAIL DIRECTION FROM CONTENT STRATEGIST:
${thumbnailBrief}

REFERENCE IMAGES PROVIDED:
${photoInstructions}

DESIGN REQUIREMENTS:
- MUST be 16:9 landscape format (1280×720px) — wider than tall, never square
- Bold, high-contrast colors that pop on a phone screen at thumbnail size
- One clear focal point — the viewer's eye should immediately know where to look
- Any text on the thumbnail should be 4-6 words maximum, large and bold, readable at 200×113px preview size
- Mobile-first: assume viewers see this small first, full-size second
- Vibrant, intentional, professional — avoid generic stock-photo aesthetics
- Avoid: cluttered backgrounds, tiny text, weak contrast, distorted faces

OUTPUT: Generate one final YouTube thumbnail image matching the brief above.`

  const parts: Part[] = []

  if (useRealPhoto && userPhotoBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: userPhotoBase64 } })
    parts.push({ inlineData: { mimeType: 'image/png', data: stickFigureBase64 } })
  } else {
    parts.push({ inlineData: { mimeType: 'image/png', data: stickFigureBase64 } })
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
