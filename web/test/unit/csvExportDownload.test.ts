import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv } from '../../src/services/csvExport'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadCsv', () => {
  it('creates a downloadable blob URL and revokes it', () => {
    const click = vi.fn()
    const link = { href: '', download: '', rel: '', click, remove: vi.fn() } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(link)
    vi.spyOn(document.body, 'append').mockImplementation(() => undefined)
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    downloadCsv('report.csv', 'a,b')

    expect(createObjectURL).toHaveBeenCalled()
    expect(link.download).toBe('report.csv')
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
