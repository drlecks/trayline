import { describe, it, expect } from 'vitest'
import { detectPermissionPrompt, permissionPromptResponse } from './claude-code'

describe('detectPermissionPrompt', () => {
  it('returns true for [y/N] style prompts', () => {
    expect(detectPermissionPrompt('Allow network access? [y/N] ')).toBe(true)
    expect(detectPermissionPrompt('Do you want to proceed? [Y/n]')).toBe(true)
    expect(detectPermissionPrompt('[y/N]')).toBe(true)
  })

  it('returns true for TUI numbered-choice prompts', () => {
    expect(detectPermissionPrompt('╭─────────────────────────╮\n│ Claude wants to use Bash │\n╰── 1. Yes │ 2. No ───────╯')).toBe(true)
    expect(detectPermissionPrompt('1. Yes, run once  │  2. No (tell Claude)  │  3. Always')).toBe(true)
  })

  it('returns false for normal output', () => {
    expect(detectPermissionPrompt('Processing card data...')).toBe(false)
    expect(detectPermissionPrompt('{"summary":"ok","fields":{}}')).toBe(false)
    expect(detectPermissionPrompt('')).toBe(false)
    expect(detectPermissionPrompt('Running step 1 of 3')).toBe(false)
  })

  it('strips ANSI escape codes before matching', () => {
    // ANSI-wrapped [y/N] prompt
    expect(detectPermissionPrompt('\x1B[32mAllow this? [y/N]\x1B[0m')).toBe(true)
    // ANSI-wrapped normal output
    expect(detectPermissionPrompt('\x1B[32mDone.\x1B[0m')).toBe(false)
  })

  it('matches case-insensitively', () => {
    expect(detectPermissionPrompt('Proceed? [Y/N]')).toBe(true)
    expect(detectPermissionPrompt('1. yes  2. no')).toBe(true)
  })
})

describe('permissionPromptResponse', () => {
  it('returns "y\\n" for [y/N] style prompts', () => {
    expect(permissionPromptResponse('Continue? [y/N] ')).toBe('y\n')
    expect(permissionPromptResponse('[Y/n]')).toBe('y\n')
  })

  it('returns "1\\n" for TUI numbered-choice prompts', () => {
    expect(permissionPromptResponse('1. Yes, proceed  │  2. No')).toBe('1\n')
  })
})
