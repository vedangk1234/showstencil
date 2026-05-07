function Skel({ className }: { className: string }) {
  return <div className={`bg-stencil-surface animate-pulse rounded-sm ${className}`} />
}

export default function DigestLoading() {
  return (
    <div className="p-7 max-w-[760px] flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col gap-2">
        <Skel className="h-5 w-28" />
        <Skel className="h-3 w-64" />
      </div>

      {/* Digest list */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-stencil-bg2 border border-stencil-line p-4 flex flex-col gap-3">
            {/* Week label + date */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <Skel className="h-2.5 w-20" />
                <Skel className="h-4 w-44" />
              </div>
              <Skel className="h-6 w-16 rounded-full" />
            </div>
            {/* Metric chips */}
            <div className="flex gap-2 flex-wrap">
              <Skel className="h-5 w-20 rounded-full" />
              <Skel className="h-5 w-24 rounded-full" />
              <Skel className="h-5 w-20 rounded-full" />
            </div>
            {/* Read link */}
            <Skel className="h-3 w-24" />
          </div>
        ))}
      </div>

    </div>
  )
}
