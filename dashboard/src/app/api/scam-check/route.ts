import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  console.log("[SCAM-CHECKER] Received request at Next.js API proxy")
  try {
    const body = await request.json()

    if (!body.text || typeof body.text !== "string" || body.text.trim().length === 0) {
      console.log("[SCAM-CHECKER] Error: Empty text provided")
      return NextResponse.json(
        { success: false, error: "Missing required field: \"text\"" },
        { status: 400 }
      )
    }

    console.log("[SCAM-CHECKER] Forwarding to PHP backend: http://localhost:8080/api/analyze.php")
    const phpResponse = await fetch("http://localhost:8080/api/analyze.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body.text.trim() }),
      signal: AbortSignal.timeout(120_000), // 2 minute timeout
    })

    const data = await phpResponse.json()
    console.log("[SCAM-CHECKER] Received response from PHP backend", data.success ? "SUCCESS" : "FAILED")
    
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[SCAM-CHECKER] Exception caught:", message)

    if (message.includes("timeout") || message.includes("aborted")) {
      return NextResponse.json(
        { success: false, error: "Analysis timed out. The AI pipeline took too long to respond." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { success: false, error: "Failed to connect to the PHP Scam Analysis backend. Ensure PHP is running on port 8080." },
      { status: 502 }
    )
  }
}
