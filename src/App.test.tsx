import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('renders the privacy modal, banner, and the format picker', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText(/wichtiger hinweis zum datenschutz/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /verstanden/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/nichts wird gespeichert/i)
    expect(screen.getByRole('heading', { name: /papercut/i })).toBeInTheDocument()
  })

  it('never touches localStorage or sessionStorage', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /verstanden/i }))

    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})
