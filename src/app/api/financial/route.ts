import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getUpstreamBaseUrl() {
  const baseUrl =
    process.env.FINANCIAL_API_URL ?? process.env.NEXT_PUBLIC_FINANCIAL_API_URL;

  if (!baseUrl) {
    throw new Error(
      "Financial API belum dikonfigurasi. Isi FINANCIAL_API_URL atau NEXT_PUBLIC_FINANCIAL_API_URL.",
    );
  }

  return baseUrl;
}

async function proxyToAppsScript(
  input: string,
  init?: RequestInit,
) {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const upstreamUrl = new URL(getUpstreamBaseUrl());

    request.nextUrl.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.set(key, value);
    });

    return await proxyToAppsScript(upstreamUrl.toString(), {
      method: "GET",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Proxy GET gagal.",
        data: null,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    return await proxyToAppsScript(getUpstreamBaseUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Proxy POST gagal.",
        data: null,
      },
      { status: 500 },
    );
  }
}
