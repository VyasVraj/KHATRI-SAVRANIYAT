import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvatarImage } from '@/features/media/components/AvatarImage'

describe('AvatarImage Component (Static SSR / Node environment)', () => {
  it('renders img element when valid src is provided', () => {
    const html = renderToStaticMarkup(
      <AvatarImage
        src="https://example.com/avatar.jpg"
        alt="User portrait"
        name="John Doe"
      />
    )
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/avatar.jpg"')
    expect(html).toContain('alt="User portrait"')
  })

  it('renders initials when src is not provided', () => {
    const html = renderToStaticMarkup(<AvatarImage name="Ramesh Sharma" />)
    expect(html).toContain('RS')
  })

  it('renders family icon fallback when isFamily is true and no name is provided', () => {
    const html = renderToStaticMarkup(<AvatarImage isFamily />)
    expect(html).toContain('<svg')
  })

  it('applies shape classes correctly', () => {
    const circleHtml = renderToStaticMarkup(<AvatarImage shape="circle" name="A" />)
    expect(circleHtml).toContain('rounded-full')

    const roundedHtml = renderToStaticMarkup(<AvatarImage shape="rounded" name="A" />)
    expect(roundedHtml).toContain('rounded-lg')
  })

  it('applies size classes correctly', () => {
    const xlHtml = renderToStaticMarkup(<AvatarImage size="xl" name="A" />)
    expect(xlHtml).toContain('h-20 w-20')

    const smHtml = renderToStaticMarkup(<AvatarImage size="sm" name="A" />)
    expect(smHtml).toContain('h-8 w-8')
  })
})
