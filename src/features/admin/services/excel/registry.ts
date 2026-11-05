/**
 * Excel Format Registry & Deterministic Detector (Excel-1)
 *
 * Implements the centralized format registry and signature-based format detection
 * for heterogeneous Excel workbooks.
 *
 * Architectural Invariants:
 * - Deterministic: Evaluates sheet names, header row signatures, and column structure.
 * - Zero Side Effects: Detection operates purely on in-memory workbook structure.
 * - Locked Adapters: Concrete workbook parsing is locked for subsequent subtasks.
 */

import type {
  ApprovedExcelFormatId,
  ExcelFormatAdapter,
  ExcelFormatDefinition,
  ExcelFormatDetectionResult,
  ExcelWorkbookData,
} from './types'
import { KhatrisetuRelationalAdapter } from './adapters/khatrisetu.adapter'
import { CommunityWebCmsAdapter } from './adapters/community-cms.adapter'

/**
 * Normalizes text for robust signature comparison (lowercased, whitespace-trimmed, stripped of punctuation).
 */
export function normalizeSignatureText(text: unknown): string {
  if (text === null || text === undefined) return ''
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Format 1: Khatrisetu Multi-Sheet Relational Format Adapter Stub
 * Expected structure:
 * - Sheet 'Families' with header 'Family Code'
 * - Sheet 'Members' with header 'Family Code', 'Name', 'Relationship'
 */
export class KhatrisetuAdapterStub implements ExcelFormatAdapter {
  readonly formatId: ApprovedExcelFormatId = 'KHATRISETU_V1'
  readonly displayName = 'Khatrisetu Relational Export'
  readonly description =
    'Multi-sheet relational workbook containing separate Families and Members sheets linked by Family Code.'

  matches(workbook: ExcelWorkbookData): ExcelFormatDetectionResult {
    const matchedSignatures: string[] = []
    const unmatchedReasons: string[] = []

    const familiesSheet = workbook.sheets.find(
      (s) => s.name.trim().toLowerCase() === 'families'
    )
    const membersSheet = workbook.sheets.find(
      (s) => s.name.trim().toLowerCase() === 'members'
    )

    if (familiesSheet) {
      matchedSignatures.push("Sheet 'Families' present")
    } else {
      unmatchedReasons.push("Missing sheet 'Families'")
    }

    if (membersSheet) {
      matchedSignatures.push("Sheet 'Members' present")
    } else {
      unmatchedReasons.push("Missing sheet 'Members'")
    }

    // Check Families sheet header (Row 1 Col A: 'Family Code')
    let familiesHeaderMatched = false
    if (familiesSheet && familiesSheet.rows.length > 0) {
      const row1 = familiesSheet.rows[0]
      const colA = normalizeSignatureText(row1[0])
      const colB = normalizeSignatureText(row1[1])
      if (colA === 'familycode' || colB === 'headoffamily') {
        familiesHeaderMatched = true
        matchedSignatures.push("Families sheet header contains 'Family Code'")
      } else {
        unmatchedReasons.push("Families sheet row 1 does not start with 'Family Code'")
      }
    }

    // Check Members sheet header (Row 1 Col A: 'Family Code', Col B: 'Name', Col C: 'Relationship')
    let membersHeaderMatched = false
    if (membersSheet && membersSheet.rows.length > 0) {
      const row1 = membersSheet.rows[0]
      const colA = normalizeSignatureText(row1[0])
      const colB = normalizeSignatureText(row1[1])
      const colC = normalizeSignatureText(row1[2])
      if (colA === 'familycode' && (colB === 'name' || colC === 'relationship')) {
        membersHeaderMatched = true
        matchedSignatures.push("Members sheet header contains 'Family Code', 'Name', 'Relationship'")
      } else {
        unmatchedReasons.push("Members sheet row 1 does not match expected columns")
      }
    }

    if (familiesSheet && membersSheet && familiesHeaderMatched && membersHeaderMatched) {
      return {
        formatId: this.formatId,
        confidence: 'EXACT',
        matchedSignatures,
      }
    }

    if ((familiesSheet || membersSheet) && (familiesHeaderMatched || membersHeaderMatched)) {
      return {
        formatId: this.formatId,
        confidence: 'HIGH',
        matchedSignatures,
        unmatchedReasons,
      }
    }

    return {
      formatId: null,
      confidence: 'NONE',
      matchedSignatures,
      unmatchedReasons,
    }
  }

  async adapt(): Promise<never> {
    throw new Error(
      'ADAPTER_NOT_IMPLEMENTED: Khatrisetu adapter implementation is locked for Subtask Excel-2.'
    )
  }
}

/**
 * Format 2: Community Web CMS Interleaved Block Format Adapter Stub
 * Expected structure:
 * - Single sheet containing alternating Ghar Mukhi (Head) header/rows and Member header/rows
 * - Head header: starts with '#' and contains 'Ghar Mukhi Name'
 * - Member header: starts with '#' and contains 'Member Name'
 */
export class CommunityWebCmsAdapterStub implements ExcelFormatAdapter {
  readonly formatId: ApprovedExcelFormatId = 'COMMUNITY_WEB_CMS_V1'
  readonly displayName = 'Community Web CMS Interleaved Block Export'
  readonly description =
    'Single-sheet hierarchical block export containing interleaved Ghar Mukhi family headers and Member sub-tables.'

  matches(workbook: ExcelWorkbookData): ExcelFormatDetectionResult {
    const matchedSignatures: string[] = []
    const unmatchedReasons: string[] = []

    if (workbook.sheets.length === 0) {
      return {
        formatId: null,
        confidence: 'NONE',
        matchedSignatures: [],
        unmatchedReasons: ['Workbook has no sheets'],
      }
    }

    const firstSheet = workbook.sheets[0]
    if (firstSheet.rows.length === 0) {
      return {
        formatId: null,
        confidence: 'NONE',
        matchedSignatures: [],
        unmatchedReasons: ['First sheet is empty'],
      }
    }

    // Inspect first row: Expect Ghar Mukhi header
    const row1 = firstSheet.rows[0]
    const row1Cols = row1.map(normalizeSignatureText)
    const hasGharMukhi = row1Cols.some((col) => col.includes('gharmukhi'))
    const hasFathersName = row1Cols.some((col) => col.includes('fathersname'))
    const hasWifeName = row1Cols.some((col) => col.includes('wifename'))

    if (hasGharMukhi) {
      matchedSignatures.push("Header row contains 'Ghar Mukhi Name'")
    } else {
      unmatchedReasons.push("First row missing 'Ghar Mukhi Name'")
    }

    if (hasFathersName && hasWifeName) {
      matchedSignatures.push("Header row contains 'Fathers Name' and 'Wife Name'")
    }

    // Inspect subsequent rows for repeated Member table headers
    let hasMemberHeader = false
    for (let r = 1; r < Math.min(25, firstSheet.rows.length); r++) {
      const row = firstSheet.rows[r]
      const cols = row.map(normalizeSignatureText)
      if (cols.some((c) => c === 'membername') && cols.some((c) => c === 'relation')) {
        hasMemberHeader = true
        matchedSignatures.push(`Found nested 'Member Name' header at row ${r + 1}`)
        break
      }
    }

    if (!hasMemberHeader && firstSheet.rows.length > 2) {
      unmatchedReasons.push("No nested 'Member Name' sub-headers found in sample rows")
    }

    if (hasGharMukhi && hasMemberHeader) {
      return {
        formatId: this.formatId,
        confidence: 'EXACT',
        matchedSignatures,
      }
    }

    if (hasGharMukhi) {
      return {
        formatId: this.formatId,
        confidence: 'HIGH',
        matchedSignatures,
        unmatchedReasons,
      }
    }

    return {
      formatId: null,
      confidence: 'NONE',
      matchedSignatures,
      unmatchedReasons,
    }
  }

  async adapt(): Promise<never> {
    throw new Error(
      'ADAPTER_NOT_IMPLEMENTED: Community Web CMS adapter implementation is locked for Subtask Excel-3.'
    )
  }
}

/**
 * Format Registry managing supported Excel formats and matching.
 */
export class ExcelFormatRegistry {
  private static instance: ExcelFormatRegistry
  private formats = new Map<ApprovedExcelFormatId, ExcelFormatDefinition>()

  private constructor() {
    this.registerDefaults()
  }

  public static getInstance(): ExcelFormatRegistry {
    if (!ExcelFormatRegistry.instance) {
      ExcelFormatRegistry.instance = new ExcelFormatRegistry()
    }
    return ExcelFormatRegistry.instance
  }

  private registerDefaults(): void {
    const khatrisetuAdapter = new KhatrisetuRelationalAdapter()
    this.register({
      formatId: 'KHATRISETU_V1',
      displayName: khatrisetuAdapter.displayName,
      sourceSystem: 'Khatrisetu Census',
      description: khatrisetuAdapter.description,
      expectedSheets: ['Families', 'Members'],
      adapter: khatrisetuAdapter,
    })

    const communityCmsAdapter = new CommunityWebCmsAdapter()
    this.register({
      formatId: 'COMMUNITY_WEB_CMS_V1',
      displayName: communityCmsAdapter.displayName,
      sourceSystem: 'Community Web CMS',
      description: communityCmsAdapter.description,
      expectedSheets: ['Sheet1'],
      adapter: communityCmsAdapter,
    })
  }

  /**
   * Registers a format definition.
   */
  public register(definition: ExcelFormatDefinition): void {
    this.formats.set(definition.formatId, definition)
  }

  /**
   * Retrieves a registered format definition.
   */
  public get(formatId: ApprovedExcelFormatId): ExcelFormatDefinition | undefined {
    return this.formats.get(formatId)
  }

  /**
   * Lists all registered formats.
   */
  public list(): ExcelFormatDefinition[] {
    return Array.from(this.formats.values())
  }

  /**
   * Detects the best matching format for a workbook.
   */
  public detect(workbook: ExcelWorkbookData): ExcelFormatDetectionResult {
    if (!workbook || !workbook.sheets || workbook.sheets.length === 0) {
      return {
        formatId: null,
        confidence: 'NONE',
        matchedSignatures: [],
        unmatchedReasons: ['Workbook contains no sheets or invalid structure'],
      }
    }

    for (const definition of this.formats.values()) {
      const match = definition.adapter.matches(workbook)
      if (match.confidence === 'EXACT') {
        return match
      }
    }

    for (const definition of this.formats.values()) {
      const match = definition.adapter.matches(workbook)
      if (match.confidence === 'HIGH') {
        return match
      }
    }

    return {
      formatId: null,
      confidence: 'NONE',
      matchedSignatures: [],
      unmatchedReasons: ['No registered Excel format matched the workbook signatures'],
    }
  }
}

/**
 * Global singleton access to format detection.
 */
export function detectExcelFormat(
  workbook: ExcelWorkbookData
): ExcelFormatDetectionResult {
  return ExcelFormatRegistry.getInstance().detect(workbook)
}
