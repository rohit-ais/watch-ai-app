import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const rateLimitMap = new Map();
const RATE_LIMIT_MS = 60_000;

export async function POST(request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const last = rateLimitMap.get(ip) || 0;
  const elapsed = Date.now() - last;

  if (elapsed < RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
    return NextResponse.json(
      { error: "rate_limited", retryAfter },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { domain, kids_mode, city, group_type } = body;

  if (!domain || !["entertainment", "plans"].includes(domain)) {
    return NextResponse.json({ error: "invalid_domain" }, { status: 400 });
  }

  const insertPayload = {
    mode: "group",
    status: "waiting",
    domain,
    kids_mode: kids_mode ?? false,
  };

  if (domain === "plans") {
    if (!city || !group_type) {
      return NextResponse.json(
        { error: "city and group_type required for plans" },
        { status: 400 }
      );
    }
    insertPayload.city = city;
    insertPayload.group_type = group_type.toLowerCase();
  }

  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .insert(insertPayload)
    .select()
    .single();

  if (sErr) {
    console.error("create-session error:", sErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  rateLimitMap.set(ip, Date.now());

  return NextResponse.json({ sessionId: session.id }, { status: 201 });
}