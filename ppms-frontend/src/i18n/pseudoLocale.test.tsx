import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from './index'
import { enResources } from '../locales/en'
import { renderWithProviders } from '../test/renderWithProviders'
import { Pagination } from '../components/Pagination'
import { ConfirmButton } from '../components/ConfirmButton'
import { DiscardChangesDialog } from '../components/DiscardChangesDialog'
import { RejectReasonDialog } from '../components/RejectReasonDialog'
import { SearchableSelect } from '../components/SearchableSelect'
import { ChangePasswordModal } from '../components/ChangePasswordModal'
import { OfflineBanner } from '../components/OfflineBanner'
import { PeriodChangeNote } from '../components/PeriodChangeNote'
import { DatePresetChips } from '../components/DatePresetChips'

// Hindi and Marathi labels run about 35% longer than English; the pseudo text is padded by that much and bracketed,
// so any text that is not bracketed was typed into a component instead of coming from the translation files.
const OPEN = '⟦'
const CLOSE = '⟧'

function pseudoLocalize(value: unknown): unknown {
  if (typeof value === 'string') return `${OPEN}${value}${'~'.repeat(Math.ceil(value.length * 0.35))}${CLOSE}`
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, pseudoLocalize(child)]))
  }
  return value
}

const PSEUDO = (text: string) => pseudoLocalize(text) as string

function untranslatedText(container: HTMLElement): string[] {
  const found: string[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? ''
    if (/[A-Za-z]{2,}/.test(text) && !(text.startsWith(OPEN) && text.endsWith(CLOSE))) found.push(text)
  }
  for (const element of container.querySelectorAll('[aria-label], [title], [placeholder]')) {
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      const text = element.getAttribute(attribute)?.trim()
      if (text && /[A-Za-z]{2,}/.test(text) && !(text.startsWith(OPEN) && text.endsWith(CLOSE))) found.push(`${attribute}="${text}"`)
    }
  }
  return found
}

beforeAll(() => {
  for (const [namespace, resources] of Object.entries(enResources)) {
    i18n.addResourceBundle('en', namespace, pseudoLocalize(resources), true, true)
  }
})

describe('pseudo-locale check of shared components', () => {
  it('pagination, confirm and date chips take every word from the translation files', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(
      <div>
        <Pagination
          data={{ content: [], page: 1, pageSize: 10, totalElements: 120000, totalPages: 12000, hasNext: true, hasPrevious: true }}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
        />
        <ConfirmButton onConfirm={() => {}} />
        <DatePresetChips range={{ from: '2026-01-01', to: '2026-01-02' }} onSelect={() => {}} />
        <PeriodChangeNote current={150} previous={100} />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: PSEUDO('Delete') }))

    expect(untranslatedText(container)).toEqual([])
    expect(screen.getByText(PSEUDO('Rows per page'))).toBeInTheDocument()
  })

  it('dialogs take every word from the translation files', () => {
    renderWithProviders(
      <div>
        <DiscardChangesDialog formName={PSEUDO('Close shift')} onDiscard={() => {}} onKeepEditing={() => {}} />
        <RejectReasonDialog title={PSEUDO('Reject')} subtitle={PSEUDO('Reject')} isPending={false} error={null} onConfirm={() => {}} onClose={() => {}} />
        <ChangePasswordModal onClose={() => {}} />
      </div>,
    )

    expect(untranslatedText(document.body)).toEqual([])
  })

  it('the open select list and the offline banner take every word from the translation files', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const options = Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: `${OPEN}${index}${CLOSE}` }))
    renderWithProviders(
      <div>
        <OfflineBanner />
        <SearchableSelect label={PSEUDO('Language')} value="" onChange={() => {}} options={options} />
      </div>,
    )
    await user.click(screen.getByRole('button', { expanded: false }))
    await user.type(screen.getByRole('combobox'), 'zz')

    expect(untranslatedText(document.body)).toEqual([])
  })
})
