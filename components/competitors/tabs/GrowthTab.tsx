'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'

interface CompetitorSnapshotRow {
  snapshot_date: string
  subscriber_count: number | null
}

interface GrowthTabProps {
  userSnapshots: Record<string, unknown>[]
  competitor: Record<string, unknown>
  competitorSnapshots: CompetitorSnapshotRow[]
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function GrowthTab({ userSnapshots, competitor, competitorSnapshots }: GrowthTabProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const compName = competitor.channel_name as string

  const allDates = Array.from(new Set([
    ...userSnapshots.map((s) => s.snapshot_date as string),
    ...competitorSnapshots.map((s) => s.snapshot_date),
  ])).sort()

  const startDate = new Date(allDates[0])
  const endDate = new Date(allDates[allDates.length - 1])
  const continuousDates: string[] = []
  const cur = new Date(startDate)
  while (cur <= endDate) {
    continuousDates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }

  const chartData = continuousDates.map((date) => {
    const userSnap = userSnapshots.find((s) => (s.snapshot_date as string) === date)
    const compSnap = competitorSnapshots.find((s) => s.snapshot_date === date)
    return {
      date,
      You: userSnap?.subscriber_count != null ? (userSnap.subscriber_count as number) : null,
      [compName]: competitorSnapshots.length >= 2
        ? (compSnap?.subscriber_count ?? null)
        : (competitor.subscriber_count as number),
    }
  })

  if (chartData.length < 2) {
    return (
      <div
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: '#0a0a0a',
          border: '1px dashed #1a1a1a',
          borderRadius: 8,
        }}
      >
        <p style={{ color: '#888888', fontSize: 13, margin: '0 0 6px' }}>
          Not enough data to show growth trends yet.
        </p>
        <p style={{ color: '#555555', fontSize: 12, margin: 0 }}>
          Growth charts require at least 2 daily snapshots.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p style={{ color: '#555555', fontSize: 12, marginBottom: 20 }}>
        Your subscriber growth vs. {compName}&apos;s historical subscriber count.
      </p>

      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
          padding: '20px',
        }}
      >
        <div style={{ height: 300 }}>
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                  stroke="#444444"
                  tick={{ fontSize: 11, fontFamily: 'monospace' }}
                  interval={6}
                />
                <YAxis
                  scale="log"
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => fmtK(v)}
                  stroke="#444444"
                  tick={{ fontSize: 11, fontFamily: 'monospace' }}
                  label={{
                    value: 'Subscribers (log scale)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 10, fill: '#666' },
                  }}
                />
                <Tooltip
                  labelFormatter={(v) =>
                    new Date(String(v)).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  }
                  formatter={(value, name) => [fmtK(Number(value ?? 0)), String(name)]}
                  contentStyle={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #1a1a1a',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: 'monospace', paddingTop: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="You"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={true}
                />
                <Line
                  type="monotone"
                  dataKey={compName}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls={true}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
