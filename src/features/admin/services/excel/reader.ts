/**
 * Generic Excel Workbook Reader (Excel-1)
 *
 * Reads binary Excel files into domain-agnostic in-memory ExcelWorkbookData
 * using `read-excel-file/universal`.
 *
 * Security & Reliability:
 * - Pure data extraction: does not execute macros, evaluate dynamic functions, or render UI.
 * - Enforces file size, sheet count, and row limits to protect against resource exhaustion.
 * - Cleans trailing empty rows from worksheets.
 */

import readXlsxFileUniversal from 'read-excel-file/universal'
import type { ExcelWorkbookData, ExcelSheetData, ExcelRow, ExcelCellValue } from './types'

export const EXCEL_READER_LIMITS = {
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024, // 15 MB
  MAX_SHEETS: 20,
  MAX_ROWS_PER_SHEET: 10000,
} as const

/**
 * Trims trailing completely empty rows from a sheet.
 */
function trimEmptyRows(rows: ExcelRow[]): ExcelRow[] {
  let lastContentIndex = rows.length - 1
  while (lastContentIndex >= 0) {
    const row = rows[lastContentIndex]
    const hasContent = row.some(
      (c) => c !== null && c !== undefined && String(c).trim() !== ''
    )
    if (hasContent) break
    lastContentIndex--
  }
  return rows.slice(0, lastContentIndex + 1)
}

/**
 * Normalizes binary input into a clean ArrayBuffer.
 */
async function toArrayBuffer(
  input: Blob | File | ArrayBuffer | Uint8Array
): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) {
    return input
  }
  if (input instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) || ArrayBuffer.isView(input)) {
    const view = input as Uint8Array
    const copy = new Uint8Array(view.byteLength)
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    return copy.buffer as ArrayBuffer
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return await input.arrayBuffer()
  }
  throw new Error(
    'INVALID_INPUT_TYPE: Input must be a File, Blob, ArrayBuffer, or Uint8Array.'
  )
}

/**
 * Reads binary input (Blob, File, ArrayBuffer, or Uint8Array) into an in-memory ExcelWorkbookData structure.
 */
export async function readExcelWorkbook(
  input: Blob | File | ArrayBuffer | Uint8Array,
  fileName: string = 'workbook.xlsx'
): Promise<ExcelWorkbookData> {
  const byteLength =
    input instanceof ArrayBuffer
      ? input.byteLength
      : input instanceof Uint8Array
        ? input.byteLength
        : input.size

  if (byteLength > EXCEL_READER_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `FILE_TOO_LARGE: File size of ${(byteLength / (1024 * 1024)).toFixed(2)} MB exceeds allowed limit of ${EXCEL_READER_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
    )
  }

  const arrayBuffer = await toArrayBuffer(input)

  // 1. Read all sheets with readXlsxFileUniversal
  let rawSheets: Array<{ sheet: string; data: unknown[][] }> = []
  try {
    // Calling without options returns all sheets in the format [{ sheet: string, data: Row[] }]
    rawSheets = (await readXlsxFileUniversal(arrayBuffer)) as unknown as Array<{
      sheet: string
      data: unknown[][]
    }>
  } catch (err) {
    throw new Error(
      `INVALID_EXCEL_FILE: Unable to parse Excel workbook: ${(err as Error).message}`
    )
  }

  if (!rawSheets || rawSheets.length === 0) {
    throw new Error('EMPTY_WORKBOOK: The Excel workbook does not contain any sheets.')
  }

  if (rawSheets.length > EXCEL_READER_LIMITS.MAX_SHEETS) {
    throw new Error(
      `EXCESSIVE_SHEETS: Workbook contains ${rawSheets.length} sheets; limit is ${EXCEL_READER_LIMITS.MAX_SHEETS}.`
    )
  }

  // 2. Format and validate each sheet
  const sheets: ExcelSheetData[] = []
  for (const s of rawSheets) {
    const sheetName = s.sheet || 'Sheet1'
    const rawRows = s.data || []
    const castRows: ExcelRow[] = rawRows.map((r) =>
      r.map((c) => (c === undefined ? null : (c as ExcelCellValue)))
    )
    const trimmedRows = trimEmptyRows(castRows)

    if (trimmedRows.length > EXCEL_READER_LIMITS.MAX_ROWS_PER_SHEET) {
      throw new Error(
        `ROW_LIMIT_EXCEEDED: Sheet "${sheetName}" exceeds maximum limit of ${EXCEL_READER_LIMITS.MAX_ROWS_PER_SHEET} rows.`
      )
    }

    sheets.push({
      name: sheetName,
      rows: trimmedRows,
    })
  }

  return {
    fileName,
    fileSizeBytes: byteLength,
    sheets,
  }
}
