function Skel({ className }: { className: string }) {
  return <div className={`bg-stencil-surface animate-pulse rounded-sm ${className}`} />
}

export default function CompetitorsLoading() {
  return (
    <div className="p-7 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <Skel className="h-5 w-32" />
          <Skel className="h-3 w-56" />
        </div>
        <Skel className="h-8 w-36" />
      </div>

      {/* Plan limit indicator */}
      <Skel className="h-3 w-40" />

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['All', 'Tier 1', 'Tier 2', 'Dominator'].map((t) => (
          <Skel key={t} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      {/* Table header */}
      <div className="bg-stencil-bg2 border border-stencil-line">
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-stencil-line">
          <Skel className="h-2.5 w-40" />
          <Skel className="h-2.5 w-16 ml-auto" />
          <Skel className="h-2.5 w-20" />
          <Skel className="h-2.5 w-24" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-stencil-line last:border-0">
            <Skel className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <Skel className="h-3.5 w-36" />
              <Skel className="h-2.5 w-24" />
            </div>
            <Skel className="h-5 w-14 rounded-full" />
            <Skel className="h-3 w-24" />
            <Skel className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Channel search bar */}
      <div className="bg-stencil-bg2 border border-stencil-line p-4 flex flex-col gap-3">
        <Skel className="h-3 w-40" />
        <Skel className="h-9 w-full" />
      </div>

    </div>
  )
}
