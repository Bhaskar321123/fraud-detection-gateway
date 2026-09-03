"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle,
  Search,
  MessageSquareWarning,
  Link2,
  Phone,
  Mail,
  Globe,
  Brain,
  Radar,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Copy,
  Check,
  Loader2,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────
interface ScamResult {
  is_scam: boolean
  confidence_score: number
  severity: string
  detected_entities: {
    urls: string[]
    emails: string[]
    phones: string[]
    domains: string[]
  }
  threat_intel_flags: Array<{
    source: string
    url?: string
    threat_type?: string
    detections?: string
    score?: number
    error?: string
    warning?: string
  }>
  ai_analysis: {
    threat_score: number
    verdict: string
    reasoning: string
    indicators?: Array<{
      type: string
      detail: string
    }>
  }
  analysis_timestamp: string
  pipeline_metadata: {
    execution_time_ms: number
    urls_checked: number
    engines_used: {
      regex_extraction: boolean
      google_safe_browsing: boolean
      virustotal: boolean
      gemini_ai: boolean
    }
  }
}

// ── Severity Helpers ─────────────────────────────────────────────────────────
function getSeverityColor(severity: string) {
  switch (severity?.toUpperCase()) {
    case "CRITICAL":
      return { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", glow: "shadow-[0_0_20px_rgba(239,68,68,0.15)]" }
    case "HIGH":
      return { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", glow: "shadow-[0_0_20px_rgba(249,115,22,0.15)]" }
    case "MODERATE":
      return { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]" }
    case "LOW":
      return { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", glow: "shadow-[0_0_20px_rgba(59,130,246,0.15)]" }
    case "SAFE":
    default:
      return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]" }
  }
}

function getIndicatorIcon(type: string) {
  switch (type) {
    case "urgency": return "⚡"
    case "authority_spoofing": return "🏛️"
    case "financial_bait": return "💰"
    case "suspicious_link": return "🔗"
    case "grammar": return "📝"
    case "social_engineering": return "🎭"
    default: return "⚠️"
  }
}

function getIndicatorLabel(type: string) {
  switch (type) {
    case "urgency": return "Artificial Urgency"
    case "authority_spoofing": return "Authority Spoofing"
    case "financial_bait": return "Financial Bait"
    case "suspicious_link": return "Suspicious Link"
    case "grammar": return "Grammar Anomaly"
    case "social_engineering": return "Social Engineering"
    default: return type
  }
}

// ── Sample Messages ──────────────────────────────────────────────────────────
const SAMPLE_MESSAGES = [
  "URGENT! Your bank account is locked. Click http://secure-banklogin.xyz to verify now! Call +1-800-555-0199",
  "Congratulations! You've won a $1000 Amazon gift card. Claim now at http://free-prizes.top/claim",
  "Hi, this is your boss. I need you to buy 5 Google Play gift cards worth $200 each and send me the codes ASAP.",
  "Your Netflix account payment failed. Update billing at http://netflix-billing-update.com or lose access in 24hrs.",
  "Hey, are we still on for dinner tonight at 7pm? Let me know!",
]

// ── Main Component ───────────────────────────────────────────────────────────
export default function ScamCheckerPage() {
  const [text, setText] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<ScamResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [scanPhase, setScanPhase] = useState("")
  const resultRef = useRef<HTMLDivElement>(null)

  // Animated scanning phases
  useEffect(() => {
    if (!isAnalyzing) return
    const phases = [
      "Extracting entities...",
      "Querying VirusTotal...",
      "Running AI behavioral analysis...",
      "Computing threat score...",
    ]
    let i = 0
    const interval = setInterval(() => {
      setScanPhase(phases[i % phases.length])
      i++
    }, 2000)
    return () => clearInterval(interval)
  }, [isAnalyzing])

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    setIsAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/scam-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      })

      const data = await response.json()
      if (data.success) {
        setResult(data.data)
        // Scroll to results
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 100)
      } else {
        setError(data.error || "Analysis failed. Please try again.")
      }
    } catch {
      setError("Failed to connect to the Scam Analysis backend. Make sure the PHP server is running on port 8080.")
    } finally {
      setIsAnalyzing(false)
      setScanPhase("")
    }
  }

  const handleCopyResult = () => {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const severityStyle = result ? getSeverityColor(result.severity) : null

  return (
    <div className="min-h-screen bg-soc-bg text-slate-50 p-6 font-sans selection:bg-soc-cyan/30 selection:text-white relative">
      <div className="max-w-[1100px] mx-auto space-y-6 relative z-10">

        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-soc-border/40">
          <div className="flex items-center space-x-4">
            <Link href="/" className="p-2 hover:bg-soc-surface rounded-sm transition-colors text-slate-400 hover:text-soc-cyan border border-transparent hover:border-soc-cyan/30">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="bg-purple-500/10 p-2.5 rounded-sm border border-purple-500/20">
              <MessageSquareWarning className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-mono tracking-widest uppercase font-bold text-slate-200">Scam Text Scanner</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-1">AI-Powered Phishing &amp; Scam Detection Pipeline</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-md">
              <span className="flex items-center text-purple-400 font-mono text-[10px] font-semibold tracking-wider uppercase">
                <Brain className="h-3.5 w-3.5 mr-2" />
                Gemini AI + VirusTotal
              </span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left: Input Form */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-soc-surface/40 border border-soc-border/60 rounded-md p-6 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500 via-soc-cyan to-purple-500"></div>
              <h2 className="text-sm font-mono tracking-widest uppercase font-semibold flex items-center gap-2 mb-5 text-slate-200">
                <Radar className="h-4 w-4 text-purple-400" />
                Analyze Message
              </h2>

              <form onSubmit={handleAnalyze} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono tracking-widest uppercase text-slate-400 mb-2">
                    Paste Suspicious Text, Email, or SMS
                  </label>
                  <textarea
                    id="scam-text-input"
                    className="w-full bg-soc-bg border border-soc-border text-slate-200 text-xs rounded-sm px-3 py-3 focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 outline-none placeholder:text-slate-600 min-h-[180px] font-mono transition-all resize-none"
                    placeholder="Paste the suspicious message here...&#10;&#10;Example: URGENT! Your bank account is locked. Click http://secure-banklogin.xyz to verify now!"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                  />
                  <p className="text-[9px] font-mono text-slate-600 mt-1.5 tracking-wide">
                    {text.length} characters • URLs, emails, and phone numbers are auto-detected
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-soc-red/10 border border-soc-red/20 rounded-sm flex items-start gap-2 text-soc-red font-mono text-[10px] uppercase tracking-wide">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isAnalyzing || !text.trim()}
                  id="scam-analyze-btn"
                  className="w-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 disabled:bg-soc-bg disabled:text-slate-600 disabled:border-soc-border text-purple-400 font-mono uppercase tracking-widest text-xs py-3 px-4 rounded-sm transition-all flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="animate-pulse">{scanPhase || "Initializing..."}</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3.5 w-3.5" /> Analyze for Scams
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Quick Samples */}
            <div className="bg-soc-surface/40 border border-soc-border/60 rounded-md p-4 shadow-lg">
              <h3 className="text-[10px] font-mono tracking-widest uppercase text-slate-500 mb-3">Quick Test Samples</h3>
              <div className="space-y-2">
                {SAMPLE_MESSAGES.map((msg, i) => (
                  <button
                    key={i}
                    onClick={() => setText(msg)}
                    className="w-full text-left p-2.5 bg-soc-bg/50 hover:bg-soc-bg border border-soc-border/30 hover:border-purple-500/30 rounded-sm transition-all group"
                  >
                    <p className="text-[10px] font-mono text-slate-400 group-hover:text-slate-300 line-clamp-2 leading-relaxed">
                      {msg}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Results Panel */}
          <div className="lg:col-span-3" ref={resultRef}>
            <div className="bg-soc-surface/40 border border-soc-border/60 rounded-md p-6 relative overflow-hidden shadow-lg min-h-[400px]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-mono tracking-widest uppercase font-semibold flex items-center gap-2 text-slate-200">
                  <Shield className="h-4 w-4 text-purple-400" />
                  Threat Analysis Report
                </h2>
                {result && (
                  <button
                    onClick={handleCopyResult}
                    className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 hover:text-soc-cyan transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied!" : "Copy JSON"}
                  </button>
                )}
              </div>

              {!result && !isAnalyzing ? (
                <div className="h-[300px] flex flex-col items-center justify-center text-slate-500 bg-soc-bg/50 rounded-md border border-dashed border-soc-border/50">
                  <MessageSquareWarning className="h-12 w-12 opacity-15 mb-4 text-purple-400" />
                  <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Paste a message &amp; click analyze</p>
                  <p className="text-[9px] font-mono text-slate-600 mt-1">Powered by VirusTotal + Gemini AI</p>
                </div>
              ) : isAnalyzing ? (
                <div className="h-[300px] flex flex-col items-center justify-center">
                  {/* Scanning Animation */}
                  <div className="relative mb-6">
                    <div className="h-16 w-16 rounded-full border-2 border-purple-500/30 flex items-center justify-center">
                      <div className="h-12 w-12 rounded-full border-2 border-purple-500/50 flex items-center justify-center animate-pulse">
                        <Radar className="h-6 w-6 text-purple-400 animate-spin" style={{ animationDuration: "3s" }} />
                      </div>
                    </div>
                    <div className="absolute inset-0 h-16 w-16 rounded-full border-2 border-transparent border-t-purple-500 animate-spin" style={{ animationDuration: "1.5s" }}></div>
                  </div>
                  <p className="text-[11px] font-mono text-purple-400 tracking-widest uppercase animate-pulse">{scanPhase || "Initializing pipeline..."}</p>
                  <p className="text-[9px] font-mono text-slate-600 mt-2">This may take 5-15 seconds</p>
                </div>
              ) : result && severityStyle ? (
                <div className="space-y-5">

                  {/* Verdict Banner */}
                  <div className={`${severityStyle.bg} ${severityStyle.border} ${severityStyle.glow} border rounded-md p-5 flex items-start gap-4`}>
                    <div className={`${severityStyle.bg} p-3 rounded-lg border ${severityStyle.border}`}>
                      {result.is_scam ? (
                        <ShieldX className={`h-7 w-7 ${severityStyle.text}`} />
                      ) : (
                        <ShieldCheck className="h-7 w-7 text-emerald-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className={`text-lg font-bold ${severityStyle.text}`}>
                          {result.is_scam ? "Scam Detected!" : "Message Appears Safe"}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${severityStyle.bg} ${severityStyle.border} ${severityStyle.text} border`}>
                          {result.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {result.ai_analysis.reasoning || (result.is_scam ? "Multiple threat indicators were detected in this message." : "No significant threat indicators found.")}
                      </p>
                    </div>
                  </div>

                  {/* Scores Row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-soc-bg border border-soc-border/50 rounded-md p-3 text-center">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">Confidence</p>
                      <p className={`text-2xl font-mono font-bold ${severityStyle.text}`}>{result.confidence_score}%</p>
                    </div>
                    <div className="bg-soc-bg border border-soc-border/50 rounded-md p-3 text-center">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">AI Score</p>
                      <p className={`text-2xl font-mono font-bold ${result.ai_analysis.threat_score >= 75 ? "text-red-400" : result.ai_analysis.threat_score >= 40 ? "text-amber-400" : "text-emerald-400"}`}>
                        {result.ai_analysis.threat_score}
                      </p>
                    </div>
                    <div className="bg-soc-bg border border-soc-border/50 rounded-md p-3 text-center">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">AI Verdict</p>
                      <p className={`text-sm font-mono font-bold ${result.ai_analysis.verdict === "CRITICAL" ? "text-red-400" : result.ai_analysis.verdict === "HIGH_RISK" ? "text-orange-400" : result.ai_analysis.verdict === "SAFE" ? "text-emerald-400" : "text-amber-400"}`}>
                        {result.ai_analysis.verdict}
                      </p>
                    </div>
                  </div>

                  {/* Detected Entities */}
                  {(result.detected_entities.urls.length > 0 || result.detected_entities.emails.length > 0 || result.detected_entities.phones.length > 0 || result.detected_entities.domains.length > 0) && (
                    <div>
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-soc-cyan mb-3 border-b border-soc-cyan/20 pb-2">
                        Extracted Entities
                      </h3>
                      <div className="space-y-2">
                        {result.detected_entities.urls.map((url, i) => (
                          <div key={`url-${i}`} className="flex items-center gap-2 p-2 bg-soc-bg rounded border border-soc-border/30">
                            <Link2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                            <span className="text-[10px] font-mono text-slate-300 break-all">{url}</span>
                          </div>
                        ))}
                        {result.detected_entities.emails.map((email, i) => (
                          <div key={`email-${i}`} className="flex items-center gap-2 p-2 bg-soc-bg rounded border border-soc-border/30">
                            <Mail className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span className="text-[10px] font-mono text-slate-300 break-all">{email}</span>
                          </div>
                        ))}
                        {result.detected_entities.phones.map((phone, i) => (
                          <div key={`phone-${i}`} className="flex items-center gap-2 p-2 bg-soc-bg rounded border border-soc-border/30">
                            <Phone className="h-3.5 w-3.5 text-green-400 shrink-0" />
                            <span className="text-[10px] font-mono text-slate-300">{phone}</span>
                          </div>
                        ))}
                        {result.detected_entities.domains.map((domain, i) => (
                          <div key={`domain-${i}`} className="flex items-center gap-2 p-2 bg-soc-bg rounded border border-soc-border/30">
                            <Globe className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="text-[10px] font-mono text-slate-300">{domain}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Indicators */}
                  {result.ai_analysis.indicators && result.ai_analysis.indicators.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-purple-400 mb-3 border-b border-purple-500/20 pb-2">
                        <span className="flex items-center gap-2"><Brain className="h-3.5 w-3.5" /> AI-Detected Indicators</span>
                      </h3>
                      <div className="space-y-2">
                        {result.ai_analysis.indicators.map((ind, i) => (
                          <div key={i} className="p-3 bg-soc-bg border border-soc-border/30 rounded-md">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{getIndicatorIcon(ind.type)}</span>
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400">
                                {getIndicatorLabel(ind.type)}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 ml-6">{ind.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Threat Intel Flags */}
                  {result.threat_intel_flags.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-soc-cyan mb-3 border-b border-soc-cyan/20 pb-2">
                        Threat Intelligence Sources
                      </h3>
                      <div className="space-y-2">
                        {result.threat_intel_flags.map((flag, i) => (
                          <div key={i} className="p-3 bg-soc-bg border border-soc-border/30 rounded-md">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-soc-cyan">
                                {flag.source === "google_safe_browsing" ? "Google Safe Browsing" :
                                 flag.source === "virustotal" ? "VirusTotal" : flag.source}
                              </span>
                              {flag.threat_type && (
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  flag.threat_type === "MALICIOUS" ? "bg-soc-red/10 text-soc-red border-soc-red/20" :
                                  flag.threat_type === "SUSPICIOUS" ? "bg-soc-amber/10 text-soc-amber border-soc-amber/20" :
                                  "bg-soc-green/10 text-soc-green border-soc-green/20"
                                }`}>
                                  {flag.threat_type}
                                </span>
                              )}
                            </div>
                            {flag.detections && <p className="text-[10px] font-mono text-slate-400">{flag.detections}</p>}
                            {flag.error && <p className="text-[10px] font-mono text-slate-500 italic">{flag.error}</p>}
                            {flag.url && <p className="text-[9px] font-mono text-slate-600 mt-1 break-all">{flag.url}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pipeline Metadata Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-widest text-slate-600 pt-4 border-t border-soc-border/50">
                    <span>Pipeline: {result.pipeline_metadata.execution_time_ms.toFixed(0)}ms</span>
                    <span>URLs Checked: {result.pipeline_metadata.urls_checked}</span>
                    <span>{result.analysis_timestamp}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
