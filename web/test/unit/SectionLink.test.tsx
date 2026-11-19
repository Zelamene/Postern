import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionLink } from '../../src/components/common/SectionLink'
import { scrollToSection } from '../../src/utils/scroll'

vi.mock('../../src/utils/scroll', () => ({ scrollToSection: vi.fn() }))

const scroll = vi.mocked(scrollToSection)

afterEach(() => {
  vi.clearAllMocks()
})

describe('SectionLink', () => {
  it('scrolls to its section on a plain primary click', () => {
    const onClick = vi.fn()

    render(
      <SectionLink sectionId="features" onClick={onClick} className="extra">
        Features
      </SectionLink>,
    )

    const link = screen.getByRole('link', { name: 'Features' })
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveClass('extra')

    fireEvent.click(link, { button: 0 })

    expect(onClick).toHaveBeenCalledOnce()
    expect(scroll).toHaveBeenCalledWith('features')
  })

  it('does not scroll when the click handler prevents default', () => {
    render(
      <SectionLink sectionId="features" onClick={(event) => event.preventDefault()}>
        Features
      </SectionLink>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Features' }))

    expect(scroll).not.toHaveBeenCalled()
  })

  it('ignores non-primary button clicks', () => {
    render(<SectionLink sectionId="features">Features</SectionLink>)

    fireEvent.click(screen.getByRole('link', { name: 'Features' }), { button: 1 })

    expect(scroll).not.toHaveBeenCalled()
  })

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)(
    'ignores %s-modified clicks',
    (modifier) => {
      render(<SectionLink sectionId="features">Features</SectionLink>)

      fireEvent.click(screen.getByRole('link', { name: 'Features' }), { [modifier]: true })

      expect(scroll).not.toHaveBeenCalled()
    },
  )
})
