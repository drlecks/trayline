import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, access } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { exportFile, type ExportFileInput } from './file-export-channel'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'trayline-fec-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

function baseInput(overrides: Partial<ExportFileInput> = {}): ExportFileInput {
  return {
    filePath: join(tmpDir, 'out.txt'),
    format: 'txt',
    append: false,
    body: 'hello world',
    fields: [],
    ...overrides,
  }
}

describe('txt format', () => {
  it('writes body text to a new file', async () => {
    const filePath = join(tmpDir, 'result.txt')
    await exportFile(baseInput({ filePath, body: 'test content' }))
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('test content')
  })

  it('overwrites existing file when append is false', async () => {
    const filePath = join(tmpDir, 'result.txt')
    await exportFile(baseInput({ filePath, body: 'first' }))
    await exportFile(baseInput({ filePath, body: 'second', append: false }))
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('second')
  })

  it('appends to existing file when append is true', async () => {
    const filePath = join(tmpDir, 'log.txt')
    await exportFile(baseInput({ filePath, body: 'line1', append: false }))
    await exportFile(baseInput({ filePath, body: 'line2', append: true }))
    const content = await readFile(filePath, 'utf-8')
    expect(content).toContain('line1')
    expect(content).toContain('line2')
  })

  it('creates parent directories if they do not exist', async () => {
    const filePath = join(tmpDir, 'nested', 'deep', 'out.txt')
    await exportFile(baseInput({ filePath, body: 'deep' }))
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('deep')
  })
})

describe('csv format', () => {
  const fields = [
    { header: 'Name', value: 'Alice' },
    { header: 'Score', value: '42' },
  ]

  it('writes a header row and a data row', async () => {
    const filePath = join(tmpDir, 'data.csv')
    await exportFile(baseInput({ filePath, format: 'csv', append: false, fields }))
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines[0]).toBe('Name,Score')
    expect(lines[1]).toBe('Alice,42')
  })

  it('appends a row without re-writing the header', async () => {
    const filePath = join(tmpDir, 'data.csv')
    await exportFile(baseInput({ filePath, format: 'csv', append: false, fields }))
    await exportFile(baseInput({ filePath, format: 'csv', append: true, fields: [
      { header: 'Name', value: 'Bob' },
      { header: 'Score', value: '99' },
    ] }))
    const content = await readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')
    // Only one header line
    expect(lines.filter((l) => l === 'Name,Score')).toHaveLength(1)
    expect(lines).toContain('Alice,42')
    expect(lines).toContain('Bob,99')
  })

  it('escapes values containing commas', async () => {
    const filePath = join(tmpDir, 'data.csv')
    await exportFile(baseInput({ filePath, format: 'csv', fields: [
      { header: 'Note', value: 'a,b' },
    ] }))
    const content = await readFile(filePath, 'utf-8')
    expect(content).toContain('"a,b"')
  })

  it('escapes values containing double quotes', async () => {
    const filePath = join(tmpDir, 'data.csv')
    await exportFile(baseInput({ filePath, format: 'csv', fields: [
      { header: 'Val', value: 'say "hello"' },
    ] }))
    const content = await readFile(filePath, 'utf-8')
    expect(content).toContain('"say ""hello"""')
  })
})

describe('pdf format', () => {
  it('creates a PDF file with content', async () => {
    const filePath = join(tmpDir, 'doc.pdf')
    await exportFile(baseInput({ filePath, format: 'pdf', body: 'PDF content here' }))
    const bytes = await readFile(filePath)
    // PDF files start with %PDF
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })
})

describe('docx format', () => {
  it('creates a DOCX file', async () => {
    const filePath = join(tmpDir, 'doc.docx')
    await exportFile(baseInput({ filePath, format: 'docx', body: 'Hello from DOCX' }))
    // DOCX is a ZIP; starts with PK (0x50 0x4B)
    const bytes = await readFile(filePath)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })
})

describe('xlsx format', () => {
  it('creates an XLSX file with a data row', async () => {
    const filePath = join(tmpDir, 'sheet.xlsx')
    await exportFile(baseInput({
      filePath,
      format: 'xlsx',
      append: false,
      fields: [{ header: 'Item', value: 'Widget' }],
    }))
    await expect(access(filePath)).resolves.toBeUndefined()
    // XLSX is also a ZIP; starts with PK
    const bytes = await readFile(filePath)
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  it('appends a row to an existing XLSX file', async () => {
    const filePath = join(tmpDir, 'sheet.xlsx')
    const fields1 = [{ header: 'Name', value: 'Alice' }]
    const fields2 = [{ header: 'Name', value: 'Bob' }]
    await exportFile(baseInput({ filePath, format: 'xlsx', append: false, fields: fields1 }))
    await exportFile(baseInput({ filePath, format: 'xlsx', append: true, fields: fields2 }))
    // Read back and verify two data rows
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)
    const ws = wb.getWorksheet(1)!
    const rows = ws.getSheetValues() as unknown[][]
    const nonEmpty = rows.filter(Boolean)
    // Row 1 = header, rows 2–3 = data
    expect(nonEmpty.length).toBeGreaterThanOrEqual(3)
  })
})

describe('unsupported format', () => {
  it('throws for an unknown format', async () => {
    await expect(
      exportFile({ ...baseInput(), format: 'unknown' as never }),
    ).rejects.toThrow('Unsupported export format')
  })
})
