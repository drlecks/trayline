import { join, relative, extname } from 'path'
import fs from 'fs/promises'
import type { SecurityFinding, ImportProjectSummary } from '../../shared/types'

// Extensions that are valid inside a Trayline project zip
const ALLOWED_EXTENSIONS = new Set(['.json', '.md'])

interface PatternDef {
  re: RegExp
  severity: SecurityFinding['severity']
  category: SecurityFinding['category']
  description: string
}

// Patterns applied to .md file content (process instructions, context files)
const MD_PATTERNS: PatternDef[] = [
  // Critical — explicit network exfiltration
  {
    re: /\b(?:curl|wget)\s+(?:-\S+\s+)*https?:\/\/\S+/gi,
    severity: 'critical',
    category: 'exfiltration',
    description: 'Network download command targeting an external URL',
  },
  {
    re: /\b(?:exfiltrat(?:e|ing|ion)|steal\s+(?:credentials?|passwords?|tokens?|api\s+keys?|secrets?)|data\s+theft)\b/gi,
    severity: 'critical',
    category: 'exfiltration',
    description: 'Explicit data exfiltration language',
  },
  // Critical — system access
  {
    re: /(?:\/etc\/(?:passwd|shadow|sudoers|hosts)|~\/\.ssh\/|~\/\.aws\/|~\/\.config\/gnupg|\/proc\/self)/gi,
    severity: 'critical',
    category: 'system_access',
    description: 'Reference to sensitive system file or directory',
  },
  {
    re: /\b(?:bash|sh|zsh|fish|powershell|cmd\.exe)\s+-c\s+['"`]/gi,
    severity: 'critical',
    category: 'system_access',
    description: 'Shell execution command embedded in AI instructions',
  },
  // Warning — external URLs (may be legitimate documentation)
  {
    re: /https?:\/\/(?!(?:localhost|127\.0\.0\.1)(?:[:/]|$))[^\s<>"')[\]]+/gi,
    severity: 'warning',
    category: 'exfiltration',
    description: 'External URL',
  },
  // Warning — environment variable access
  {
    re: /\$(?:HOME|USER|USERNAME|PATH|SHELL|LOGNAME|PWD|TMPDIR|APPDATA|USERPROFILE|TEMP|TMP)(?=[^A-Za-z0-9_]|$)/g,
    severity: 'warning',
    category: 'system_access',
    description: 'Shell environment variable reference',
  },
  {
    re: /process\.env\.\w+/g,
    severity: 'warning',
    category: 'system_access',
    description: 'Node.js environment variable reference',
  },
  {
    re: /os\.environ(?:\[|\.get\()/g,
    severity: 'warning',
    category: 'system_access',
    description: 'Python environment variable reference',
  },
  // Warning — prompt injection
  {
    re: /(?:ignore|disregard|forget|override|bypass)\s+(?:previous|prior|all|your|these?)\s+(?:instructions?|rules?|guidelines?|constraints?|system\s+prompt)/gi,
    severity: 'warning',
    category: 'prompt_injection',
    description: 'Possible prompt injection attempt',
  },
  // Warning — large base64 blocks (obfuscation indicator)
  {
    re: /[A-Za-z0-9+/]{300,}={0,2}/g,
    severity: 'warning',
    category: 'obfuscation',
    description: 'Large base64-encoded block (possible obfuscation)',
  },
]

async function walkFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const name = entry.name as string
    const full = join(dir, name)
    if (entry.isDirectory()) {
      result.push(...await walkFiles(full))
    } else {
      result.push(full)
    }
  }
  return result
}

function clip(s: string, max = 90): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

async function buildSummary(projectDir: string): Promise<ImportProjectSummary> {
  let displayName = ''
  let description = ''
  let trays = 0
  let workers = 0
  const skillsRequired: string[] = []
  const workerPreviews: ImportProjectSummary['workerPreviews'] = []

  try {
    const pj = JSON.parse(await fs.readFile(join(projectDir, 'project.json'), 'utf-8')) as Record<string, unknown>
    displayName = String(pj.display_name ?? pj.name ?? '')
    description = String(pj.description ?? '')
  } catch { /* use defaults */ }

  const wfRoot = join(projectDir, 'workflows')
  try {
    const wfs = await fs.readdir(wfRoot, { withFileTypes: true })
    for (const wf of wfs) {
      if (!wf.isDirectory()) continue
      const stepsRoot = join(wfRoot, wf.name as string, 'steps')
      try {
        const steps = await fs.readdir(stepsRoot, { withFileTypes: true })
        for (const step of steps) {
          if (!step.isDirectory()) continue
          const stepId = step.name as string
          const stepJsonPath = join(stepsRoot, stepId, 'step.json')
          try {
            const raw = JSON.parse(await fs.readFile(stepJsonPath, 'utf-8')) as Record<string, unknown>
            if (raw.kind === 'tray') {
              trays++
            } else if (raw.kind === 'worker') {
              workers++
              const name = String(raw.name ?? stepId)
              if (Array.isArray(raw.skills)) {
                for (const s of raw.skills) {
                  if (typeof s === 'string' && !skillsRequired.includes(s)) skillsRequired.push(s)
                }
              }
              // Read first 300 chars of process.md
              try {
                const process = await fs.readFile(join(stepsRoot, stepId, 'process.md'), 'utf-8')
                workerPreviews.push({ name, excerpt: clip(process, 300) })
              } catch { /* no process.md */ }
            }
          } catch { /* skip bad step */ }
        }
      } catch { /* no steps dir */ }
    }
  } catch { /* no workflows dir */ }

  return { displayName, description, trays, workers, skillsRequired, workerPreviews }
}

export async function auditProject(projectDir: string): Promise<{
  findings: SecurityFinding[]
  summary: ImportProjectSummary
}> {
  const [allFiles, summary] = await Promise.all([
    walkFiles(projectDir).catch(() => [] as string[]),
    buildSummary(projectDir),
  ])

  const findings: SecurityFinding[] = []

  for (const filePath of allFiles) {
    const rel = relative(projectDir, filePath).replace(/\\/g, '/')
    const ext = extname(filePath).toLowerCase()

    // Flag unexpected file types (only .json and .md are valid)
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      findings.push({
        severity: 'critical',
        category: 'suspicious_file',
        file: rel,
        description: `Unexpected file type "${ext || '(no extension)'}" — only .json and .md are valid in a project`,
      })
      continue
    }

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      continue
    }

    if (ext === '.md') {
      for (const { re, severity, category, description } of MD_PATTERNS) {
        re.lastIndex = 0
        const m = re.exec(content)
        if (!m) continue
        findings.push({ severity, category, file: rel, description, match: clip(m[0]) })
      }
    }

    if (ext === '.json') {
      // Flag anomalously large string values (> 2000 chars) — potential encoded payload
      const longStr = /"[^"]{2000,}"/.exec(content)
      if (longStr) {
        findings.push({
          severity: 'warning',
          category: 'obfuscation',
          file: rel,
          description: 'Anomalously large string value in JSON (possible encoded payload)',
          match: clip(longStr[0]),
        })
      }
    }
  }

  return { findings, summary }
}
