import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { credentialService } from './credential-service'
import type { ImapCredential, ImapChannel } from '../../shared/types'

export interface EmailItem {
  uid: string
  messageId: string
  subject: string
  from: string
  date: string
  body_text: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchEmails(credential: ImapCredential, channel: ImapChannel): Promise<EmailItem[]> {
  const password = await credentialService.getPassword(credential.id)
  const folder = channel.folder || 'INBOX'
  const maxMessages = channel.max_messages ?? 50

  const client = new ImapFlow({
    host: credential.host,
    port: credential.port,
    secure: credential.secure,
    auth: { user: credential.username, pass: password },
    logger: false,
  })

  await client.connect()
  try {
    const lock = await client.getMailboxLock(folder)
    const items: EmailItem[] = []

    try {
      // Build search criteria
      const searchCriteria: Record<string, unknown> = {}
      if (channel.unseen_only) searchCriteria['seen'] = false

      const searchResult = await client.search(searchCriteria, { uid: true })
      const uids: number[] = Array.isArray(searchResult) ? searchResult : []
      // Take the most recent `maxMessages` UIDs
      const targetUids = uids.slice(-maxMessages)

      if (targetUids.length > 0) {
        const uidRange = targetUids.join(',')
        for await (const msg of client.fetch(uidRange, {
          uid: true,
          envelope: true,
          bodyStructure: true,
          source: true,
        }, { uid: true }) as AsyncIterable<FetchMessageObject>) {
          const envelope = msg.envelope
          if (!envelope) continue

          const subject = envelope.subject ?? ''
          const fromAddr = envelope.from?.[0]
          const from = fromAddr
            ? `${fromAddr.name ? fromAddr.name + ' ' : ''}<${fromAddr.address ?? ''}>`
            : ''
          const date = envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString()
          const messageId = envelope.messageId ?? String(msg.uid)

          // Apply optional filters
          if (channel.subject_contains && !subject.toLowerCase().includes(channel.subject_contains.toLowerCase())) continue
          if (channel.from_contains && !from.toLowerCase().includes(channel.from_contains.toLowerCase())) continue

          // Extract plain text body from raw source
          let bodyText = ''
          if (msg.source) {
            const raw = msg.source.toString('utf-8')
            // Attempt to extract text/plain part — crude but avoids a full MIME parser dep
            const plainMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\s*$)/i)
            if (plainMatch) {
              bodyText = plainMatch[1].trim()
            } else {
              const htmlMatch = raw.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\s*$)/i)
              if (htmlMatch) bodyText = stripHtml(htmlMatch[1])
            }
          }

          items.push({ uid: String(msg.uid), messageId, subject, from, date, body_text: bodyText })
        }

        // Mark messages as seen when unseen_only mode is active
        if (channel.unseen_only && items.length > 0) {
          await client.messageFlagsAdd(uidRange, ['\\Seen'], { uid: true })
        }
      }
    } finally {
      lock.release()
    }

    return items
  } finally {
    await client.logout()
  }
}

export async function testImapCredential(credential: ImapCredential): Promise<{ ok: boolean; error?: string }> {
  let password: string
  try { password = await credentialService.getPassword(credential.id) }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }

  const client = new ImapFlow({
    host: credential.host,
    port: credential.port,
    secure: credential.secure,
    auth: { user: credential.username, pass: password },
    logger: false,
  })

  try {
    await client.connect()
    await client.list()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}
