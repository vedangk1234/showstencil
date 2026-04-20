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

interface GrowthTabProps {
  userSnapshots: Record<string, unknown>[]
  competitor: Record<string, unknown>
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function GrowthTab({ userSnapshots, competitor }: GrowthTabProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const chartData = userSnapshots.map((s) => ({
    date: new Date(s.snapshot_date as string).getTime(),
    You: (s.subscriber_count as number) || 0,
    [competitor.channel_name as string]: (competitor.subscriber_count as number) || 0,
  }))

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

  const compName = competitor.channel_name as string

  return (
    <div>
      <p style={{ color: '#555555', fontSize: 12, marginBottom: 20 }}>
        Your subscriber growth vs. {compName}&apos;s current count (historical competitor data not available).
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
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                  stroke="#444444"
                  tick={{ fontSize: 11, fontFamily: 'monospace' }}
                />
                <YAxis
                  tickFormatter={fmtK}
                  stroke="#444444"
                  tick={{ fontSize: 11, fontFamily: 'monospace' }}
                />
                <Tooltip
                  labelFormatter={(v) =>
                    new Date(v).toLocaleDateString('en-US', {
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
                />
                <Line
                  type="monotone"
                  dataKey={compName}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
