import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001/api/v1/admin';

async function proxyRequest(req: NextRequest, paramsPromise: Promise<{ slug: string[] }>) {
  try {
    const resolvedParams = await paramsPromise;
    const path = resolvedParams.slug.join('/');
    
    const url = new URL(req.url);
    const targetUrl = `${BACKEND_URL}/${path}${url.search}`;

    const headers = new Headers();
    // Only forward safe headers
    if (req.headers.has('content-type')) {
      headers.set('content-type', req.headers.get('content-type') as string);
    }
    if (req.headers.has('authorization')) {
      headers.set('authorization', req.headers.get('authorization') as string);
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = await req.text();
      if (body) {
        fetchOptions.body = body;
      }
    }

    const response = await fetch(targetUrl, fetchOptions);
    
    const data = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch {
      return new NextResponse(data, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') || 'text/plain' }
      });
    }

    return NextResponse.json(jsonData, { status: response.status });
  } catch (error: any) {
    console.error('[API Proxy Error]', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to connect to real backend on port 3001' }, 
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  return proxyRequest(req, params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  return proxyRequest(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  return proxyRequest(req, params);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  return proxyRequest(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  return proxyRequest(req, params);
}
