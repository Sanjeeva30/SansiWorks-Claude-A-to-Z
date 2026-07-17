// Brevo transactional email helpers — the ONLY four emails this app sends:
// Daily digest, Monday plan (Mon 08:00 WIB), Friday wrap (Fri 15:00 WIB), Instant alerts.
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "SansiWorks", email: "sanjeeva.gunawardena@gmail.com" };
const STRIP = `<div style="display:flex;height:4px;border-radius:99px;overflow:hidden;margin-bottom:18px;"><span style="flex:1;background:#7A0D20;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#22409E;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#0D4F31;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#F3263E;display:inline-block;height:4px;width:20%"></span><span style="flex:1;background:#BDDA5F;display:inline-block;height:4px;width:20%"></span></div>`;

export function wrapEmailHtml(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#FAF8F4;padding:24px 0;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E5DFD8;border-radius:14px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#17120F;">
    <div style="background:#7A0D20;padding:20px 28px;">
      <span style="font-weight:800;letter-spacing:0.08em;font-size:13px;color:#fff;">SANSICO</span>
      <span style="font-style:italic;font-size:14px;color:rgba(255,255,255,0.85);font-family:Georgia,serif;"> Group</span>
      <span style="float:right;font-size:12px;color:rgba(255,255,255,0.85);">SansiWorks</span>
    </div>
    <div style="padding:26px 28px;">${STRIP}${inner}
      <p style="margin:26px 0 0;font-size:10.5px;color:#9A918A;text-align:center;">You're receiving this because your digest is on · Manage preferences in SansiWorks · Sansico Group, Jakarta</p>
    </div>
  </div></body></html>`;
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
    body: JSON.stringify({ sender: SENDER, to: [to], subject, htmlContent: html }),
  });
  if (!res.ok) console.error("Brevo error", res.status, await res.text());
  return res.ok;
}
