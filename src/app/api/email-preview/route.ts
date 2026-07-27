import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { wrapEmailHtml, type EmailKind } from "@/lib/server/email";

/* Renders each email template as HTML without sending anything.
   Email templates are the one part of the app you cannot inspect by using it —
   the only way to see a change was to mail somebody. This makes the design
   reviewable. Guarded by CRON_SECRET because the templates reveal internal
   structure and this should not be an open endpoint.

   GET /api/email-preview?kind=invite   (Authorization: Bearer $CRON_SECRET)
   kinds: invite | assigned | approval | digest | plan | wrap */

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const SAMPLES: Record<string, { subject: string; kind: EmailKind; preheader: string; inner: string }> = {
  invite: {
    subject: "You're invited to join SansiWorks",
    kind: "invite",
    preheader: "Dewi Santoso invited you to the Sourcing & Trade workspace — expires in 7 days.",
    inner: `
      <p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#7A0D20;">You're invited</p>
      <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:400;font-size:28px;">Join <em>SansiWorks</em></h1>
      <p style="margin:0 0 22px;font-size:14.5px;line-height:1.6;color:#4A423D;">Dewi Santoso has invited you to join the <b>Sourcing &amp; Trade</b> workspace on SansiWorks, Sansico Group's internal work-management platform.</p>
      <a href="https://example.com/accept-invite?token=sample" style="display:inline-block;background:#7A0D20;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-size:14px;font-weight:700;">Accept invitation →</a>
      <p style="margin:22px 0 0;font-size:12px;color:#8A8078;line-height:1.6;">This invitation expires in 7 days. If the button doesn't work, copy this link into your browser:<br><span style="color:#4A423D;word-break:break-all;">https://example.com/accept-invite?token=sample</span></p>`,
  },
  assigned: {
    subject: "New task for you — Prepare Bank Mandiri LC documents",
    kind: "alert",
    preheader: "Dewi Santoso assigned you a task due 30 July.",
    inner: `
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">New task <em>for you</em>.</h2>
      <div style="border:1.5px solid #E5DFD8;border-radius:12px;padding:15px 17px;margin-bottom:14px;">
        <div style="font-size:14px;margin-bottom:4px;">Prepare Bank Mandiri LC documents</div>
        <div style="font-size:12px;color:#8A8078;">Sourcing &amp; Trade / Bank Docs · High · due 30 Jul</div>
      </div>
      <p style="margin:0;font-size:12.5px;color:#4A423D;">Assigned by Dewi Santoso.</p>`,
  },
  approval: {
    subject: "Deadline change needs your approval",
    kind: "alert",
    preheader: "Siti Rahayu asked to move a due date to 12 August.",
    inner: `
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">A deadline needs <em>your call</em>.</h2>
      <div style="border:1.5px solid #E5DFD8;border-radius:12px;padding:15px 17px;margin-bottom:14px;">
        <div style="font-size:14px;margin-bottom:4px;">ESG supplier audit — GCP facility</div>
        <div style="font-size:12px;color:#8A8078;">Requested by Siti Rahayu · 05 Aug → 12 Aug</div>
      </div>`,
  },
  digest: {
    subject: "Your day at Sansico — Monday, 27 July 2026",
    kind: "digest",
    preheader: "3 overdue, 1 due today, 12 open in total.",
    inner: `
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">Good morning, <em>Dewi</em>.</h2>
      <div style="background:#F5F2EC;border:1px solid #E5DFD8;border-radius:11px;padding:12px 16px;font-size:12.5px;line-height:1.5;margin-bottom:20px;">3 overdue, 1 due today, 12 open in total.</div>
      <div style="display:flex;gap:8px;align-items:flex-start;background:rgba(122,13,32,0.06);border:1px solid #E5DFD8;border-radius:11px;padding:11px 14px;font-size:12px;line-height:1.5;margin-bottom:18px;color:#4A423D;"><span style="color:#7A0D20;">✦</span><span><b>Sansi flags:</b> Bank Mandiri documents are 12 days overdue and blocking two other tasks.</span></div>
      <h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#8A8078;">Needs your attention</h4>
      <div style="padding:8px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;">Send Bank Mandiri trade documents <span style="float:right;color:#F3263E;font-size:11.5px;">overdue since 2026-07-14</span></div>
      <div style="padding:8px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;">Renew ISO 17025 certification <span style="float:right;color:#F3263E;font-size:11.5px;">overdue since 2026-07-17</span></div>
      <h4 style="margin:22px 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#8A8078;">Mentions &amp; replies</h4>
      <div style="padding:8px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;line-height:1.5;">Sanjeeva Gunawardena mentioned you on &quot;Review SansiWorks rollout feedback&quot; <span style="color:#8A8078;font-size:11px;">· mentioned you</span></div>`,
  },
  plan: {
    subject: "Your Monday plan — 3 things that matter today",
    kind: "digest",
    preheader: "The three tasks worth protecting time for.",
    inner: `
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">Your <em>Monday plan</em>.</h2>
      <h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#8A8078;">If you do only three things today</h4>
      <div style="padding:9px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;"><b style="display:inline-block;width:20px;height:20px;border-radius:99px;background:#7A0D20;color:#fff;font-size:10px;text-align:center;line-height:20px;margin-right:10px;">1</b>Send Bank Mandiri trade documents <span style="color:#8A8078;font-size:11px;">· Critical · due 2026-07-14</span></div>
      <div style="padding:9px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;"><b style="display:inline-block;width:20px;height:20px;border-radius:99px;background:#7A0D20;color:#fff;font-size:10px;text-align:center;line-height:20px;margin-right:10px;">2</b>Renew ISO 17025 certification <span style="color:#8A8078;font-size:11px;">· Critical · due 2026-07-17</span></div>`,
  },
  wrap: {
    subject: "Friday wrap — your week at Sansico",
    kind: "digest",
    preheader: "What slipped, and what's open going into next week.",
    inner: `
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 14px;">That's a <em>wrap</em>, Dewi.</h2>
      <div style="background:#F5F2EC;border:1px solid #E5DFD8;border-radius:11px;padding:12px 16px;font-size:12.5px;line-height:1.5;margin-bottom:14px;">12 tasks still open going into next week.</div>
      <h4 style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#8A8078;">Slipped this week</h4>
      <div style="padding:8px 0;border-bottom:1px solid #E5DFD8;font-size:12.5px;">Sign off Q3 tooling budget <span style="float:right;color:#F3263E;font-size:11.5px;">was due 2026-07-19</span></div>`,
  },
};

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const presented =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (!expected || !presented || !timingSafeEqualStr(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const kind = req.nextUrl.searchParams.get("kind") || "";
  if (kind === "list" || !SAMPLES[kind]) {
    return NextResponse.json({ available: Object.keys(SAMPLES) });
  }
  const s = SAMPLES[kind];
  const html = wrapEmailHtml(s.inner, s.kind, s.preheader);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
