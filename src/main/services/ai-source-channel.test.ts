import { describe, it, expect } from 'vitest'
import { buildAiSourcePrompt, parseAiSourceItems, aiItemDedupId } from './ai-source-channel'

describe('parseAiSourceItems', () => {
  it('returns a bare array of objects as-is', () => {
    expect(parseAiSourceItems([{ id: 'a' }, { id: 'b' }] as unknown as object)).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('unwraps an object with an items array', () => {
    expect(parseAiSourceItems({ items: [{ id: 'a' }] })).toEqual([{ id: 'a' }])
  })

  it('treats a single object as one item', () => {
    expect(parseAiSourceItems({ title: 'x' })).toEqual([{ title: 'x' }])
  })

  it('parses a JSON string', () => {
    expect(parseAiSourceItems('[{"id":"a"}]')).toEqual([{ id: 'a' }])
  })

  it('wraps plain text as one ai_output item', () => {
    expect(parseAiSourceItems('nothing structured here')).toEqual([{ ai_output: 'nothing structured here' }])
  })

  it('returns no items for an empty array or empty string', () => {
    expect(parseAiSourceItems([] as unknown as object)).toEqual([])
    expect(parseAiSourceItems('   ')).toEqual([])
  })

  it('wraps primitive array elements in { value }', () => {
    expect(parseAiSourceItems('["a", 2]')).toEqual([{ value: 'a' }, { value: 2 }])
  })
})

describe('aiItemDedupId', () => {
  it('uses the configured key when present', () => {
    expect(aiItemDedupId({ id: 'T-1', title: 'x' }, 'id')).toBe('T-1')
  })

  it('falls back to a content hash that ignores key order', () => {
    const a = aiItemDedupId({ title: 'x', url: 'u' }, 'id')
    const b = aiItemDedupId({ url: 'u', title: 'x' }, 'id')
    expect(a).toMatch(/^sha256:/)
    expect(a).toBe(b)
  })

  it('gives different hashes for different content', () => {
    expect(aiItemDedupId({ title: 'x' }, 'id')).not.toBe(aiItemDedupId({ title: 'y' }, 'id'))
  })

  it('treats an empty key value as missing', () => {
    expect(aiItemDedupId({ id: '', title: 'x' }, 'id')).toMatch(/^sha256:/)
  })
})

describe('buildAiSourcePrompt', () => {
  it('includes the user prompt, output contract and run context', () => {
    const p = buildAiSourcePrompt('Find tenders.', {
      now: '2026-11-04T09:00:00.000Z', lastRunAt: null, dedupKey: 'id', recentSeenIds: [],
    })
    expect(p.startsWith('Find tenders.')).toBe(true)
    expect(p).toContain('JSON array')
    expect(p).toContain('"id"')
    expect(p).toContain('2026-11-04T09:00:00.000Z')
    expect(p).toContain('first run')
    expect(p).not.toContain('Already delivered')
  })

  it('lists only the 50 most recent seen IDs', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`)
    const p = buildAiSourcePrompt('x', { now: 'n', lastRunAt: 'l', dedupKey: 'id', recentSeenIds: ids })
    expect(p).toContain('id-59')
    expect(p).toContain('id-10')
    expect(p).not.toContain('id-9,')
  })
})
