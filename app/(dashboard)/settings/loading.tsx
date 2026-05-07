function Skel({ className }: { className: string }) {
  return <div className={`bg-stencil-surface animate-pulse rounded-sm ${className}`} />
}

function SectionSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="mb-6">
      <Skel className={`h-2.5 w-${label.length * 3 > 24 ? 24 : label.length * 3 + 8} mb-2.5`} />
      <div className="bg-stencil-bg2 border border-stencil-line overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-stencil-line last:border-0">
            <Skel className="h-3 w-24" />
            <Skel className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SettingsLoading() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 600 }}>

      {/* Page header */}
      <div className="mb-7 flex flex-col gap-1.5">
        <Skel className="h-5 w-20" />
        <Skel className="h-3 w-64" />
      </div>

      <SectionSkeleton label="Account" rows={4} />
      <SectionSkeleton label="Notifications" rows={3} />
      <SectionSkeleton label="Channel Analysis" rows={2} />
      <SectionSkeleton label="Legal" rows={1} />

    </div>
  )
}
