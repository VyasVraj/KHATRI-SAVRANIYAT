import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvatarUploadDialog } from '@/features/media/components/AvatarUploadDialog'

describe('AvatarUploadDialog Component (Static SSR / Node environment)', () => {
  it('does not render markup when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <AvatarUploadDialog
        isOpen={false}
        onClose={vi.fn()}
        target={{ type: 'profile', id: 'u-1' }}
        onSuccess={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders modal markup and instructions when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <AvatarUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        target={{ type: 'person', id: 'p-1' }}
        onSuccess={vi.fn()}
      />
    )
    expect(html).toContain('Update Photo')
    expect(html).toContain('Click to select or drag and drop photo')
    expect(html).toContain('Save Photo')
    expect(html).toContain('Cancel')
  })

  it('renders family title when target is family', () => {
    const html = renderToStaticMarkup(
      <AvatarUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        target={{ type: 'family', id: 'f-1' }}
        onSuccess={vi.fn()}
      />
    )
    expect(html).toContain('Update Family Crest')
  })

  it('renders Remove photo button when currentAvatarUrl is provided', () => {
    const html = renderToStaticMarkup(
      <AvatarUploadDialog
        isOpen={true}
        onClose={vi.fn()}
        target={{ type: 'profile', id: 'u-1' }}
        currentAvatarUrl="https://example.com/existing.jpg"
        onSuccess={vi.fn()}
      />
    )
    expect(html).toContain('Remove current photo')
  })
})
