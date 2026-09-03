import { NextRequest } from "next/server";

// Next.js App Router API route to proxy the SSE stream
// This avoids the buffering issue caused by standard rewrites in next.config.ts
// and allows us to only tunnel port 3001 without exposing port 3000 separately.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Connect to the actual backend running locally on port 3000
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001/api/v1/admin';
    const backendResponse = await fetch(`${baseUrl}/stream`, {
      headers: {
        'Accept': 'text/event-stream',
      },
      // Prevent standard fetch buffering
      cache: 'no-store',
    });

    if (!backendResponse.ok || !backendResponse.body) {
      return new Response('Error connecting to backend stream', { status: 502 });
    }

    // Pipe the raw ReadableStream from the backend directly to the client
    return new Response(backendResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (err) {
    console.error("SSE Proxy Error:", err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
