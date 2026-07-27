// Brevo transactional email. Five kinds: invite, instant alert, daily digest,
// Monday plan (08:00 WIB), Friday wrap (Fri 15:00 WIB).
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

/* Sender comes from config so production can send as the company domain.
   The fallback is a personal Gmail, which is fine for local testing but wrong
   in production: SPF/DKIM can't align with sansico.com, so mail is far more
   likely to be filtered, and "SansiWorks <someone's-personal-gmail>" is exactly
   the shape of a phishing message staff are told to distrust.
   Set EMAIL_FROM (and optionally EMAIL_FROM_NAME) to e.g. noreply@sansico.com. */
const SENDER = {
  name: process.env.EMAIL_FROM_NAME || "SansiWorks",
  email: process.env.EMAIL_FROM || "sanjeeva.gunawardena@gmail.com",
};

const STRIP = `<div style="display:flex;height:4px;border-radius:99px;overflow:hidden;margin-bottom:18px;"><span style="flex:1;background:#7A0D20;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#22409E;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#0D4F31;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#F3263E;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#BDDA5F;display:inline-block;height:4px;width:20%"></span></div>`;

/* The footer used to read "You're receiving this because your digest is on ·
   Manage preferences in SansiWorks" on EVERY email — including the invitation,
   which goes to someone who has no account and no digest to speak of. The
   footer now matches the reason the message was actually sent. */
export type EmailKind = "invite" | "alert" | "digest";

const FOOTER: Record<EmailKind, string> = {
  invite: "You were invited to SansiWorks by a colleague at Sansico Group. If you weren't expecting this, you can ignore this email · Sansico Group, Jakarta",
  alert: "You're receiving this because you're involved in this task · Change what you're notified about in SansiWorks → Settings · Sansico Group, Jakarta",
  digest: "You're receiving your SansiWorks digest · Change how often in SansiWorks → Settings · Sansico Group, Jakarta",
};

export function wrapEmailHtml(inner: string, kind: EmailKind = "digest", preheader?: string): string {
  /* charset is declared explicitly: these templates are full of em-dashes and
     typographic quotes, and without it some clients (notably older Outlook)
     render them as mojibake.
     The preheader is the grey line clients show next to the subject in the
     inbox list; with nothing there they fall back to scraping the first visible
     text, which here is the colour strip and reads as empty. */
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
  <body style="margin:0;background:#FAF8F4;padding:24px 0;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E5DFD8;border-radius:14px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#17120F;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#7A0D20;">
      <tr>
        <td style="padding:20px 28px;" align="left">
          <span style="font-weight:800;letter-spacing:0.08em;font-size:13px;color:#fff;">SANSICO</span>
          <span style="font-style:italic;font-size:14px;color:rgba(255,255,255,0.85);font-family:Georgia,serif;"> Group</span>
        </td>
        <td style="padding:20px 28px;" align="right">
          <span style="font-size:12px;color:rgba(255,255,255,0.85);">SansiWorks</span>
        </td>
      </tr>
    </table>
    <div style="padding:26px 28px;">${STRIP}${inner}
      <p style="margin:26px 0 0;font-size:10.5px;color:#8A8078;text-align:center;line-height:1.6;">${FOOTER[kind]}</p>
    </div>
  </div></body></html>`;
}

/** Crude HTML→text for the plain-text part. */
function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<div style="display:none[\s\S]*?<\/div>/gi, "")  // drop the preheader
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|div|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map((l) => l.trim()).join("\n")
    .trim();
}

export async function sendEmail(to: { email: string; name?: string }, subject: string, html: string): Promise<boolean> {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.log(`[email:stub] to=${to.email} subject="${subject}"`);
    return false;
  }
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    // textContent matters for deliverability: HTML-only mail scores worse with
    // spam filters, and some clients (and screen readers) prefer the text part.
    body: JSON.stringify({ sender: SENDER, to: [to], subject, htmlContent: html, textContent: toPlainText(html) }),
  });
  if (!res.ok) console.error("Brevo error", res.status, await res.text());
  return res.ok;
}
