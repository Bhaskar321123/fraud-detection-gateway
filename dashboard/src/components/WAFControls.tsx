"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert } from "lucide-react"

interface Rule {
  name: string
  description: string
  enabled: boolean
  maxScore: number
}

// Human-friendly display names and descriptions for backend rule names
const RULE_DISPLAY: Record<string, { label: string; desc: string; beta?: boolean }> = {
  "rate-limit":    { label: "Rate Limiting",        desc: "Token bucket flood protection." },
  "geo-shift":     { label: "Geo-Shift Tracker",    desc: "Flags impossible travel anomalies.", beta: true },
  "payload-size":  { label: "Payload Size Limits",  desc: "Flags oversized request bodies & detects SQLi/XSS." },
  "ip-reputation": { label: "IP Reputation",        desc: "Checks IPs against blacklists." },
}

export function WAFControls() {
  const [threshold, setThreshold] = useState(80)
  const [rules, setRules] = useState<Rule[]>([])
  const [updatingRule, setUpdatingRule] = useState<string | null>(null)
  const [banIp, setBanIp] = useState("")

  // Fetch the actual rules from the backend
  useEffect(() => {
    const fetchRules = async () => {
      try {
        const res = await fetch('/api/v1/admin/rules')
        const json = await res.json()
        if (json.success && json.data) {
          setRules(json.data)
        }
      } catch (err) {
        console.error("Failed to fetch rules", err)
      }
    }
    fetchRules()
  }, [])

  const toggleRule = async (name: string, currentState: boolean) => {
    if (updatingRule) return
    setUpdatingRule(name)
    
    // Optimistic UI update
    setRules(prev => prev.map(r => r.name === name ? { ...r, enabled: !currentState } : r))
    
    try {
      const res = await fetch(`/api/v1/admin/rules/${name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentState })
      })
      const json = await res.json()
      if (!json.success) {
        // Revert optimistic update on failure
        console.error("Toggle failed:", json.error)
        setRules(prev => prev.map(r => r.name === name ? { ...r, enabled: currentState } : r))
      }
    } catch (err) {
      console.error("Failed to toggle rule", err)
      // Revert optimistic update on network error
      setRules(prev => prev.map(r => r.name === name ? { ...r, enabled: currentState } : r))
    } finally {
      setUpdatingRule(null)
    }
  }

  const handleBanIp = async () => {
    if (!banIp.trim()) return
    try {
      await fetch('/api/v1/admin/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: [banIp.trim()] })
      })
      setBanIp("")
    } catch (err) {
      console.error("Failed to ban IP", err)
    }
  }

  return (
    <Card className="flex-1 flex flex-col bg-soc-surface/40 border-soc-border/60 shadow-lg relative overflow-hidden">
      <CardHeader className="pb-4 border-b border-soc-border/40">
        <CardTitle className="text-sm font-mono tracking-widest text-slate-200 uppercase flex items-center">
          <ShieldAlert className="h-4 w-4 text-soc-cyan mr-2" />
          Active Security Policies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 flex-1 p-4">
        
        <div className="space-y-3 bg-soc-bg/50 p-3 rounded-md border border-soc-border/50">
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-mono tracking-widest uppercase text-slate-400">Global Block Threshold</label>
            <span className="text-sm font-mono font-bold text-soc-red bg-soc-red/10 px-2 py-0.5 rounded border border-soc-red/20">{threshold}</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="100" 
            value={threshold} 
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-soc-red bg-slate-800 rounded-lg appearance-none cursor-pointer h-1.5"
          />
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wide">Requests scoring above threshold are dropped (403).</p>
        </div>

        <div className="pt-2">
          <h4 className="text-[11px] font-mono tracking-widest uppercase text-slate-500 mb-3">Active Rule Engines</h4>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            
            {/* Dynamically render rules from backend */}
            {rules.map((rule) => {
              const display = RULE_DISPLAY[rule.name] || { 
                label: rule.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
                desc: rule.description 
              }
              return (
                <div key={rule.name} className="flex items-center justify-between bg-soc-surface/60 p-3 rounded-md border border-soc-border/60 hover:border-soc-cyan/30 transition-colors">
                  <div>
                    <div className="text-xs font-mono font-bold tracking-wide text-slate-200 flex items-center uppercase">
                      {display.label}
                      {display.beta && (
                        <Badge variant="outline" className="ml-2 text-[9px] bg-soc-cyan/10 text-soc-cyan border-soc-cyan/30 px-1 py-0">BETA</Badge>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 mt-1">{display.desc}</p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule(rule.name, rule.enabled)}
                    disabled={updatingRule === rule.name}
                  />
                </div>
              )
            })}

            {rules.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4 font-mono uppercase tracking-widest animate-pulse">Loading rules...</p>
            )}

          </div>
        </div>

        <div className="pt-4 border-t border-soc-border/50">
          <h4 className="text-[11px] font-mono tracking-widest uppercase text-slate-500 mb-2">Manual IP Ban</h4>
          <div className="flex space-x-2">
            <input 
              type="text" 
              placeholder="e.g. 192.168.1.100" 
              value={banIp}
              onChange={(e) => setBanIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBanIp()}
              className="flex h-9 w-full rounded-sm border border-soc-border bg-soc-bg px-3 py-1 text-xs font-mono text-soc-red placeholder:text-slate-600 focus:outline-none focus:border-soc-red/60 focus:ring-1 focus:ring-soc-red/30 transition-all"
            />
            <Button 
              size="sm" 
              onClick={handleBanIp}
              className="h-9 bg-soc-red/10 hover:bg-soc-red/20 text-soc-red border border-soc-red/30 font-mono text-[10px] uppercase tracking-wider rounded-sm"
            >
              BAN IP
            </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}
