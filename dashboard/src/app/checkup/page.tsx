"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Shield, AlertTriangle, CheckCircle, Search, Terminal } from "lucide-react"

export default function CheckupPage() {
  const [url, setUrl] = useState("")
  const [method, setMethod] = useState("GET")
  const [body, setBody] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setIsScanning(true)
    setError(null)
    setResult(null)

    try {
      let parsedBody = null
      if (body.trim() && (method === "POST" || method === "PUT")) {
        try {
          parsedBody = JSON.parse(body)
        } catch (err) {
          setError("Invalid JSON format in the body")
          setIsScanning(false)
          return
        }
      }

      const response = await fetch("http://localhost:3000/api/v1/admin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, body: parsedBody }),
      })

      const data = await response.json()
      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error || "Failed to analyze URL")
      }
    } catch (err) {
      setError("Failed to connect to the Gateway Backend (is it running on port 3000?)")
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="min-h-screen bg-soc-bg text-slate-50 p-6 font-sans selection:bg-soc-cyan/30 selection:text-white relative">
      <div className="fixed inset-0 pointer-events-none bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20"></div>
      <div className="max-w-[1000px] mx-auto space-y-6 relative z-10">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-soc-border/40">
          <div className="flex items-center space-x-4">
            <Link href="/" className="p-2 hover:bg-soc-surface rounded-sm transition-colors text-slate-400 hover:text-soc-cyan border border-transparent hover:border-soc-cyan/30">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="bg-soc-cyan/10 p-2.5 rounded-sm border border-soc-cyan/20">
              <Shield className="h-6 w-6 text-soc-cyan" />
            </div>
            <div>
              <h1 className="text-xl font-mono tracking-widest uppercase font-bold text-slate-200">Security Analysis Lab</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-1">Manual Payload Scanning & Risk Engine Telemetry</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Scanner Form */}
          <div className="bg-soc-surface/40 border border-soc-border/60 rounded-md p-6 h-fit relative overflow-hidden shadow-lg">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-soc-cyan"></div>
            <h2 className="text-sm font-mono tracking-widest uppercase font-semibold flex items-center gap-2 mb-6 text-slate-200">
              <Terminal className="h-4 w-4 text-soc-cyan" />
              Configure Payload
            </h2>
            
            <form onSubmit={handleScan} className="space-y-5">
              <div>
                <label className="block text-[10px] font-mono tracking-widest uppercase text-slate-400 mb-2">Target URL / Path</label>
                <div className="flex rounded-sm shadow-sm">
                  <select
                    className="bg-soc-bg border border-soc-border text-soc-cyan font-mono text-xs rounded-l-sm focus:ring-soc-cyan focus:border-soc-cyan px-3 py-2.5 outline-none"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>DELETE</option>
                  </select>
                  <input
                    type="text"
                    className="flex-1 bg-soc-bg border-y border-r border-soc-border text-slate-200 font-mono text-xs rounded-r-sm px-3 py-2.5 focus:ring-1 focus:ring-soc-cyan outline-none placeholder:text-slate-600 transition-colors"
                    placeholder="e.g. /api/search?q=DROP TABLE"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
              </div>

              {(method === "POST" || method === "PUT") && (
                <div>
                  <label className="block text-[10px] font-mono tracking-widest uppercase text-slate-400 mb-2">JSON Body (Optional)</label>
                  <textarea
                    className="w-full bg-soc-bg border border-soc-border text-slate-200 text-xs rounded-sm px-3 py-2.5 focus:ring-1 focus:ring-soc-cyan outline-none placeholder:text-slate-600 min-h-[140px] font-mono transition-colors"
                    placeholder='{"username": "admin\" OR 1=1 --"}'
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <div className="p-3 bg-soc-red/10 border border-soc-red/20 rounded-sm flex items-start gap-2 text-soc-red font-mono text-[10px] uppercase tracking-wide">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isScanning || !url}
                className="w-full bg-soc-cyan/10 hover:bg-soc-cyan/20 border border-soc-cyan/30 disabled:bg-soc-bg disabled:text-slate-600 disabled:border-soc-border text-soc-cyan font-mono uppercase tracking-widest text-xs py-3 px-4 rounded-sm transition-all flex items-center justify-center gap-2 mt-4"
              >
                {isScanning ? (
                  <span className="animate-pulse">Analyzing Payload...</span>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5" /> Execute Scan
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Results Panel */}
          <div className="bg-soc-surface/40 border border-soc-border/60 rounded-md p-6 relative overflow-hidden shadow-lg">
            <h2 className="text-sm font-mono tracking-widest uppercase font-semibold flex items-center gap-2 mb-6 text-slate-200">
              <Shield className="h-4 w-4 text-soc-cyan" />
              Risk Evaluation Results
            </h2>

            {!result ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-slate-500 bg-soc-bg/50 rounded-md border border-dashed border-soc-border/50">
                <Shield className="h-10 w-10 opacity-20 mb-3 text-soc-cyan" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Awaiting Payload Execution</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Threat Banner */}
                {(() => {
                  const hasPhishing = result.rules.some((r: any) => r.rule === 'url-phishing' && r.score >= 50);
                  const hasSqli = result.rules.some((r: any) => r.rule === 'sql-injection' && r.score >= 50);
                  
                  if (hasPhishing) {
                    return (
                      <div className="bg-slate-900/40 border border-red-900/50 rounded-lg p-6 flex flex-col items-center justify-center text-center space-y-3 shadow-[0_0_15px_rgba(220,38,38,0.1)]">
                        <div className="bg-red-950/50 p-4 rounded-2xl mb-1 border border-red-900/50">
                          <AlertTriangle className="h-7 w-7 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-100 tracking-tight">Warning! Potential Scam Detected</h3>
                        <div className="bg-black/40 px-4 py-1.5 rounded-full border border-slate-800 inline-block max-w-[90%] overflow-hidden text-ellipsis whitespace-nowrap">
                           <p className="text-xs font-mono text-slate-400">{url}</p>
                        </div>
                        <p className="text-sm text-slate-400 max-w-md leading-relaxed">This site was identified as malicious. It contains common scam indicators and can infect your device with viruses, worms, spyware, or other malware.</p>
                      </div>
                    );
                  }
                  
                  if (hasSqli) {
                    return (
                      <div className="bg-slate-900/40 border border-red-900/50 rounded-lg p-6 flex flex-col items-center justify-center text-center space-y-3 shadow-[0_0_15px_rgba(220,38,38,0.1)]">
                        <div className="bg-red-950/50 p-4 rounded-2xl mb-1 border border-red-900/50">
                          <Terminal className="h-7 w-7 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-100 tracking-tight">Malicious Payload Detected</h3>
                        <p className="text-sm text-slate-400 max-w-md leading-relaxed">This request contains destructive SQL injection or XSS attack patterns intended to compromise the system.</p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Score Header */}
                <div className="flex items-center justify-between p-4 bg-soc-bg border border-soc-border/50 rounded-md shadow-inner">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Total Risk Score</p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-mono font-bold ${
                        result.totalScore >= 80 ? "text-soc-red" :
                        result.totalScore >= 50 ? "text-soc-amber" : "text-soc-green"
                      }`}>
                        {result.totalScore.toString().padStart(3, '0')}
                      </span>
                    </div>
                  </div>
                  
                  <div className={`px-4 py-1.5 rounded-sm border text-[11px] font-mono uppercase tracking-widest font-bold flex items-center gap-2 ${
                    result.action === 'blocked' ? "bg-soc-red/10 border-soc-red/30 text-soc-red" :
                    result.action === 'warned' ? "bg-soc-amber/10 border-soc-amber/30 text-soc-amber" :
                    "bg-soc-green/10 border-soc-green/30 text-soc-green"
                  }`}>
                    {result.action === 'blocked' && <AlertTriangle className="h-3.5 w-3.5" />}
                    {result.action === 'warned' && <AlertTriangle className="h-3.5 w-3.5" />}
                    {result.action === 'allowed' && <CheckCircle className="h-3.5 w-3.5" />}
                    {result.action}
                  </div>
                </div>

                {/* Rules Triggered */}
                <div>
                  <h3 className="text-[11px] font-mono uppercase tracking-widest text-soc-cyan mb-3 border-b border-soc-cyan/20 pb-2">Triggered Rule Engines</h3>
                  {result.rules.filter((r: any) => r.score > 0).length === 0 ? (
                    <p className="text-xs font-mono uppercase tracking-widest text-slate-500 bg-soc-bg p-4 rounded-md border border-soc-border/50 text-center">
                      No malicious patterns detected.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {result.rules.filter((r: any) => r.score > 0).map((rule: any, i: number) => (
                        <div key={i} className="p-3 bg-soc-bg border border-soc-border/50 rounded-md shadow-inner">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-semibold text-soc-cyan text-[11px] font-mono uppercase tracking-wider">{rule.rule}</span>
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                              rule.score >= 50 ? "bg-soc-red/10 text-soc-red border-soc-red/20" : "bg-soc-amber/10 text-soc-amber border-soc-amber/20"
                            }`}>
                              +{rule.score} PTS
                            </span>
                          </div>
                          <p className="text-[10px] font-mono uppercase tracking-wide text-slate-400">{rule.reason}</p>
                          {rule.metadata?.detectedPatterns && (
                            <ul className="mt-3 text-[10px] font-mono text-soc-red bg-soc-red/5 p-2 rounded border border-soc-red/10 list-none space-y-1">
                              {rule.metadata.detectedPatterns.map((p: string, j: number) => (
                                <li key={j} className="flex items-start gap-1.5 before:content-['>'] before:text-soc-red/50"><span>{p}</span></li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="text-[9px] font-mono uppercase tracking-widest text-slate-600 flex justify-between items-center pt-4 border-t border-soc-border/50">
                  <span>Engine Evaluation Time: {result.evaluationTimeMs}ms</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
