"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Activity } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface TimelineBucket {
  bucket: string;
  action: 'allowed' | 'warned' | 'blocked';
  count: number;
}

interface ChartPoint {
  time: string;
  total: number;
  blocked: number;
}

/**
 * Generate a full 15-minute timeline of zero-filled buckets.
 * This ensures Recharts always has multiple connected data points.
 */
function generateEmptyTimeline(windowMinutes: number, intervalMinutes: number): ChartPoint[] {
  const now = new Date()
  const points: ChartPoint[] = []
  const totalBuckets = Math.floor(windowMinutes / intervalMinutes)

  for (let i = totalBuckets; i >= 0; i--) {
    const t = new Date(now.getTime() - i * intervalMinutes * 60_000)
    points.push({
      time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      total: 0,
      blocked: 0,
    })
  }
  return points
}

export function AnalyticsCharts({ siteId }: { siteId?: string | null }) {
  const [isMounted, setIsMounted] = useState(false)
  const [trafficData, setTrafficData] = useState<ChartPoint[]>([])

  useEffect(() => {
    setIsMounted(true)

    // Seed the chart with an empty 15-minute timeline so lines render immediately
    setTrafficData(generateEmptyTimeline(15, 1))

    const fetchTimeline = async () => {
      try {
        const url = siteId
          ? `/api/v1/admin/metrics/timeline?interval=1&window=15&siteId=${siteId}`
          : '/api/v1/admin/metrics/timeline?interval=1&window=15'
        const res = await fetch(url)
        const json = await res.json()
        if (json.success && json.data?.buckets) {
          // Start from a fresh empty timeline
          const baseline = generateEmptyTimeline(15, 1)
          const baselineMap = new Map<string, ChartPoint>()
          baseline.forEach(p => baselineMap.set(p.time, p))

          // Overlay real data onto the baseline
          json.data.buckets.forEach((row: TimelineBucket) => {
            const time = new Date(row.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const point = baselineMap.get(time)
            if (point) {
              point.total += row.count
              if (row.action === 'blocked') {
                point.blocked += row.count
              }
            }
          })

          setTrafficData(Array.from(baselineMap.values()))
        }
      } catch (err) {
        console.error("Failed to fetch timeline", err)
      }
    }

    fetchTimeline()
    const interval = setInterval(fetchTimeline, 5000)
    return () => clearInterval(interval)
  }, [siteId])

  return (
    <Card className="flex flex-col flex-1 min-h-[350px] bg-soc-surface/40 border-soc-border/60 shadow-lg relative overflow-hidden">
      <CardHeader className="flex-shrink-0 pb-4 border-b border-soc-border/40">
        <CardTitle className="text-sm font-mono tracking-widest text-slate-200 uppercase flex items-center">
          <Activity className="h-4 w-4 text-soc-cyan mr-2" />
          Traffic Velocity
        </CardTitle>
        <CardDescription className="text-[10px] font-mono text-slate-500 uppercase tracking-wide mt-1.5">Live request volume • 15 Minute Window</CardDescription>
      </CardHeader>
      <CardContent className="pl-2 flex-1 relative min-h-0 pt-4 bg-soc-bg shadow-inner border-x border-soc-border/50 mx-4 mb-4 rounded-b-md">
        {!isMounted ? (
          <div className="h-[300px] w-full flex items-center justify-center text-slate-500 font-mono text-xs uppercase tracking-widest animate-pulse">
            Initializing Telemetry...
          </div>
        ) : (
          <div className="w-full h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData} margin={{ top: 10, right: 30, left: -10, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(188, 86%, 53%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(188, 86%, 53%)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 15%)" vertical={false} opacity={0.5} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontFamily="monospace" />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} fontFamily="monospace" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(224, 71%, 4%)', borderColor: 'hsl(217, 33%, 15%)', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Area type="monotone" dataKey="total" stroke="hsl(188, 86%, 53%)" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" name="Total Requests" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="blocked" stroke="hsl(0, 84%, 60%)" strokeWidth={2} fillOpacity={1} fill="url(#colorBlocked)" name="Blocked" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
