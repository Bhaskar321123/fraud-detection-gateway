"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, ShieldAlert, ShieldCheck, Zap } from "lucide-react"

export function MetricsHeader({ siteId }: { siteId?: string | null }) {
  const [metrics, setMetrics] = useState({
    totalRequests: 0,
    blocked: 0,
    allowed: 0,
    warned: 0,
    avgScore: 0,
  })

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const url = siteId
          ? `/api/v1/admin/metrics?siteId=${siteId}`
          : '/api/v1/admin/metrics'
        const res = await fetch(url)
        const json = await res.json()
        if (json.success && json.data) {
          const total = json.data.totalRequests || 0
          const blocked = json.data.byAction.blocked || 0
          const allowed = json.data.byAction.allowed || 0
          const warned = json.data.byAction.warned || 0
          setMetrics({
            totalRequests: total,
            blocked,
            allowed,
            warned,
            avgScore: json.data.averageRiskScore || 0,
          })
        }
      } catch (err) {
        console.error("Failed to fetch metrics", err)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 5000)
    return () => clearInterval(interval)
  }, [siteId])

  const passRate = metrics.totalRequests > 0 
    ? (((metrics.allowed + metrics.warned) / metrics.totalRequests) * 100).toFixed(1) 
    : 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-soc-surface/40 border-soc-border/60 relative overflow-hidden group hover:bg-soc-surface/70 transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-soc-cyan/20 group-hover:bg-soc-cyan/60 transition-colors duration-300"></div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-[11px] font-mono font-semibold tracking-widest text-slate-400">TRAFFIC ANALYZED</CardTitle>
          <Activity className="h-4 w-4 text-soc-cyan/70" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono tracking-tight text-slate-100">{metrics.totalRequests.toLocaleString()}</div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-2">
            Last 60 minutes
          </p>
        </CardContent>
      </Card>
      
      <Card className="bg-soc-surface/40 border-soc-border/60 relative overflow-hidden group hover:bg-soc-surface/70 transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-soc-red/30 group-hover:bg-soc-red/80 transition-colors duration-300"></div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-[11px] font-mono font-semibold tracking-widest text-slate-400">BLOCKED ATTACKS</CardTitle>
          <ShieldAlert className="h-4 w-4 text-soc-red/70" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono tracking-tight text-soc-red">{metrics.blocked.toLocaleString()}</div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-2">
            Last 60 minutes
          </p>
        </CardContent>
      </Card>

      <Card className="bg-soc-surface/40 border-soc-border/60 relative overflow-hidden group hover:bg-soc-surface/70 transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-soc-green/30 group-hover:bg-soc-green/80 transition-colors duration-300"></div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-[11px] font-mono font-semibold tracking-widest text-slate-400">ALLOWED TRAFFIC</CardTitle>
          <ShieldCheck className="h-4 w-4 text-soc-green/70" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono tracking-tight text-soc-green">{(metrics.allowed + metrics.warned).toLocaleString()}</div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-2">
            {passRate}% pass rate
          </p>
        </CardContent>
      </Card>

      <Card className="bg-soc-surface/40 border-soc-border/60 relative overflow-hidden group hover:bg-soc-surface/70 transition-colors duration-300">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-soc-amber/30 group-hover:bg-soc-amber/80 transition-colors duration-300"></div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-[11px] font-mono font-semibold tracking-widest text-slate-400">AVERAGE RISK SCORE</CardTitle>
          <Zap className="h-4 w-4 text-soc-amber/70" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono tracking-tight text-soc-amber">{metrics.avgScore} <span className="text-sm text-slate-500">/ 100</span></div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-2">
            Across all requests
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
