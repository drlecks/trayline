// File-export outlet channel — writes card output to the local filesystem
// in the requested format. Called by the outlet runner after token resolution.

import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { dirname } from 'path'
import type { FileExportFormat } from '../../shared/types'

export interface ExportFileInput {
  filePath: string
  format: FileExportFormat
  /** Whether to append to an existing file (txt, csv, xlsx only). */
  append: boolean
  /** Resolved body text for txt, pdf, docx formats. */
  body: string
  /** Resolved column values for csv and xlsx formats. */
  fields: Array<{ header: string; value: string }>
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

async function writeTxt(input: ExportFileInput): Promise<void> {
  await fs.mkdir(dirname(input.filePath), { recursive: true })
  if (input.append && await pathExists(input.filePath)) {
    await fs.appendFile(input.filePath, '\n' + input.body, 'utf-8')
  } else {
    await fs.writeFile(input.filePath, input.body, 'utf-8')
  }
}

async function writeCsv(input: ExportFileInput): Promise<void> {
  await fs.mkdir(dirname(input.filePath), { recursive: true })
  const headers = input.fields.map((f) => f.header)
  const values = input.fields.map((f) => f.value)
  const row = values.map(escapeCSV).join(',') + '\n'

  const exists = await pathExists(input.filePath)
  if (input.append && exists) {
    await fs.appendFile(input.filePath, row, 'utf-8')
  } else {
    const headerLine = headers.map(escapeCSV).join(',') + '\n'
    await fs.writeFile(input.filePath, headerLine + row, 'utf-8')
  }
}

async function writePdf(input: ExportFileInput): Promise<void> {
  await fs.mkdir(dirname(input.filePath), { recursive: true })
  // PDF doesn't support append — always overwrite
  const PDFDocument = (await import('pdfkit')).default
  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const stream = createWriteStream(input.filePath)
    doc.pipe(stream)
    doc.font('Helvetica').fontSize(11).text(input.body, { lineGap: 4 })
    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}

async function writeDocx(input: ExportFileInput): Promise<void> {
  await fs.mkdir(dirname(input.filePath), { recursive: true })
  // DOCX doesn't support append — always overwrite
  const { Document, Packer, Paragraph, TextRun } = await import('docx')
  const lines = input.body.split('\n')
  const doc = new Document({
    sections: [{
      children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
    }],
  })
  const buffer = await Packer.toBuffer(doc)
  await fs.writeFile(input.filePath, buffer)
}

async function writeXlsx(input: ExportFileInput): Promise<void> {
  await fs.mkdir(dirname(input.filePath), { recursive: true })
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  let ws: import('exceljs').Worksheet

  const headers = input.fields.map((f) => f.header)
  const values = input.fields.map((f) => f.value)

  const exists = await pathExists(input.filePath)
  if (input.append && exists) {
    await wb.xlsx.readFile(input.filePath)
    ws = wb.getWorksheet(1) ?? wb.addWorksheet('Sheet1')
  } else {
    ws = wb.addWorksheet('Sheet1')
    ws.addRow(headers)
  }

  ws.addRow(values)
  await wb.xlsx.writeFile(input.filePath)
}

export async function exportFile(input: ExportFileInput): Promise<void> {
  switch (input.format) {
    case 'txt':  return writeTxt(input)
    case 'csv':  return writeCsv(input)
    case 'pdf':  return writePdf(input)
    case 'docx': return writeDocx(input)
    case 'xlsx': return writeXlsx(input)
    default:
      throw new Error(`Unsupported export format: ${(input as { format: string }).format}`)
  }
}
