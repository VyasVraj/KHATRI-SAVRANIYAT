/**
 * Email Templates & Formatting
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Privacy & Security Rules:
 * 1. Data Minimization: Zero sensitive census fields (DOB, street addresses, phone, lineage).
 * 2. Absolute URL resolution: Relative action_urls are mapped against verified platform base URL.
 * 3. Direct Preference Control: Every email includes a clear link to manage preferences.
 */

import type { ClaimedOutboxRow } from './types.ts'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function sanitizeUrl(baseUrl: string, rawUrl?: string | null): string | null {
  if (!rawUrl) return null
  const trimmed = rawUrl.trim()
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed
  }
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${cleanBase}${cleanPath}`
}

export function renderNotificationEmail(
  row: ClaimedOutboxRow,
  options?: { baseUrl?: string; supportEmail?: string }
): RenderedEmail {
  const baseUrl = options?.baseUrl || 'https://community-roots.app'
  const supportEmail = options?.supportEmail || 'support@community-roots.app'
  const preferencesUrl = `${baseUrl.replace(/\/+$/, '')}/settings/notifications`
  const actionUrl = sanitizeUrl(baseUrl, row.action_url)

  const recipientGreeting = row.recipient_name ? `Hello ${escapeHtml(row.recipient_name)},` : 'Hello,'
  const titleHtml = escapeHtml(row.title)
  const bodyHtml = escapeHtml(row.body).replace(/\n/g, '<br/>')

  const subject = `[Community Roots] ${row.title}`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleHtml}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 580px;
      margin: 32px auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background-color: #0f172a;
      padding: 24px 32px;
      text-align: left;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .content {
      padding: 32px;
    }
    .greeting {
      font-size: 15px;
      margin-bottom: 16px;
      color: #334155;
    }
    .notification-box {
      background-color: #f1f5f9;
      border-left: 4px solid #3b82f6;
      padding: 16px 20px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .notification-title {
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 6px;
    }
    .notification-body {
      font-size: 14px;
      color: #475569;
      margin: 0;
    }
    .button-container {
      margin: 28px 0;
      text-align: left;
    }
    .btn {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding: 24px 32px;
      background-color: #f8fafc;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer a {
      color: #2563eb;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Community Roots</h1>
    </div>
    <div class="content">
      <div class="greeting">${recipientGreeting}</div>
      <div class="notification-box">
        <div class="notification-title">${titleHtml}</div>
        <div class="notification-body">${bodyHtml}</div>
      </div>
      ${
        actionUrl
          ? `<div class="button-container">
        <a href="${escapeHtml(actionUrl)}" class="btn" target="_blank" rel="noopener noreferrer">View in Community Roots</a>
      </div>`
          : ''
      }
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0;">
        You received this notification according to your delivery preferences on <strong>Community Roots</strong>.
      </p>
      <p style="margin: 0;">
        <a href="${escapeHtml(preferencesUrl)}">Manage Notification Preferences</a> &bull;
        <a href="mailto:${escapeHtml(supportEmail)}">Contact Support</a>
      </p>
    </div>
  </div>
</body>
</html>`

  const textLines: string[] = [
    `COMMUNITY ROOTS`,
    `========================================`,
    ``,
    row.recipient_name ? `Hello ${row.recipient_name},` : 'Hello,',
    ``,
    row.title,
    `----------------------------------------`,
    row.body,
    ``,
  ]

  if (actionUrl) {
    textLines.push(`View details: ${actionUrl}`)
    textLines.push(``)
  }

  textLines.push(`========================================`)
  textLines.push(`You received this notification based on your community preferences.`)
  textLines.push(`Manage preferences: ${preferencesUrl}`)
  textLines.push(`Support: ${supportEmail}`)

  const text = textLines.join('\n')

  return {
    subject,
    html,
    text,
  }
}
