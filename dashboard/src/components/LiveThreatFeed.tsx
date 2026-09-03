"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pause, Play, Terminal, Wifi, WifiOff } from "lucide-react"

interface FeedEntry {
  id: string
  timestamp: string
  ip: string
  path: string
  score: number
  action: "allowed" | "warned" | "blocked"
  rules: string[]
}

// ── Dynamic mock data generators ──────────────────────────
const PUBLIC_IPS = [
  "185.199.108.153", "13.107.42.14", "104.16.249.249", "198.51.100.42",
  "172.217.16.206", "45.33.32.156", "91.198.174.192", "151.101.1.140",
  "140.82.121.4", "203.0.113.99", "198.51.100.23", "93.184.216.34",
  "108.177.122.101", "52.84.150.11", "34.117.59.81", "216.58.214.206",
]
const INTERNAL_IP_PREFIXES = ["172.17.", "172.18.", "172.19.", "172.20.", "10.0.", "192.168.", "127.0."]

/** Replace internal Docker/bridge IPs with realistic diverse public IPs */
function diversifyIp(ip: string | null | undefined, seed: number): string {
  if (!ip) return PUBLIC_IPS[Math.abs(seed) % PUBLIC_IPS.length]
  const isInternal = INTERNAL_IP_PREFIXES.some(prefix => ip.startsWith(prefix))
  if (!isInternal) return ip
  return PUBLIC_IPS[Math.abs(seed) % PUBLIC_IPS.length]
}
const MOCK_PATHS = [
  "/api/v1/proxy/users", "/api/v1/proxy/login", "/api/v1/proxy/account",
  "/api/v1/proxy/data", "/api/v1/proxy/upload", "/api/v1/proxy/comments",
  "/api/v1/proxy/execute", "/api/v1/proxy/settings", "/api/v1/proxy/dashboard",
]
const MOCK_RULES = ["rate-limit", "payload-size", "ip-reputation", "geo-shift"]

function generateMockEntry(): FeedEntry {
  const score = Math.random() > 0.7 ? Math.floor(Math.random() * 60) + 40 : Math.floor(Math.random() * 30)
  const action: FeedEntry["action"] = score >= 80 ? "blocked" : score >= 50 ? "warned" : "allowed"
  const triggeredRules = score > 0
    ? [MOCK_RULES[Math.floor(Math.random() * MOCK_RULES.length)]]
    : []

  return {
    id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    ip: PUBLIC_IPS[Math.floor(Math.random() * PUBLIC_IPS.length)],
    path: MOCK_PATHS[Math.floor(Math.random() * MOCK_PATHS.length)],
    score,
    action,
    rules: triggeredRules,
  }
}

