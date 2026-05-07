function Skel({ className }: { className: string }) {
  return <div className={`bg-stencil-surface animate-pulse rounded-sm ${className}`} />
}

export default function IdeasLoading() {
  return (
    <div className="p-7 flex flex-col gap-6">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skel className="h-5 w-28" />
          <Skel className="h-3 w-72" />
        </div>
        <Skel className="h-9 w-36 shrink-0" />
      </div>

      {/* Plan indicator bar */}
      <Skel className="h-3 w-48" />

      {/* Idea cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-stencil-bg2 border border-stencil-line p-5 flex flex-col gap-4">
            {/* Score badge + duration */}
            <div className="flex items-center gap-2">
              <Skel className="h-6 w-10 rounded-full" />
              <Skel className="h-5 w-20 rounded-full" />
            </div>
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <Skel className="h-4 w-full" />
              <Skel className="h-4 w-4/5" />
            </div>
            {/* Why now */}
            <Skel className="h-3 w-3/4" />
            {/* Content sections */}
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex flex-col gap-1.5">
                <Skel className="h-2.5 w-20" />
                <Skel className="h-3 w-full" />
                <Skel className="h-3 w-5/6" />
              </div>
            ))}
            {/* Action buttons */}
            <div className="flex gap-2 mt-1">
              <Skel className="h-8 w-32" />
              <Skel className="h-8 w-32" />
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
