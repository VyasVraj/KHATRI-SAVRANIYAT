/**
 * Official Circular PDF Generator
 *
 * Implements authoritative PDF generation for KHATRI SARVANIYAT:
 * - Method A: Prepend official branded letterhead cover page to user-uploaded PDF
 *   without distorting or modifying original PDF pages.
 * - Method B: Full vector A4 official circular document with authentic emblem,
 *   header, metadata, subject, formatted body, instructions, signatory, and official seal.
 *
 * Official Organization Name:
 * AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
 */

import { jsPDF } from 'jspdf'
import { PDFDocument } from 'pdf-lib'

export interface CircularPdfPayload {
  title: string
  circular_number: string
  category: string
  issuing_authority: string
  issue_date: string // e.g. "2026-11-18"
  effective_date?: string | null
  subject?: string | null
  content: string
  instructions?: string | null
  contact_info?: string | null
  signatory_name: string
  signatory_title: string
  creation_method?: 'PDF_UPLOAD' | 'ONLINE_EDITOR'
}

let cachedLogoBase64: string | null = null

/**
 * Loads the official Khatri logo as a base64 data URI.
 * Works in browser (fetch + blob/FileReader) and Node/Vitest test environments.
 */
export async function getOfficialLogoDataUri(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64

  // Node environment fallback for unit tests
  if (typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path')
      const candidates = [
        path.resolve(process.cwd(), 'public/khatri-logo.png'),
        path.resolve(process.cwd(), 'public/logo.png'),
      ]
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const buffer = fs.readFileSync(p)
          cachedLogoBase64 = `data:image/png;base64,${buffer.toString('base64')}`
          return cachedLogoBase64
        }
      }
    } catch {
      // Proceed to browser fallback
    }
  }

  // Browser environment using standard Image element (safe, zero raw fetch calls)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const urls = ['/khatri-logo.png', '/logo.png']
    for (const url of urls) {
      try {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth || img.width || 100
              canvas.height = img.naturalHeight || img.height || 100
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(img, 0, 0)
                resolve(canvas.toDataURL('image/png'))
              } else {
                reject(new Error('Canvas context unavailable'))
              }
            } catch (err) {
              reject(err)
            }
          }
          img.onerror = reject
          img.src = url
        })
        if (dataUri) {
          cachedLogoBase64 = dataUri
          return dataUri
        }
      } catch {
        // Try next candidate
      }
    }
  }

  return ''
}

/**
 * Formats date into readable string: e.g. "18 November 2026"
 */
