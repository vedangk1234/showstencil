'use client'

interface Props {
  onNext: () => void
}

export default function StepWelcome({ onNext }: Props) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-6">
        ShowStencil
      </div>

      <h1
        className="text-5xl md:text-6xl leading-[0.95] mb-6 max-w-3xl"
        style={{ fontFamily: 'Instrument Serif, serif', fontWeight: 400 }}
      >
        Find out exactly why your competitors are{' '}
        <em className="italic text-amber-200">growing faster</em> than you.
      </h1>

      <p className="text-zinc-400 text-base leading-relaxed max-w-lg mb-2">
        We'll connect to your YouTube channel, find your niche
        competitors, and show you what they're doing differently.
      </p>

      <p className="text-zinc-500 text-sm mb-12">
        This takes about 30 seconds.
      </p>

      <button
        onClick={onNext}
        className="bg-white text-black px-8 py-3 text-sm font-medium hover:bg-zinc-200 transition-colors"
      >
        Let&apos;s go →
      </button>
    </div>
  )
}
