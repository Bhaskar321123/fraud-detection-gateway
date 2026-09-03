"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Database } from "lucide-react"

interface AuditLog {
  id: number
  created_at: string
  client_ip: string
  country: string
  city: string
  path: string
  risk_score: number
  action: string
  rule_results: any[]
  request_meta: any
}

function InspectorModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const formatLocation = (l: AuditLog) => {
    if (!l.country) return "Unknown"
    if (!l.city) return l.country
    return `${l.country}, ${l.city}`
  }

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-soc-bg/90 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <Card className="w-full max-w-3xl shadow-[0_0_50px_rgba(6,182,212,0.1)] border-soc-cyan/30 bg-soc-surface/95 max-h-[90vh] flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-soc-cyan"></div>
        <CardHeader className="border-b border-soc-border/60 pb-4 flex-shrink-0">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm font-mono tracking-widest text-slate-200 uppercase flex items-center">
              <span className="bg-soc-cyan/20 text-soc-cyan px-2 py-0.5 rounded mr-3 text-xs border border-soc-cyan/30">REQ #{log.id}</span>
              Security Inspection
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-soc-red hover:bg-soc-red/10 h-8 w-8 rounded-sm">✕</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6 overflow-y-auto font-mono text-sm">
          
          <div className="grid grid-cols-2 gap-4 bg-soc-bg/50 p-4 rounded-md border border-soc-border/50">
            <div><span className="text-[10px] uppercase tracking-widest text-slate-500 block mb-1">IP Address</span> <span className="text-soc-cyan font-semibold">{log.client_ip}</span></div>
            <div><span className="text-[10px] uppercase tracking-widest text-slate-500 block mb-1">Location</span> <span className="text-slate-300">{formatLocation(log)}</span></div>
            <div><span className="text-[10px] uppercase tracking-widest text-slate-500 block mb-1">Endpoint</span> <span className="text-slate-300 truncate block">{log.path}</span></div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 block mb-1">Action Taken</span> 
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border inline-block ${log.action === 'blocked' ? 'bg-soc-red/20 border-soc-red/30 text-soc-red' : log.action === 'warned' ? 'bg-soc-amber/20 border-soc-amber/30 text-soc-amber' : 'bg-soc-green/10 border-soc-green/20 text-soc-green'}`}>
                {log.action}
              </span>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-mono tracking-widest uppercase text-soc-cyan mb-3 border-b border-soc-cyan/20 pb-2">Risk Evaluation</h4>
            <div className="space-y-2 mt-3">
              {log.rule_results.map((rule: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center bg-soc-surface/50 p-2.5 rounded border border-soc-border/40">
                  <span className="text-slate-200 text-xs font-semibold uppercase tracking-wider">{rule.rule}</span>
                  <div className="flex items-center space-x-4">
                    <span className="text-slate-400 text-[10px] uppercase tracking-wide truncate max-w-[250px]">{rule.reason}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.score > 0 ? "bg-soc-red/10 text-soc-red border border-soc-red/20" : "bg-soc-green/10 text-soc-green border border-soc-green/20"}`}>+{rule.score}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center p-3 mt-3 bg-soc-bg border border-soc-border/50 rounded">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Total Score</span>
                <span className={`text-lg font-bold ${log.risk_score >= 80 ? 'text-soc-red' : log.risk_score >= 50 ? 'text-soc-amber' : 'text-soc-green'}`}>{log.risk_score}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-mono tracking-widest uppercase text-soc-cyan mb-3 border-b border-soc-cyan/20 pb-2">Request Telemetry</h4>
            <pre className="bg-soc-bg p-4 rounded-md border border-soc-border/50 text-soc-cyan/70 font-mono text-[10px] overflow-x-auto leading-relaxed">
              {JSON.stringify(log.request_meta, null, 2)}
            </pre>
          </div>

        </CardContent>
      </Card>
    </div>,
    document.body
  )
}

export function AuditLogTable({ siteId }: { siteId?: string | null }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const url = siteId
          ? `/api/v1/admin/logs?limit=50&siteId=${siteId}`
          : '/api/v1/admin/logs?limit=50'
        const res = await fetch(url)
        const json = await res.json()
        if (json.success && json.data?.logs) {
          setLogs(json.data.logs)
        }
      } catch (err) {
        console.error("Failed to fetch audit logs", err)
      }
    }
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [siteId])

  const getPrimaryViolation = (log: AuditLog) => {
    if (!log.rule_results || log.rule_results.length === 0) return "None"
    const sorted = [...log.rule_results].sort((a, b) => b.score - a.score)
    return sorted[0].rule
  }

  const formatLocation = (log: AuditLog) => {
    if (!log.country) return "Unknown"
    if (!log.city) return log.country
    return `${log.country}, ${log.city}`
  }

  return (
    <>
      <Card className="flex flex-col h-[500px] bg-soc-surface/40 border-soc-border/60 shadow-lg relative overflow-hidden">
        <CardHeader className="flex-shrink-0 pb-4 border-b border-soc-border/40">
          <CardTitle className="text-sm font-mono tracking-widest text-slate-200 uppercase flex items-center">
            <Database className="h-4 w-4 text-soc-cyan mr-2" />
            Security Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0 m-4 border border-soc-border/50 rounded-md bg-soc-bg shadow-inner">
          <div className="h-full overflow-y-auto">
            <table className="w-full text-xs text-left font-mono">
              <thead className="bg-soc-surface/80 text-slate-400 border-b border-soc-border/80 sticky top-0 backdrop-blur-md z-10 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Timestamp</th>
                  <th className="px-4 py-3 font-semibold">IP Address</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Endpoint</th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Rule Triggered</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-soc-border/40">
                {logs.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-500 uppercase tracking-widest animate-pulse">No logs found.</td></tr>
                )}
                {logs.map((log) => {
                  const isBlocked = log.action === 'blocked'
                  const isWarned = log.action === 'warned'
                  const statusBg = isBlocked ? 'bg-soc-red/5' : isWarned ? 'bg-soc-amber/5' : ''
                  
                  return (
                    <tr key={log.id} className={`hover:bg-soc-cyan/5 transition-colors ${statusBg} group`}>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-soc-cyan font-semibold tracking-wide">{log.client_ip}</td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap truncate max-w-[120px]">{formatLocation(log)}</td>
                      <td className="px-4 py-2.5 text-slate-300 truncate max-w-[150px]">{log.path}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold flex items-center ${log.risk_score >= 80 ? "text-soc-red" : log.risk_score >= 50 ? "text-soc-amber" : "text-soc-green"}`}>
                          {log.risk_score.toString().padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {log.risk_score > 0 ? (
                          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border truncate max-w-[120px] inline-block ${isBlocked ? 'bg-soc-red/10 border-soc-red/20 text-soc-red' : 'bg-soc-amber/10 border-soc-amber/20 text-soc-amber'}`}>
                            {getPrimaryViolation(log)}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)} className="h-6 px-2 text-[10px] uppercase tracking-wider text-slate-400 hover:text-soc-cyan hover:bg-soc-cyan/10 rounded-sm">Inspect</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Portal-based modal — renders at document.body, above everything */}
      {selectedLog && (
        <InspectorModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </>
  )
}
