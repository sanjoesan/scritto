import { render, screen } from '@testing-library/react'
import { PrivacyBanner } from '../PrivacyBanner'

describe('PrivacyBanner', () => {
  it('warns that nothing is stored and everything is lost on close/reload', () => {
    render(<PrivacyBanner />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/nichts wird gespeichert/i)
    expect(banner).toHaveTextContent(/unwiderruflich verloren/i)
  })
})
