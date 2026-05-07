function Skel({ className }: { className: string }) {
  return <div className={`bg-stencil-surface animate-pulse rounded-sm ${className}`} />
}

export default function DashboardLoading() {
  return (
    <div className="p-7 flex flex-col gap-6">

      {/* Gap score + metric strip */}
      <div className="flex gap-4 items-stretch">
        <div className="bg-stencil-bg2 border border-stencil-line p-5 flex flex-col gap-3 w-48 shrink-0">
          <Skel className="h-3 w-20" />
          <Skel className="h-12 w-16" />
          <Skel className="h-3 w-28" />
        </div>
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-stencil-bg2 border border-stencil-line p-4 flex flex-col gap-2">
              <Skel className="h-2.5 w-16" />
              <Skel className="h-6 w-20" />
              <Skel className="h-2 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Two-col row: chart + top idea */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-stencil-bg2 border border-stencil-line p-5 flex flex-col gap-3">
          <Skel className="h-3 w-24" />
          <Skel className="h-48 w-full" />
        </div>
        <div className="bg-stencil-bg2 border border-stencil-line p-5 flex flex-col gap-3">
          <Skel className="h-3 w-20" />
          <Skel className="h-4 w-full" />
          <Skel className="h-4 w-4/5" />
          <Skel className="h-3 w-32 mt-2" />
          <Skel className="h-3 w-28" />
        </div>
      </div>

      {/* Two-col row: competitors + growth chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-stencil-bg2 border border-stencil-line p-5 flex flex-col gap-3">
          <Skel className="h-3 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-stencil-line last:border-0">
              <Skel className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 flex flex-col gap-1.5">
                <Skel className="h-3 w-32" />
                <Skel className="h-2.5 w-20" />
              </div>
              <Skel className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
        <div className="bg-stencil-bg2 border border-stencil-line p-5 flex flex-col gap-3">
          <Skel className="h-3 w-24" />
          <Skel className="h-48 w-full" />
        </div>
      </div>

    </div>
  )
}
