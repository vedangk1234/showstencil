'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Competitor, ChannelSnapshot, CompetitorSnapshot } from '@/types'

interface CompetitorWithSnapshots {
  competitor: Competitor
  snapshots: CompetitorSnapshot[]
}

interface Props {
  userSnapshots: ChannelSnapshot[]
  competitorData: CompetitorWithSnapshots[]
  userName: string | null
}

function entityColor(competitor: Competitor): string {
  if (competitor.is_dominator) return '#f59e0b'   // orange
  if (!competitor.is_auto_detected) return '#eab308' // yellow (manually added)
  if (competitor.tier === 1) return '#3b82f6'     // blue
  if (competitor.tier === 2) return '#a855f7'     // purple
  return '#6b7280'
}

function tierLabel(competitor: Competitor): string {
  if (competitor.is_dominator) return 'Dominator'
  if (!competitor.is_auto_detected) return 'Manual'
  return `Tier ${competitor.tier}`
}

// Build unified date-keyed dataset for Recharts
function buildChartData(
  userSnapshots: ChannelSnapshot[],
  competitorData: CompetitorWithSnapshots[],
): Record<string, number | null>[] {
  const dateSet = new Set<string>()

  userSnapshots.forEach((s) => dateSet.add(s.snapshot_date))
  competitorData.forEach(({ snapshots }) =>
    snapshots.forEach((s) => dateSet.add(s.snapshot_date)),
  )

  const sortedDates = Array.from(dateSet).sort()

  // Build lookup maps
  const userMap = new Map(userSnapshots.map((s) => [s.snapshot_date, s.subscriber_count]))
  const compMaps = competitorData.map(({ competitor, snapshots }) => ({
    key: `comp_${competitor.id}`,
    map: new Map(snapshots.map((s) => [s.snapshot_date, s.subscriber_count])),
  }))

  return sortedDates.map((date) => {
    const row: Record<string, number | null> = { date: new Date(date).getTime() }
    row['you'] = userMap.get(date) ?? null
    for (const { key, map } of compMaps) {
      row[key] = map.get(date) ?? null
    }
    return row
  })
}

// Custom tooltip formatter — show real numbers, not log-scaled
function formatSubs(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export default function SubscriberGrowthChart({ userSnapshots, competitorData, userName }: Props) {
  const chartData = buildChartData(userSnapshots, competitorData)

  if (chartData.length < 2) {
    return (
      <div className="font-mono text-[11.5px] text-stencil-ink3 py-5 text-center">
        Not enough data yet — keep syncing for a few more days.
      </div>
    )
  }

  return (
    <div>
      <div style={{ height: 280, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="date"
              type="number"
              domain={['dataMin', 'dataMax']}
              hide
            />
            <YAxis
              scale="log"
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => formatSubs(v)}
              tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#555555' }}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: '#0A0A0A',
                border: '1px solid #222222',
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                padding: '4px 8px',
                color: '#EDEDED',
              }}
              cursor={{ stroke: '#2A2A2A', strokeWidth: 1 }}
              labelFormatter={(v) =>
                new Date(v).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              }
              formatter={(v, name) => [
                typeof v === 'number' ? formatSubs(v) : '—',
                name === 'you' ? (userName ?? 'You') : String(name),
              ]}
            />
            <Line
              type="monotone"
              dataKey="you"
              name="you"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            {competitorData.map(({ competitor }) => (
              <Line
                key={competitor.id}
                type="monotone"
                dataKey={`comp_${competitor.id}`}
                name={competitor.channel_name ?? competitor.youtube_channel_id}
                stroke={entityColor(competitor)}
                strokeWidth={1.5}
                dot={{ r: 3, fill: entityColor(competitor), strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-[14px] font-mono text-[10px] text-stencil-ink3 mt-[10px] pt-[10px] border-t border-dashed border-stencil-line">
        <span>
          <span className="inline-block size-2 mr-[5px] align-[-1px]" style={{ background: '#22c55e' }} />
          {userName ?? 'You'}
        </span>
        {competitorData.map(({ competitor }) => (
          <span key={competitor.id}>
            <span
              className="inline-block size-2 mr-[5px] align-[-1px]"
              style={{ background: entityColor(competitor) }}
            />
            {competitor.channel_name ?? competitor.youtube_channel_id}
            <span className="text-stencil-ink4 ml-1">· {tierLabel(competitor)}</span>
          </span>
        ))}
        <span className="ml-auto text-stencil-ink4">log scale</span>
      </div>
    </div>
  )
}
