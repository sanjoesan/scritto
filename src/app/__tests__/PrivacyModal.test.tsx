import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrivacyModal } from '../PrivacyModal'

describe('PrivacyModal', () => {
  it('shows the privacy notice on mount', () => {
    render(<PrivacyModal />)
    expect(screen.getByText(/wichtiger hinweis zum datenschutz/i)).toBeInTheDocument()
  })

  it('dismisses when acknowledged', async () => {
    const user = userEvent.setup()
    render(<PrivacyModal />)
    await user.click(screen.getByRole('button', { name: /verstanden/i }))
    expect(screen.queryByText(/wichtiger hinweis zum datenschutz/i)).not.toBeInTheDocument()
  })
})
