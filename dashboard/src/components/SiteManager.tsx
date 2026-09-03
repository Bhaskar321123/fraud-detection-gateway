"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Globe, Plus, Trash2, Copy, Check, ExternalLink } from "lucide-react"

interface TargetSite {
  id: string
  siteId: string
  name: string
  targetUrl: string
  proxyEndpoint: string
  active: boolean
  createdAt: string
}

export function SiteManager({ onSitesChange }: { onSitesChange?: (sites: TargetSite[]) => void }) {
  const [sites, setSites] = useState<TargetSite[]>([])
  const [inputUrl, setInputUrl] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/sites", { cache: 'no-store' })
      const json = await res.json()
      if (json.success && json.data?.sites) {
        setSites(json.data.sites)
        onSitesChange?.(json.data.sites)
      }
    } catch (err) {
      console.error("Failed to fetch sites", err)
    }
  }, [onSitesChange])

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  const handleAdd = async () => {
    if (!inputUrl.trim()) return
    setIsAdding(true)
    setError(null)

    try {
      const res = await fetch("/api/v1/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: inputUrl.trim() }),
      })
      const json = await res.json()
      if (json.success) {
        setInputUrl("")
        fetchSites()
      } else {
        setError(json.error || "Failed to add site")
      }
    } catch (err) {
      setError("Network error")
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = async (siteId: string) => {
    try {
      await fetch(`/api/v1/admin/sites/${siteId}`, { method: "DELETE" })
      fetchSites()
    } catch (err) {
      console.error("Failed to remove site", err)
    }
  }

  const copyProxyUrl = (site: TargetSite) => {
    const fullUrl = `${window.location.protocol}//${window.location.hostname}:3000${site.proxyEndpoint}`
    navigator.clipboard.writeText(fullUrl)
    setCopiedId(site.siteId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <Card className="flex flex-col shrink-0 bg-soc-surface/40 border-soc-border/60 shadow-lg relative overflow-hidden">
      <CardHeader className="flex-shrink-0 pb-4 border-b border-soc-border/40">
        <CardTitle className="flex items-center gap-2 text-sm font-mono tracking-widest text-slate-200 uppercase">
          <Globe className="h-4 w-4 text-soc-cyan" />
          Protected Assets
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 p-4">
        {/* Add Site Form */}
        <div className="flex gap-2">
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="https://example.com"
            className="flex-1 bg-soc-bg border border-soc-border rounded-sm px-3 py-2 text-xs font-mono text-soc-cyan placeholder:text-slate-600 focus:outline-none focus:border-soc-cyan/60 focus:ring-1 focus:ring-soc-cyan/30 transition-all"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={isAdding || !inputUrl.trim()}
            className="bg-soc-cyan/10 hover:bg-soc-cyan/20 border border-soc-cyan/30 text-soc-cyan text-[10px] uppercase tracking-wider px-4 rounded-sm transition-all"
          >
            <Plus className="h-3 w-3 mr-1" />
            {isAdding ? "Adding..." : "Protect Site"}
          </Button>
        </div>

        {error && (
          <p className="text-[10px] uppercase font-mono text-soc-red">{error}</p>
        )}

        {/* Sites List */}
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-soc-border/80 rounded-md">
              <Globe className="h-8 w-8 text-slate-700 mb-2" />
              <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
                No Protected Assets
              </p>
              <p className="text-[10px] text-slate-600 mt-1 font-mono uppercase">Add your first target to begin gateway protection.</p>
            </div>
          ) : (
            sites.map((site) => (
              <div
                key={site.siteId}
                className="bg-soc-bg/80 border border-soc-border/80 rounded-md p-2 space-y-2 relative overflow-hidden group hover:border-soc-cyan/40 transition-colors"
              >
                <div className="absolute left-0 top-0 h-full w-[2px] bg-soc-green/50"></div>
                
                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center text-[9px] font-mono font-bold tracking-widest text-soc-green uppercase bg-soc-green/10 px-1.5 py-0.5 rounded border border-soc-green/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-soc-green mr-1.5 animate-pulse"></span>
                      Online
                    </span>
                    <span className="text-sm font-semibold text-slate-200 truncate">{site.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(site.siteId)}
                    className="h-6 w-6 p-0 text-slate-500 hover:text-soc-red hover:bg-soc-red/10 shrink-0 rounded-sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 pl-2 text-[11px] text-slate-500 font-mono">
                  <ExternalLink className="h-3 w-3 shrink-0 text-soc-cyan/50" />
                  <span className="truncate">{site.targetUrl}</span>
                </div>

                <div className="flex items-center gap-2 pl-2 pb-1">
                  <code className="flex-1 text-[10px] text-soc-cyan bg-soc-surface px-2 py-1 rounded-sm font-mono truncate border border-soc-border/50">
                    {site.proxyEndpoint}/*
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyProxyUrl(site)}
                    className="h-6 px-2 text-[9px] uppercase tracking-wider font-mono text-slate-400 hover:text-soc-cyan hover:bg-soc-cyan/10 shrink-0 rounded-sm border border-transparent hover:border-soc-cyan/20"
                  >
                    {copiedId === site.siteId ? (
                      <><Check className="h-3 w-3 mr-1 text-soc-green" /> Copied</>
                    ) : (
                      <><Copy className="h-3 w-3 mr-1" /> Copy</>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
