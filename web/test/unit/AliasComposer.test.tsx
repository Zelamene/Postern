import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AliasComposer } from '../../src/components/app/AliasComposer'
import type { CreateAliasInput } from '../../src/services/aliasService'
import type { CreateAliasOutcome } from '../../src/hooks/useAliases'

function setup(outcome: CreateAliasOutcome = { ok: true, warning: null }) {
  const onCreate = vi.fn(
    async (_input: CreateAliasInput): Promise<CreateAliasOutcome> => outcome,
  )

  render(
    <AliasComposer
      isCreating={false}
      error={null}
      existingDomain="postern.local"
      onCreate={onCreate}
    />,
  )

  return { onCreate }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AliasComposer', () => {
  it('defaults to the Other category and previews a masked suffix', async () => {
    const user = userEvent.setup()
    setup()

    expect(screen.getByLabelText('Category')).toHaveValue('other')
    expect(screen.getByText('youralias.····@postern.local')).toBeVisible()

    await user.type(screen.getByLabelText('Label'), 'Shop')
    expect(screen.getByText('shop.····@postern.local')).toBeVisible()
  })

  it('sends the label, category and expected sender when submitted', async () => {
    const user = userEvent.setup()
    const { onCreate } = setup()

    await user.type(screen.getByLabelText('Label'), 'Bank')
    await user.selectOptions(screen.getByLabelText('Category'), 'finance')
    await user.type(screen.getByLabelText(/Expected sender/), 'alerts@bank.example')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    expect(onCreate).toHaveBeenCalledWith({
      label: 'bank',
      category: 'finance',
      expectedSender: 'alerts@bank.example',
    })
  })

  it('rejects a sender that is neither an address nor a domain', async () => {
    const user = userEvent.setup()
    const { onCreate } = setup()

    await user.type(screen.getByLabelText('Label'), 'bank')
    await user.type(screen.getByLabelText(/Expected sender/), 'not-a-sender')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter the sender address or domain',
    )
  })

  it('surfaces the warning when the alias exists but the sender was not saved', async () => {
    const user = userEvent.setup()
    setup({
      ok: true,
      warning:
        'Alias created, but alerts@bank.example was not saved as an expected sender. You can add it from the alias page.',
    })

    await user.type(screen.getByLabelText('Label'), 'bank')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'was not saved as an expected sender',
    )
  })

  it('previews without calling the API', async () => {
    const user = userEvent.setup()
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    setup()

    await user.type(screen.getByLabelText('Label'), 'newsletter')

    expect(fetchStub).not.toHaveBeenCalled()
  })
})
