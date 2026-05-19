import nodemailer from 'nodemailer'
import { credentialService } from './credential-service'
import type { SmtpCredential } from '../../shared/types'

export interface ResolvedSmtpOpts {
  to: string
  subject: string
  body: string
}

function hasHtmlTags(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

export async function sendEmail(credential: SmtpCredential, opts: ResolvedSmtpOpts): Promise<void> {
  const password = await credentialService.getPassword(credential.id)

  const transport = nodemailer.createTransport({
    host: credential.host,
    port: credential.port,
    secure: credential.secure,
    auth: { user: credential.username, pass: password },
  })

  const isHtml = hasHtmlTags(opts.body)

  await transport.sendMail({
    from: credential.from_name
      ? `"${credential.from_name}" <${credential.from_address}>`
      : credential.from_address,
    to: opts.to,
    subject: opts.subject,
    text: isHtml ? opts.body.replace(/<[^>]+>/g, '') : opts.body,
    html: isHtml ? opts.body : undefined,
  })
}

export async function testSmtpCredential(credential: SmtpCredential): Promise<{ ok: boolean; error?: string }> {
  let password: string
  try { password = await credentialService.getPassword(credential.id) }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }

  const transport = nodemailer.createTransport({
    host: credential.host,
    port: credential.port,
    secure: credential.secure,
    auth: { user: credential.username, pass: password },
  })

  try {
    await transport.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