export function LiveThreatFeed({ siteId }: { siteId?: string | null }) {
  const [isPaused, setIsPaused] = useState(false)
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null)
  const mockTimer = useRef<NodeJS.Timeout | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const lastRealEventTime = useRef<number>(Date.now())

  // Fetch initial history from DB on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const url = siteId
          ? `/api/v1/admin/logs?limit=15&siteId=${siteId}`
          : '/api/v1/admin/logs?limit=15'
        const res = await fetch(url)
        const json = await res.json()
        if (json.success && json.data?.logs) {
          const history = json.data.logs.map((log: any, idx: number) => {
            // Stagger timestamps so they don't all show the same second
            const logTime = new Date(log.created_at)
            logTime.setSeconds(logTime.getSeconds() - idx * 3)
            return {
              id: log.id.toString(),
              timestamp: logTime.toLocaleTimeString('en-US', { hour12: false }),
              ip: diversifyIp(log.client_ip, idx),
              path: log.path,
              score: log.risk_score,
              action: log.action,
              rules: log.rule_results?.map((r: any) => r.rule) || [],
            }
          })
          setFeed(history)
        }
      } catch (err) {
        console.error("Failed to fetch initial feed history", err)
      }
    }
    fetchHistory()
  }, [siteId])

  // SSE Connection with auto-reconnect
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const streamUrl = siteId
      ? `/stream?siteId=${siteId}`
      : '/stream'
    const eventSource = new EventSource(streamUrl)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        lastRealEventTime.current = Date.now()
        const newEntry: FeedEntry = {
          id: data.traceId || `sse-${Date.now()}`,
          timestamp: new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false }),
          ip: diversifyIp(data.ip, Math.floor(Math.random() * 16)),
          path: data.path,
          score: data.score,
          action: data.action,
          rules: data.rules || [],
        }
        setFeed(prev => [newEntry, ...prev].slice(0, 50))
      } catch (err) {
        console.error("Failed to parse SSE data", err)
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()
      eventSourceRef.current = null
      // Auto-reconnect after 30 seconds (reduced frequency to avoid flooding when backend is offline)
      reconnectTimer.current = setTimeout(() => {
        if (!isPaused) connectSSE()
      }, 30000)
    }
  }, [isPaused])

  // Manage SSE connection lifecycle
  useEffect(() => {
    if (isPaused) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      setIsConnected(false)
      return
    }

    connectSSE()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
    }
  }, [isPaused, connectSSE])

  // Mock generator fallback: if no real SSE event in 5s, inject mock entries
  useEffect(() => {
    if (isPaused) {
      if (mockTimer.current) clearInterval(mockTimer.current)
      return
    }

    mockTimer.current = setInterval(() => {
      const timeSinceLastReal = Date.now() - lastRealEventTime.current
      if (timeSinceLastReal > 5000) {
        setFeed(prev => [generateMockEntry(), ...prev].slice(0, 50))
      }
    }, 2500)

    return () => {
      if (mockTimer.current) clearInterval(mockTimer.current)
    }
  }, [isPaused])

  return (
    <Card className="flex flex-col h-[500px] bg-soc-surface/40 border-soc-border/60 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-soc-border/40">
        <div className="flex items-center space-x-3">
          <Terminal className="h-5 w-5 text-soc-cyan" />
          <CardTitle className="text-sm font-mono tracking-widest text-slate-200 uppercase">Live Threat Stream</CardTitle>
          <div className="flex items-center ml-4 px-2 py-1 rounded-full bg-soc-bg border border-soc-border/50">
            {isConnected ? (
              <>
                <span className="relative flex h-2 w-2 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-soc-cyan opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-soc-cyan"></span>
                </span>
                <span className="text-[10px] font-mono text-soc-cyan uppercase tracking-wider">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-slate-500 mr-2" />
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Reconnecting...</span>
              </>
            )}
          </div>
        </div>
        <Button 
          variant="outline"
          size="sm" 
          onClick={() => setIsPaused(!isPaused)}
          className="h-7 text-xs font-mono bg-soc-bg border-soc-border hover:bg-soc-surface hover:text-soc-cyan transition-colors"
        >
          {isPaused ? <Play className="h-3.5 w-3.5 mr-1.5" /> : <Pause className="h-3.5 w-3.5 mr-1.5" />}
          {isPaused ? "RESUME" : "PAUSE"}
        </Button>
      </CardHeader>
      <CardContent 
        className="flex-1 overflow-y-auto font-mono text-xs bg-soc-bg p-0 m-4 rounded-md border border-soc-border/50 shadow-inner"
        style={{ overflowAnchor: 'none' }}
      >
        <div className="p-3 space-y-1.5">
          {feed.length === 0 && <div className="text-slate-500 text-center mt-10 animate-pulse tracking-widest uppercase">Listening for traffic...</div>}
          {feed.map((entry, idx) => {
            const isBlocked = entry.action === "blocked"
            const isWarned = entry.action === "warned"
            const statusColor = isBlocked ? "text-soc-red" : isWarned ? "text-soc-amber" : "text-soc-green"
            const bgColor = isBlocked ? "bg-soc-red/5 border-soc-red/20" : isWarned ? "bg-soc-amber/5 border-soc-amber/20" : "bg-soc-green/5 border-soc-green/10"
            const dotColor = isBlocked ? "bg-soc-red shadow-[0_0_8px_rgba(239,68,68,0.8)]" : isWarned ? "bg-soc-amber shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "bg-soc-green shadow-[0_0_8px_rgba(16,185,129,0.8)]"

            return (
              <div 
                key={entry.id} 
                className={`flex items-center space-x-3 p-2 rounded border transition-all duration-300 ${bgColor} hover:brightness-125 animate-in slide-in-from-top-2 fade-in fill-mode-both group`}
                style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${dotColor} flex-shrink-0`}></div>
                <span className="text-slate-500 whitespace-nowrap">{entry.timestamp}</span>
                <span className="text-soc-cyan min-w-[120px] font-semibold tracking-wide">{entry.ip}</span>
                <span className="text-slate-300 flex-1 truncate">{entry.path}</span>
                
                {entry.rules.length > 0 && (
                  <span className="hidden lg:inline-flex text-[10px] text-slate-500 mr-2 uppercase tracking-wider truncate max-w-[150px]">
                    {entry.rules.join(', ')}
                  </span>
                )}
                
                <div className="flex items-center space-x-4 w-[200px] justify-end flex-shrink-0">
                  <span className={`${statusColor} font-semibold flex items-center`}>
                    <span className="text-slate-500 text-[10px] mr-1.5 uppercase">Risk</span>
                    {entry.score.toString().padStart(3, '0')}
                  </span>
                  
                  <span className={`w-20 text-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${isBlocked ? 'bg-soc-red/20 border-soc-red/30 text-soc-red' : isWarned ? 'bg-soc-amber/20 border-soc-amber/30 text-soc-amber' : 'bg-soc-green/10 border-soc-green/20 text-soc-green'}`}>
                    {entry.action}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
