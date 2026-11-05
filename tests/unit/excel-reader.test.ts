import { describe, it, expect } from 'vitest'
import {
  readExcelWorkbook,
  EXCEL_READER_LIMITS,
} from '@/features/admin/services/excel/reader'

describe('Generic Excel Workbook Reader (Excel-1)', () => {
  it('throws FILE_TOO_LARGE when file exceeds size limit', async () => {
    expect(EXCEL_READER_LIMITS.MAX_FILE_SIZE_BYTES).toBeGreaterThan(0)
    const fakeLargeBuffer = new Uint8Array(16 * 1024 * 1024) // 16 MB > 15 MB limit
    await expect(
      readExcelWorkbook(fakeLargeBuffer, 'large.xlsx')
    ).rejects.toThrow(/FILE_TOO_LARGE/)
  })

  it('throws INVALID_INPUT_TYPE for non-binary input', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(readExcelWorkbook('not a buffer' as any)).rejects.toThrow(
      'INVALID_INPUT_TYPE'
    )
  })

  it('throws INVALID_EXCEL_FILE for corrupted / non-xlsx binary', async () => {
    const invalidBuffer = new Uint8Array([1, 2, 3, 4, 5])
    await expect(
      readExcelWorkbook(invalidBuffer, 'corrupted.xlsx')
    ).rejects.toThrow(/INVALID_EXCEL_FILE/)
  })
})
