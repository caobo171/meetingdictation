import 'server-only';

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Mail goes out through Amazon SES (v2) with WELE's account and keys, from meetingdictation@wele-learn.com. That address
 * has no SES identity of its own, so SES signs it as the verified wele-learn.com domain, whose DKIM and custom MAIL FROM
 * (plunk.wele-learn.com) both align. Every message carries a text/plain part next to the HTML, since HTML-only mail
 * scores as spam.
 *
 * Without SES keys (local development) nothing is sent: the message is printed to the server console instead.
 */

const FROM = process.env.MAIL_FROM || 'MeetingDictation <meetingdictation@wele-learn.com>';
const REPLY_TO = process.env.MAIL_REPLY_TO;

let client: SESv2Client | null | undefined;

function ses(): SESv2Client | null {
  if (client !== undefined) return client;
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY;
  const secretAccessKey = process.env.AWS_SES_SECRET_KEY;
  client =
    accessKeyId && secretAccessKey
      ? new SESv2Client({ region: process.env.AWS_REGION || 'ap-southeast-1', credentials: { accessKeyId, secretAccessKey } })
      : null;
  return client;
}

export type Mail = { to: string; subject: string; html: string; text: string };

/** Sends one message. Returns false (and logs) when SES refuses it; never throws. */
export async function sendMail({ to, subject, html, text }: Mail): Promise<boolean> {
  const c = ses();
  if (!c) {
    console.log(`[mail] SES not configured, not sending.\n  to: ${to}\n  subject: ${subject}\n${text}`);
    return true;
  }
  try {
    const res = await c.send(
      new SendEmailCommand({
        FromEmailAddress: FROM,
        Destination: { ToAddresses: [to] },
        ReplyToAddresses: REPLY_TO ? [REPLY_TO] : undefined,
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Text: { Data: text, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
          },
        },
      }),
    );
    console.log('[mail] sent', JSON.stringify({ to, subject: subject.replace(/\d{6}/g, '******'), id: res.MessageId }));
    return true;
  } catch (e) {
    const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error('[mail] FAILED', JSON.stringify({ to, name: err.name, message: err.message, status: err.$metadata?.httpStatusCode }));
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The sign-in code message. Colours follow the site: warm paper, deep ink, MeetingDictation indigo. */
export function loginCodeMail(to: string, code: string, minutes: number): Mail {
  const subject = `Your MeetingDictation sign-in code is ${code}`;
  const text = [
    `Your MeetingDictation sign-in code is ${code}`,
    '',
    `Type it on the sign-in page. It works once and expires in ${minutes} minutes.`,
    '',
    'If you did not ask for it, you can ignore this email: nobody can sign in without the code.',
  ].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;background:#f7f4ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e7e2d8;border-radius:14px;padding:32px">
<tr><td style="font-size:17px;font-weight:700;letter-spacing:-0.01em">Meeting<span style="color:#5b5bd6">Dictation</span></td></tr>
<tr><td style="padding-top:24px;font-size:15px;line-height:1.5">Here is your sign-in code:</td></tr>
<tr><td style="padding:14px 0 6px">
<div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f0fd;color:#3e3ea8;border-radius:10px;padding:14px 0;text-align:center">${esc(code)}</div>
</td></tr>
<tr><td style="padding-top:12px;font-size:14px;line-height:1.5;color:#5c5a6b">Type it on the sign-in page. It works once and expires in ${minutes} minutes.</td></tr>
<tr><td style="padding-top:20px;font-size:12px;line-height:1.5;color:#8a8798">Sent to ${esc(to)}. If you did not ask for this code, ignore this email: nobody can sign in without it.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { to, subject, html, text };
}
