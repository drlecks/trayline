import { describe, it, expect } from 'vitest'
import { adapterRegistry } from './registry'
import { mockAdapter, setMockScript } from './mock'

describe('adapterRegistry', () => {
  it('returns the claude-code adapter by id', () => {
    const a = adapterRegistry.get('claude-code')
    expect(a).not.toBeNull()
    expect(a?.id).toBe('claude-code')
    expect(a?.displayName).toBe('Claude Code')
  })

  it('returns the mock adapter by id', () => {
    const a = adapterRegistry.get('mock')
    expect(a).not.toBeNull()
    expect(a?.id).toBe('mock')
  })

  it('returns null for an unknown adapter', () => {
    expect(adapterRegistry.get('does-not-exist')).toBeNull()
  })

  it('lists all registered adapters', () => {
    const ids = adapterRegistry.list().map((a) => a.id)
    expect(ids).toContain('claude-code')
    expect(ids).toContain('mock')
  })
})

describe('mockAdapter', () => {
  it('detects as installed and reports a version', async () => {
    expect(await mockAdapter.detectInstalled()).toBe(true)
    expect(await mockAdapter.getVersion()).toBe('0.0.0-mock')
  })

  it('returns scripted output from spawn().result()', async () => {
    setMockScript({ output: { summary: 'unit-test', fields: { ok: true } }, exitCode: 0 })

    const session = await mockAdapter.spawn({
      processFile: '/tmp/process.md',
      cardData: { foo: 'bar' },
      contextPacks: [],
      workingDir: '/tmp',
      timeout: 1000,
    })

    expect(session.pid).toBe(-1)

    const result = await session.result()
    expect(result.exitCode).toBe(0)
    expect(result.output).toEqual({ summary: 'unit-test', fields: { ok: true } })
  })
})
