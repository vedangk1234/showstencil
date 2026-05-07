'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type ModalStep =
  | 'choose_source'
  | 'camera'
  | 'upload'
  | 'google_profile'
  | 'no_photo'
  | 'generating'
  | 'completed'
  | 'failed'

interface ThumbnailGenerationModalProps {
  isOpen: boolean
  onClose: () => void
  ideaId: string
  ideaTitle: string
  thumbnailBrief: string
  googleProfilePhotoUrl: string | null
  onSuccess: (ideaId: string, thumbnailUrl: string) => void
}

function isDefaultGoogleAvatar(url: string): boolean {
  return url.includes('default-user') || (url.includes('=s96-c') && !url.includes('/a/ACg'))
}

async function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const maxSize = 1024
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not available')); return }
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

// ─── Loading stage indicator ──────────────────────────────────────────────────

function GeneratingStages({ elapsedSeconds }: { elapsedSeconds: number }) {
  const stageIndex = elapsedSeconds < 5 ? 0 : elapsedSeconds < 20 ? 1 : 2
  const stages = [
    'Sending photo to Gemini',
    'Generating image (this takes 15–25 seconds)',
    'Saving',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
      {stages.map((label, i) => {
        const active = i === stageIndex
        const done = i < stageIndex
        return (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px', borderRadius: 6,
            background: active ? '#0d1f0d' : '#0a0a0a',
            border: `1px solid ${active ? '#1d5e3a' : '#1a1a1a'}`,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: done ? '#4ade80' : active ? '#4ade80' : '#222222',
              flexShrink: 0,
              animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 12, color: done ? '#4ade80' : active ? '#ffffff' : '#333333' }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ThumbnailGenerationModal({
  isOpen,
  onClose,
  ideaId,
  ideaTitle,
  thumbnailBrief,
  googleProfilePhotoUrl,
  onSuccess,
}: ThumbnailGenerationModalProps) {
  const [step, setStep] = useState<ModalStep>('choose_source')
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [failError, setFailError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [timedOut, setTimedOut] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Prevent ExpandableCard's document-level mousedown from closing while this modal is open
  useEffect(() => {
    if (!isOpen) return
    const stopProp = (e: MouseEvent) => e.stopPropagation()
    document.addEventListener('mousedown', stopProp, { capture: true })
    return () => document.removeEventListener('mousedown', stopProp, { capture: true })
  }, [isOpen])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('choose_source')
      setCapturedPhoto(null)
      setUploadedPhoto(null)
      setCameraError(null)
      setFileError(null)
      setJobId(null)
      setGeneratedUrl(null)
      setFailError(null)
      setElapsedSeconds(0)
      setTimedOut(false)
    } else {
      stopCamera()
      clearPolling()
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const clearPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null }
  }, [])

  const handleClose = useCallback(() => {
    stopCamera()
    clearPolling()
    onClose()
  }, [stopCamera, clearPolling, onClose])

  // ── Camera ────────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1024 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setCameraError('Camera access denied. Try uploading a photo instead.')
    }
  }, [])

  useEffect(() => {
    if (step === 'camera' && !capturedPhoto) {
      void startCamera()
    }
    if (step !== 'camera') {
      stopCamera()
    }
  }, [step, capturedPhoto, startCamera, stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
    setCapturedPhoto(base64)
    stopCamera()
  }, [stopCamera])

  const retakeCamera = useCallback(() => {
    setCapturedPhoto(null)
    void startCamera()
  }, [startCamera])

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setFileError('Please upload a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError('Photo must be under 5MB. Try a smaller image.')
      return
    }

    try {
      const base64 = await resizeImageToBase64(file)
      setUploadedPhoto(base64)
    } catch {
      setFileError('Failed to process image. Try a different file.')
    }
  }, [])

  // ── Generation ────────────────────────────────────────────────────────────

  const startGeneration = useCallback(async (source: 'camera' | 'upload' | 'google_profile' | 'no_photo', photoBase64?: string) => {
    setStep('generating')
    setElapsedSeconds(0)
    setTimedOut(false)

    // Elapsed timer
    elapsedRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)

    try {
      const body: { photo_source: string; photo_data?: string } = { photo_source: source }
      if (photoBase64) body.photo_data = photoBase64

      const res = await fetch(`/api/ideas/${ideaId}/generate-thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json() as Record<string, unknown>

      if (!res.ok) {
        clearPolling()
        setFailError((data.error as string) ?? 'Generation failed. Please try again.')
        setStep('failed')
        return
      }

      if (data.cached && data.thumbnail_url) {
        clearPolling()
        setGeneratedUrl(data.thumbnail_url as string)
        setStep('completed')
        onSuccess(ideaId, data.thumbnail_url as string)
        return
      }

      const jId = data.job_id as string
      setJobId(jId)

      // Poll every 2s
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/thumbnail-jobs/${jId}/status`)
          const statusData = await statusRes.json() as { status: string; thumbnail_url?: string; error_message?: string }

          if (statusData.status === 'completed' && statusData.thumbnail_url) {
            clearPolling()
            setGeneratedUrl(statusData.thumbnail_url)
            setStep('completed')
            onSuccess(ideaId, statusData.thumbnail_url)
          } else if (statusData.status === 'failed') {
            clearPolling()
            setFailError(
              statusData.error_message ??
              'Sorry, thumbnail generation is temporarily unavailable. Please try again in a few minutes.',
            )
            setStep('failed')
          }
        } catch {
          // Network error during polling — keep polling
        }
      }, 2000)

    } catch {
      clearPolling()
      setFailError('Network error — please check your connection and try again.')
      setStep('failed')
    }
  }, [ideaId, clearPolling, onSuccess])

  // 90s polling timeout
  useEffect(() => {
    if (step !== 'generating') return
    if (elapsedSeconds >= 90 && !timedOut) {
      setTimedOut(true)
    }
  }, [step, elapsedSeconds, timedOut])

  // ── Tile grid ──────────────────────────────────────────────────────────────

  const tileBase: React.CSSProperties = {
    height: 128, borderRadius: 16,
    background: '#111111', border: '1px solid #1f1f1f',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 8, cursor: 'pointer', transition: 'border-color 0.15s',
  }

  const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderChooseSource = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Thumbnail</p>
        <h2 className="text-2xl font-semibold text-white">Choose photo source</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Take a photo */}
        <button
          disabled={!cameraSupported}
          onClick={() => setStep('camera')}
          style={{
            ...tileBase,
            opacity: cameraSupported ? 1 : 0.4,
            cursor: cameraSupported ? 'pointer' : 'not-allowed',
          }}
          onMouseEnter={(e) => { if (cameraSupported) (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f3f' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1f1f1f' }}
        >
          <span style={{ fontSize: 28 }}>📷</span>
          <span className="text-sm font-medium text-zinc-300">Take a photo</span>
          {!cameraSupported && <span className="text-xs text-zinc-600">Desktop only</span>}
        </button>

        {/* Upload a photo */}
        <button
          onClick={() => setStep('upload')}
          style={tileBase}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f3f' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1f1f1f' }}
        >
          <span style={{ fontSize: 28 }}>📤</span>
          <span className="text-sm font-medium text-zinc-300">Upload a photo</span>
        </button>

        {/* Google profile */}
        <button
          onClick={() => setStep('google_profile')}
          style={tileBase}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f3f' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1f1f1f' }}
        >
          {googleProfilePhotoUrl ? (
            <img
              src={googleProfilePhotoUrl}
              alt="Google profile"
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 28 }}>👤</span>
          )}
          <span className="text-sm font-medium text-zinc-300">Google profile</span>
        </button>

        {/* No photo */}
        <button
          onClick={() => setStep('no_photo')}
          style={tileBase}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f3f' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1f1f1f' }}
        >
          <span style={{ fontSize: 28, color: '#555555' }}>✕</span>
          <span className="text-sm font-medium text-zinc-300">No photo</span>
        </button>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed">
        Your photo is sent to Google Gemini to generate the thumbnail. We don&apos;t store the original photo.
      </p>
    </div>
  )

  const renderCamera = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Camera</p>
        <h2 className="text-2xl font-semibold text-white">Take a photo</h2>
      </div>

      {cameraError ? (
        <div style={{ background: '#1a0000', border: '1px solid #6e1d1d', borderRadius: 8, padding: '12px 16px' }}>
          <p className="text-sm text-red-400">{cameraError}</p>
        </div>
      ) : capturedPhoto ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <img
            src={`data:image/jpeg;base64,${capturedPhoto}`}
            alt="Captured"
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: 300 }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={retakeCamera} className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors">
              Retake
            </button>
            <button
              onClick={() => void startGeneration('camera', capturedPhoto)}
              className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
            >
              Use this photo
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-xl"
            style={{ background: '#000', maxHeight: 300, objectFit: 'cover' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <button
            onClick={capturePhoto}
            className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            Capture
          </button>
        </div>
      )}

      <button onClick={() => { setCapturedPhoto(null); setStep('choose_source') }} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-left">
        ← Back
      </button>
    </div>
  )

  const renderUpload = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Upload</p>
        <h2 className="text-2xl font-semibold text-white">Upload a photo</h2>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => void handleFileChange(e)}
      />

      {uploadedPhoto ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <img
            src={`data:image/jpeg;base64,${uploadedPhoto}`}
            alt="Uploaded"
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: 300 }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setUploadedPhoto(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
            >
              Change photo
            </button>
            <button
              onClick={() => void startGeneration('upload', uploadedPhoto)}
              className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
            >
              Use this photo
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              height: 120, borderRadius: 12, border: '2px dashed #2a2a2a',
              background: 'transparent', cursor: 'pointer', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f3f' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a' }}
          >
            <span style={{ fontSize: 24 }}>📤</span>
            <span className="text-sm text-zinc-400">Click to choose a file</span>
            <span className="text-xs text-zinc-600">JPEG, PNG or WebP · max 5MB</span>
          </button>
          {fileError && <p className="text-sm text-red-400">{fileError}</p>}
        </div>
      )}

      <button onClick={() => { setUploadedPhoto(null); setStep('choose_source') }} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-left">
        ← Back
      </button>
    </div>
  )

  const renderGoogleProfile = () => {
    const isDefault = googleProfilePhotoUrl ? isDefaultGoogleAvatar(googleProfilePhotoUrl) : true
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Google profile</p>
          <h2 className="text-2xl font-semibold text-white">Use your Google photo</h2>
        </div>

        {googleProfilePhotoUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <img
              src={googleProfilePhotoUrl}
              alt="Google profile"
              style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', margin: '0 auto', display: 'block' }}
            />
            {isDefault && (
              <p className="text-xs text-zinc-500 text-center">
                This looks like a default Google avatar. Gemini will use an illustrated character instead.
              </p>
            )}
            <button
              onClick={() => void startGeneration('google_profile')}
              className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
            >
              {isDefault ? 'Continue with illustrated character' : 'Use this photo'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No Google profile photo found. Try uploading a photo instead.</p>
        )}

        <button onClick={() => setStep('choose_source')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-left">
          ← Back
        </button>
      </div>
    )
  }

  const renderNoPhoto = () => {
    const handleGenerate = async () => {
      const response = await fetch('/stick-figure.png')
      const blob = await response.blob()
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.readAsDataURL(blob)
      })
      await startGeneration('no_photo', base64)
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">No photo</p>
          <h2 className="text-2xl font-semibold text-white">Continue without a photo</h2>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Gemini will use an illustrated character based on the thumbnail brief. The result won&apos;t include a real person.
        </p>
        <button
          onClick={() => void handleGenerate()}
          className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors self-start"
        >
          Generate thumbnail
        </button>
        <button onClick={() => setStep('choose_source')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors text-left">
          ← Back
        </button>
      </div>
    )
  }

  const renderGenerating = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', textAlign: 'center' }}>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Generating</p>
        <h2 className="text-2xl font-semibold text-white">Generating your thumbnail</h2>
      </div>

      <div style={{
        width: 28, height: 28, border: '2px solid #1a1a1a', borderTopColor: '#4ade80',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />

      <GeneratingStages elapsedSeconds={elapsedSeconds} />

      {timedOut && (
        <p className="text-xs text-zinc-500">
          Taking longer than usual. Refresh the page in a minute to check the result.
        </p>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  )

  const renderCompleted = () => {
    const handleDownload = async () => {
      if (!generatedUrl) return
      try {
        const response = await fetch(generatedUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `showstencil-thumbnail-${ideaId}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
        console.error('Download failed:', error)
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Done</p>
          <h2 className="text-2xl font-semibold text-white">Your thumbnail is ready</h2>
        </div>

        {generatedUrl && (
          <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-zinc-900">
            <img
              src={generatedUrl}
              alt="Generated thumbnail"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <p className="text-xs text-zinc-500 text-center">
          Recommended: resize to 1280×720px before uploading to YouTube
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          {generatedUrl && (
            <button
              onClick={() => void handleDownload()}
              className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
            >
              Download as PNG
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-sm px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
          >
            Close
          </button>
        </div>

        <p className="text-xs text-zinc-600">Generated using Google Gemini</p>
      </div>
    )
  }

  const renderFailed = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Error</p>
        <h2 className="text-2xl font-semibold text-white">Generation failed</h2>
      </div>
      <p className="text-sm text-zinc-400">{failError ?? 'Something went wrong. Please try again.'}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => { setStep('choose_source'); setFailError(null) }}
          className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
        >
          Try again
        </button>
        <button
          onClick={handleClose}
          className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )

  const stepContent: Record<ModalStep, () => React.ReactNode> = {
    choose_source: renderChooseSource,
    camera: renderCamera,
    upload: renderUpload,
    google_profile: renderGoogleProfile,
    no_photo: renderNoPhoto,
    generating: renderGenerating,
    completed: renderCompleted,
    failed: renderFailed,
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150]"
            onClick={handleClose}
          />
          <div className="fixed inset-0 grid place-items-center z-[200] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto w-full max-w-[520px] bg-[#111111] sm:rounded-3xl overflow-auto [scrollbar-width:none] relative"
              style={{ maxHeight: '90vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-zinc-900 text-white/70 border border-zinc-800 hover:border-zinc-600 hover:text-white transition-colors z-10"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>

              <div className="p-8">
                {stepContent[step]?.()}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
