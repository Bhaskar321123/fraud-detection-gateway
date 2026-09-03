"use client"

import { Target, XCircle } from "lucide-react"

interface SiteOption {
  siteId: string
  name: string
}

export function SiteFilter({
  sites,
  selectedSiteId,
  onSelect,
}: {
  sites: SiteOption[]
  selectedSiteId: string | null
  onSelect: (siteId: string | null) => void
}) {
  if (sites.length === 0) return null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-soc-surface/40 border border-soc-border/60 p-3 rounded-md backdrop-blur-sm shadow-sm gap-3 sm:gap-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center bg-soc-cyan/10 p-1.5 rounded-md border border-soc-cyan/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
          <Target className="h-4 w-4 text-soc-cyan" />
        </div>
        <span className="text-xs font-mono font-semibold tracking-widest text-slate-400 uppercase">Monitoring Scope</span>
      </div>
      
      <div className="flex items-center gap-3">
        <select
          value={selectedSiteId || ""}
          onChange={(e) => onSelect(e.target.value || null)}
          className="bg-soc-bg border border-soc-border rounded-sm px-3 py-1.5 text-xs sm:text-sm font-mono text-soc-cyan focus:outline-none focus:border-soc-cyan/60 focus:ring-1 focus:ring-soc-cyan/30 min-w-[240px] transition-colors appearance-none cursor-pointer"
        >
          <option value="" className="text-slate-300">[ ALL PROTECTED ASSETS ]</option>
          {sites.map((site) => (
            <option key={site.siteId} value={site.siteId} className="text-slate-300">
              {site.name}
            </option>
          ))}
        </select>
        
        {selectedSiteId && (
          <button
            onClick={() => onSelect(null)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-mono text-slate-400 hover:text-soc-red transition-colors px-2 py-1.5 rounded-sm hover:bg-soc-red/10 border border-transparent hover:border-soc-red/20"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>
    </div>
  )
}
