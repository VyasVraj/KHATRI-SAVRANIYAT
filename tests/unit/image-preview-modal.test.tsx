import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AvatarImage } from '@/features/media/components/AvatarImage'
import { ImagePreviewModal } from '@/features/media/components/ImagePreviewModal'

describe('ImagePreviewModal and Click-to-Enlarge Profile Photo', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('renders ImagePreviewModal when isOpen is true with correct attributes', () => {
    const handleClose = vi.fn()
    render(
      <ImagePreviewModal
        isOpen={true}
        onClose={handleClose}
        src="https://example.com/test-photo.jpg"
        alt="Ramesh Khatri's photo"
        title="Ramesh Khatri"
      />
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    const img = screen.getByAltText("Ramesh Khatri's photo")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/test-photo.jpg')
    expect(img.className).toContain('object-contain')

    expect(screen.getByText('Ramesh Khatri')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('closes when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <ImagePreviewModal
        isOpen={true}
        onClose={handleClose}
        src="https://example.com/test-photo.jpg"
      />
    )

    const closeBtn = screen.getByRole('button', { name: /close preview/i })
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('closes when pressing Escape key', () => {
    const handleClose = vi.fn()
    render(
      <ImagePreviewModal
        isOpen={true}
        onClose={handleClose}
        src="https://example.com/test-photo.jpg"
      />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking backdrop overlay', () => {
    const handleClose = vi.fn()
    render(
      <ImagePreviewModal
        isOpen={true}
        onClose={handleClose}
        src="https://example.com/test-photo.jpg"
      />
    )

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('opens preview when clicking an AvatarImage with photo', () => {
    const parentClickHandler = vi.fn()
    render(
      <div onClick={parentClickHandler}>
        <AvatarImage
          src="https://example.com/profile.jpg"
          name="Pravin Khatri"
          alt="Pravin Khatri"
        />
      </div>
    )

    const trigger = screen.getByRole('button', { name: /view larger photo/i })
    expect(trigger).toBeInTheDocument()

    // Clicking photo opens modal and stops propagation to parent
    fireEvent.click(trigger)
    expect(parentClickHandler).not.toHaveBeenCalled()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Pravin Khatri')).toBeInTheDocument()
  })

  it('does NOT open preview or show button when avatar is initials/fallback', () => {
    render(
      <AvatarImage
        src={null}
        name="Sunil Khatri"
      />
    )

    expect(screen.queryByRole('button', { name: /view larger photo/i })).not.toBeInTheDocument()
    expect(screen.getByText('SK')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does NOT enable preview when enablePreview={false}', () => {
    render(
      <AvatarImage
        src="https://example.com/header-avatar.jpg"
        name="Header User"
        enablePreview={false}
      />
    )

    expect(screen.queryByRole('button', { name: /view larger photo/i })).not.toBeInTheDocument()
    const img = screen.getByAltText("Header User's avatar")
    expect(img).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
