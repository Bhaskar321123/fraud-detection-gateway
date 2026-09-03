"use client"

import { useState, useCallback } from "react"
import { MetricsHeader } from "@/components/MetricsHeader"
import { AnalyticsCharts } from "@/components/AnalyticsCharts"
import { LiveThreatFeed } from "@/components/LiveThreatFeed"
import { AuditLogTable } from "@/components/AuditLogTable"
import { WAFControls } from "@/components/WAFControls"
import { SiteManager } from "@/components/SiteManager"
import { SiteFilter } from "@/components/SiteFilter"
import { Shield, Search, MessageSquareWarning } from "lucide-react"
import Link from "next/link"

interface SiteOption {
  siteId: string
  name: string
}

export default function Dashboard() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [sites, setSites] = useState<SiteOption[]>([])

  const handleSitesChange = useCallback((updatedSites: any[]) => {
    setSites(updatedSites.map((s) => ({ siteId: s.siteId, name: s.name })))
  }, [])

  return (
    <div className="min-h-screen bg-soc-bg text-slate-50 p-6 font-sans selection:bg-soc-cyan/30 selection:text-soc-cyan">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* Command Header Section */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-soc-border/80">
          <div className="flex items-center space-x-4">
            <div className="bg-soc-cyan/10 p-2.5 rounded-md border border-soc-cyan/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] relative">
              <div className="absolute inset-0 bg-soc-cyan/20 blur-xl rounded-full"></div>
              <Shield className="h-7 w-7 text-soc-cyan relative z-10" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100">SECURITY OPERATIONS CENTER</h1>
              <p className="text-sm text-soc-cyan/80 font-mono mt-0.5 tracking-wide uppercase">Fraud Detection Gateway • Live Telemetry</p>
            </div>
          </div>
          <div className="flex items-center space-x-6 text-sm mt-4 md:mt-0">
            <Link 
              href="/checkup" 
              className="group flex items-center space-x-2 bg-soc-surface hover:bg-slate-800 text-slate-300 hover:text-soc-cyan px-4 py-2 rounded-md transition-all duration-200 border border-soc-border hover:border-soc-cyan/40 shadow-sm"
            >
              <Search className="h-4 w-4 text-slate-400 group-hover:text-soc-cyan transition-colors" />
              <span className="font-medium tracking-wide">SECURITY LAB</span>
            </Link>

            <Link 
              href="/scam-checker" 
              className="group flex items-center space-x-2 bg-soc-surface hover:bg-slate-800 text-slate-300 hover:text-purple-400 px-4 py-2 rounded-md transition-all duration-200 border border-soc-border hover:border-purple-500/40 shadow-sm"
            >
              <MessageSquareWarning className="h-4 w-4 text-slate-400 group-hover:text-purple-400 transition-colors" />
              <span className="font-medium tracking-wide">SCAM SCANNER</span>
            </Link>
            
            <div className="flex items-center bg-soc-green/10 border border-soc-green/20 px-3 py-1.5 rounded-md shadow-[0_0_10px_rgba(16,185,129,0.05)]">
              <span className="flex items-center text-soc-green font-mono text-xs font-semibold tracking-wider">
                <span className="relative flex h-2 w-2 mr-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-soc-green opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-soc-green"></span>
                </span>
                GATEWAY OPERATIONAL
              </span>
            </div>
          </div>
        </header>

        {/* Panel A: Metrics */}
        <MetricsHeader siteId={selectedSiteId} />

        {/* Site Filter Bar */}
        <SiteFilter
          sites={sites}
          selectedSiteId={selectedSiteId}
          onSelect={setSelectedSiteId}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column (Threat Feed, Site Manager & Controls) */}
          <div className="lg:col-span-4 flex flex-col space-y-6 h-full">
            <LiveThreatFeed siteId={selectedSiteId} />
            <SiteManager onSitesChange={handleSitesChange} />
            <WAFControls />
          </div>

          {/* Right Column (Audit Log & Analytics) */}
          <div className="lg:col-span-8 flex flex-col space-y-6 h-full">
            <AuditLogTable siteId={selectedSiteId} />
            <AnalyticsCharts siteId={selectedSiteId} />
          </div>

        </div>

      </div>
    </div>
  )
}