export function formatCircularDate(dateStr?: string | null): string {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/**
 * Generates an official vector PDF for online-written circulars (Method B).
 */
export async function generateOnlineNoticePdf(
  payload: CircularPdfPayload
): Promise<{ blob: Blob; dataUri: string; filename: string; arrayBuffer: ArrayBuffer }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210mm x 297mm
  })

  const pageWidth = 210
  const pageHeight = 297
  const marginX = 18
  const contentWidth = pageWidth - marginX * 2 // 174mm
  let currentY = 14

  const logoDataUri = await getOfficialLogoDataUri()

  // Helper to add letterhead header
  const renderHeader = () => {
    // Official Logo (top centered or top left)
    if (logoDataUri) {
      try {
        doc.addImage(logoDataUri, 'PNG', marginX, 10, 20, 20)
      } catch {
        // Fallback gracefully if image add fails
      }
    }

    // Organization Name & Header Title
    doc.setFont('times', 'bold')
    doc.setTextColor(15, 23, 42) // slate-900
    doc.setFontSize(13)
    doc.text('AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)', 118, 16, {
      align: 'center',
    })

    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105) // slate-600
    doc.text(payload.issuing_authority.toUpperCase(), 118, 21, {
      align: 'center',
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(30, 58, 138) // blue-900
    doc.text('OFFICIAL PANCHAYAT DIRECTIVE & COMMUNITY CIRCULAR', 118, 26, {
      align: 'center',
    })

    // Double Rule Divider
    doc.setDrawColor(30, 41, 59) // slate-800
    doc.setLineWidth(0.6)
    doc.line(marginX, 32, pageWidth - marginX, 32)
    doc.setLineWidth(0.2)
    doc.line(marginX, 33.2, pageWidth - marginX, 33.2)

    currentY = 39
  }

  // Helper for footer
  const renderFooter = (pageNumber: number, totalPages: number) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139) // slate-500
    doc.setDrawColor(203, 213, 225) // slate-300
    doc.setLineWidth(0.2)
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12)

    doc.text(
      'AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT) — OFFICIAL RECORDS',
      marginX,
      pageHeight - 8
    )
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    })
  }

  // Check page overflow
  const ensureSpace = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 25) {
      doc.addPage()
      renderHeader()
    }
  }

  renderHeader()

  // 1. Metadata Bar (Ref No, Date, Category)
  doc.setFillColor(248, 250, 252) // slate-50
  doc.setDrawColor(226, 232, 240) // slate-200
  doc.rect(marginX, currentY, contentWidth, 10, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text(`REF NO: ${payload.circular_number}`, marginX + 3, currentY + 6.5)

  const dateStr = formatCircularDate(payload.issue_date)
  doc.text(`DATE: ${dateStr}`, pageWidth - marginX - 3, currentY + 6.5, { align: 'right' })

  if (payload.effective_date) {
    const effStr = formatCircularDate(payload.effective_date)
    doc.setFont('helvetica', 'normal')
    doc.text(`Effective: ${effStr}`, 105, currentY + 6.5, { align: 'center' })
  }

  currentY += 15

  // 2. Title & Subject
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  const titleLines = doc.splitTextToSize(payload.title, contentWidth)
  doc.text(titleLines, 105, currentY, { align: 'center' })
  currentY += titleLines.length * 6 + 2

  if (payload.subject && payload.subject.trim().length > 0) {
    doc.setFont('times', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    const subjectText = `SUBJECT: ${payload.subject.trim().toUpperCase()}`
    const subjectLines = doc.splitTextToSize(subjectText, contentWidth)
    doc.text(subjectLines, marginX, currentY)
    currentY += subjectLines.length * 5 + 3
  }

  // 3. Category Badge & Notice Heading
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(37, 99, 235) // blue-600
  doc.text(`ANNOUNCEMENT CATEGORY: ${payload.category.toUpperCase()}`, marginX, currentY)
  currentY += 6

  // Horizontal line before body
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.line(marginX, currentY, pageWidth - marginX, currentY)
  currentY += 5

  // 4. Main Notice Content (with multi-paragraph formatting)
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(30, 41, 59) // slate-800

  const paragraphs = payload.content.split('\n')
  for (const para of paragraphs) {
    const cleanPara = para.trim()
    if (!cleanPara) {
      currentY += 3
      continue
    }

    // Check for bold headings (starts with # or UPPERCASE line ending with colon)
    const isHeading = cleanPara.startsWith('#') || (/^[A-Z0-9\s,&()-]+:$/.test(cleanPara) && cleanPara.length < 70)
    if (isHeading) {
      ensureSpace(12)
      doc.setFont('times', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      const headingText = cleanPara.replace(/^#+\s*/, '')
      doc.text(headingText, marginX, currentY)
      currentY += 6
      doc.setFont('times', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(30, 41, 59)
      continue
    }

    // Bullet or numbered item
    const isBullet = cleanPara.startsWith('•') || cleanPara.startsWith('-') || /^\d+\./.test(cleanPara)
    const paraLines = doc.splitTextToSize(cleanPara, contentWidth)
    ensureSpace(paraLines.length * 5.2 + 2)

    if (isBullet) {
      doc.text(paraLines, marginX + 2, currentY)
    } else {
      doc.text(paraLines, marginX, currentY)
    }
    currentY += paraLines.length * 5.2 + 2
  }

  // 5. Important Instructions (Callout box if present)
  if (payload.instructions && payload.instructions.trim().length > 0) {
    currentY += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(180, 83, 9) // amber-700
    const instrTitle = 'IMPORTANT DIRECTIVES & COMPLIANCE INSTRUCTIONS:'
    const instrLines = doc.splitTextToSize(payload.instructions.trim(), contentWidth - 8)
    const boxHeight = instrLines.length * 4.6 + 12

    ensureSpace(boxHeight + 6)
    doc.setFillColor(254, 243, 199) // amber-100
    doc.setDrawColor(245, 158, 11) // amber-500
    doc.setLineWidth(0.3)
    doc.rect(marginX, currentY, contentWidth, boxHeight, 'FD')

    doc.text(instrTitle, marginX + 4, currentY + 6)
    doc.setFont('times', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(120, 53, 15) // amber-900
    doc.text(instrLines, marginX + 4, currentY + 11)
    currentY += boxHeight + 6
  }

  // 6. Contact Information (if provided)
  if (payload.contact_info && payload.contact_info.trim().length > 0) {
    ensureSpace(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(71, 85, 105)
    doc.text('SECRETARIAT CONTACT & ASSISTANCE:', marginX, currentY)
    currentY += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(51, 65, 85)
    const contactLines = doc.splitTextToSize(payload.contact_info.trim(), contentWidth)
    doc.text(contactLines, marginX, currentY)
    currentY += contactLines.length * 4.5 + 5
  }

  // 7. Official Signatory & Seal Block
  ensureSpace(42)
  currentY += 6

  // Left side: Official Seal Emblem
  doc.setDrawColor(30, 58, 138) // blue-900
  doc.setLineWidth(0.4)
  doc.rect(marginX + 2, currentY, 52, 22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(30, 58, 138)
  doc.text('OFFICIAL PANCHAYAT SEAL', marginX + 28, currentY + 5, { align: 'center' })
  doc.setFont('times', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(71, 85, 105)
  doc.text('AKHIL BHARAT SINDHI BRAHMKHATRI', marginX + 28, currentY + 10, { align: 'center' })
  doc.text('PANCHAYAT (SARVANIYAT)', marginX + 28, currentY + 14, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(15, 23, 42)
  doc.text('CENTRAL SECRETARIAT', marginX + 28, currentY + 18.5, { align: 'center' })

  // Right side: Signatory Block
  const sigX = pageWidth - marginX - 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105)
  doc.text('Issued under the Seal and Authority of:', sigX, currentY + 4, { align: 'right' })

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(payload.signatory_name, sigX, currentY + 11, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105)
  doc.text(payload.signatory_title, sigX, currentY + 16, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text(payload.issuing_authority, sigX, currentY + 21, { align: 'right' })

  // Add Footers to all generated pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    renderFooter(i, totalPages)
  }

  const arrayBuffer = doc.output('arraybuffer')
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
  const dataUri = doc.output('datauristring')
  const safeFilename = `${payload.circular_number || 'circular'}_${payload.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}.pdf`

  return {
    blob,
    dataUri,
    filename: safeFilename,
    arrayBuffer,
  }
}

/**
 * Creates branded PDF for user-uploaded PDF (Method A):
 * Prepends an authoritative letterhead cover page to the user-uploaded PDF,
 * leaving all original PDF pages 100% intact without distortion or overlap.
 */
export async function generateBrandedUploadedPdf(
  uploadedPdfBytes: Uint8Array | ArrayBuffer,
  payload: CircularPdfPayload
): Promise<{ blob: Blob; dataUri: string; filename: string; arrayBuffer: ArrayBuffer }> {
  // 1. Generate cover page using jsPDF
  const coverDoc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210
  const pageHeight = 297
  const marginX = 20
  const contentWidth = pageWidth - marginX * 2

  const logoDataUri = await getOfficialLogoDataUri()
  if (logoDataUri) {
    try {
      coverDoc.addImage(logoDataUri, 'PNG', 105 - 16, 22, 32, 32)
    } catch {
      // Ignore
    }
  }

  // Organization Header
  coverDoc.setFont('times', 'bold')
  coverDoc.setFontSize(16)
  coverDoc.setTextColor(15, 23, 42)
  coverDoc.text('AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)', 105, 62, {
    align: 'center',
  })

  coverDoc.setFont('times', 'normal')
  coverDoc.setFontSize(11)
  coverDoc.setTextColor(71, 85, 105)
  coverDoc.text(payload.issuing_authority.toUpperCase(), 105, 69, {
    align: 'center',
  })

  coverDoc.setFont('helvetica', 'bold')
  coverDoc.setFontSize(9.5)
  coverDoc.setTextColor(30, 58, 138)
  coverDoc.text('OFFICIAL PANCHAYAT DIRECTIVE & CIRCULAR NOTIFICATION', 105, 75, {
    align: 'center',
  })

  // Accent divider line
  coverDoc.setDrawColor(30, 41, 59)
  coverDoc.setLineWidth(0.8)
  coverDoc.line(marginX, 82, pageWidth - marginX, 82)
  coverDoc.setLineWidth(0.2)
  coverDoc.line(marginX, 83.5, pageWidth - marginX, 83.5)

  // Document Details Box
  coverDoc.setFillColor(248, 250, 252)
  coverDoc.setDrawColor(226, 232, 240)
  coverDoc.rect(marginX, 92, contentWidth, 26, 'FD')

  coverDoc.setFont('helvetica', 'bold')
  coverDoc.setFontSize(10)
  coverDoc.setTextColor(15, 23, 42)
  coverDoc.text(`OFFICIAL REF NO: ${payload.circular_number}`, marginX + 5, 101)

  const dateStr = formatCircularDate(payload.issue_date)
  coverDoc.text(`DATE OF ISSUE: ${dateStr}`, pageWidth - marginX - 5, 101, {
    align: 'right',
  })

  coverDoc.setFont('helvetica', 'normal')
  coverDoc.setFontSize(9)
  coverDoc.setTextColor(71, 85, 105)
  coverDoc.text(`CATEGORY: ${payload.category.toUpperCase()}`, marginX + 5, 110)
  coverDoc.text(`ISSUING BODY: ${payload.issuing_authority}`, pageWidth - marginX - 5, 110, {
    align: 'right',
  })

  // Notice Title
  coverDoc.setFont('times', 'bold')
  coverDoc.setFontSize(15)
  coverDoc.setTextColor(15, 23, 42)
  const titleLines = coverDoc.splitTextToSize(payload.title, contentWidth)
  coverDoc.text(titleLines, 105, 132, { align: 'center' })

  let currentY = 132 + titleLines.length * 7 + 4

  // Subject if present
  if (payload.subject && payload.subject.trim().length > 0) {
    coverDoc.setFont('times', 'bold')
    coverDoc.setFontSize(11)
    coverDoc.setTextColor(30, 41, 59)
    const subjLines = coverDoc.splitTextToSize(`SUBJECT: ${payload.subject.trim().toUpperCase()}`, contentWidth)
    coverDoc.text(subjLines, marginX, currentY)
    currentY += subjLines.length * 6 + 6
  }

  // Description / Summary Box
  if (payload.content && payload.content.trim().length > 0) {
    coverDoc.setFont('times', 'normal')
    coverDoc.setFontSize(10.5)
    coverDoc.setTextColor(51, 65, 85)
    const descLines = coverDoc.splitTextToSize(payload.content.trim(), contentWidth)
    coverDoc.text(descLines, marginX, currentY)
    currentY += descLines.length * 5.5 + 8
  }

  // Official Notice Endorsement Banner
  coverDoc.setFillColor(239, 246, 255) // blue-50
  coverDoc.setDrawColor(191, 219, 254) // blue-200
  coverDoc.rect(marginX, currentY, contentWidth, 24, 'FD')

  coverDoc.setFont('helvetica', 'bold')
  coverDoc.setFontSize(9)
  coverDoc.setTextColor(30, 58, 138)
  coverDoc.text('OFFICIAL DOCUMENT VERIFICATION & ENDORSEMENT', marginX + 5, currentY + 7)

  coverDoc.setFont('helvetica', 'normal')
  coverDoc.setFontSize(8.5)
  coverDoc.setTextColor(51, 65, 85)
  const endorsementText =
    'This official circular and attached directives have been ratified by the Panchayat Secretariat. The complete certified document follows in full on subsequent pages.'
  const endLines = coverDoc.splitTextToSize(endorsementText, contentWidth - 10)
  coverDoc.text(endLines, marginX + 5, currentY + 13)

  currentY += 34

  // Signatory & Seal
  coverDoc.setFont('helvetica', 'normal')
  coverDoc.setFontSize(8.5)
  coverDoc.setTextColor(71, 85, 105)
  coverDoc.text('Authorized Signatory:', pageWidth - marginX, currentY, { align: 'right' })

  coverDoc.setFont('times', 'bold')
  coverDoc.setFontSize(11)
  coverDoc.setTextColor(15, 23, 42)
  coverDoc.text(payload.signatory_name, pageWidth - marginX, currentY + 6, { align: 'right' })

  coverDoc.setFont('helvetica', 'normal')
  coverDoc.setFontSize(8.5)
  coverDoc.setTextColor(71, 85, 105)
  coverDoc.text(payload.signatory_title, pageWidth - marginX, currentY + 11, { align: 'right' })

  // Footer
  coverDoc.setFont('helvetica', 'normal')
  coverDoc.setFontSize(7.5)
  coverDoc.setTextColor(100, 116, 139)
  coverDoc.setDrawColor(203, 213, 225)
  coverDoc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12)
  coverDoc.text(
    'AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT) — OFFICIAL RECORDS',
    marginX,
    pageHeight - 8
  )
  coverDoc.text('Official Cover Sheet', pageWidth - marginX, pageHeight - 8, { align: 'right' })

  const coverArrayBuffer = coverDoc.output('arraybuffer')

  // 2. Use pdf-lib to merge cover page + uploaded PDF pages
  const coverPdfDoc = await PDFDocument.load(coverArrayBuffer)
  const userPdfDoc = await PDFDocument.load(uploadedPdfBytes)

  const mergedPdfDoc = await PDFDocument.create()

  // Copy cover page
  const [coverPage] = await mergedPdfDoc.copyPages(coverPdfDoc, [0])
  mergedPdfDoc.addPage(coverPage)

  // Copy all pages from original uploaded PDF intact
  const userPageIndices = Array.from({ length: userPdfDoc.getPageCount() }, (_, i) => i)
  const userPages = await mergedPdfDoc.copyPages(userPdfDoc, userPageIndices)
  userPages.forEach((page) => mergedPdfDoc.addPage(page))

  const finalPdfBytes = await mergedPdfDoc.save()
  const blob = new Blob([new Uint8Array(finalPdfBytes)], { type: 'application/pdf' })
  const base64Str = btoa(
    new Uint8Array(finalPdfBytes).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )
  const dataUri = `data:application/pdf;base64,${base64Str}`
  const safeFilename = `${payload.circular_number || 'circular'}_branded_${payload.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}.pdf`

  return {
    blob,
    dataUri,
    filename: safeFilename,
    arrayBuffer: finalPdfBytes.buffer as ArrayBuffer,
  }
}

/**
 * Direct file download trigger helper for the browser.
 */
export function triggerPdfDownload(blobOrUri: Blob | string, filename: string): void {
  const url = typeof blobOrUri === 'string' ? blobOrUri : URL.createObjectURL(blobOrUri)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  if (typeof blobOrUri !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
}
