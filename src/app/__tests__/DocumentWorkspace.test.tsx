import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormatModule, OpenDocument } from '../../formats/types'
import { DocumentWorkspace } from '../DocumentWorkspace'

function makeModule(overrides: Partial<FormatModule<string>> = {}): FormatModule<string> {
  return {
    id: 'test-fmt',
    label: 'Test-Format',
    description: 'Ein Format für Tests.',
    extensions: ['.test'],
    mimeTypes: ['text/plain'],
    importFile: async (file) => file.text(),
    exportFile: async (content) => new Blob([content], { type: 'text/plain' }),
    createNew: () => '',
    defaultName: 'unbenannt',
    editor: ({ document, onChange }) => (
      <textarea
        aria-label="editor"
        value={document.content}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
    ...overrides,
  }
}

const baseDoc: OpenDocument<string> = { fileName: 'brief.test', content: 'hallo', dirty: false }

describe('DocumentWorkspace', () => {
  it('exports the current content as a download', async () => {
    const exportFile = vi.fn(async (content: string) => new Blob([content]))
    const onChange = vi.fn()
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    render(
      <DocumentWorkspace
        module={makeModule({ exportFile })}
        document={{ ...baseDoc, dirty: true }}
        onChange={onChange}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /exportieren/i }))

    expect(exportFile).toHaveBeenCalledWith('hallo', 'brief.test')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dirty: false }))
    vi.unstubAllGlobals()
  })

  it('shows an export error instead of crashing', async () => {
    const exportFile = vi.fn(async () => {
      throw new Error('export kaputt')
    })
    const user = userEvent.setup()

    render(
      <DocumentWorkspace
        module={makeModule({ exportFile })}
        document={baseDoc}
        onChange={() => {}}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /exportieren/i }))
    expect(await screen.findByText(/export kaputt/i)).toBeInTheDocument()
  })

  it('asks for confirmation before closing a dirty document', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <DocumentWorkspace
        module={makeModule()}
        document={{ ...baseDoc, dirty: true }}
        onChange={() => {}}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: /formate/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('closes without confirmation when the document is not dirty', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <DocumentWorkspace module={makeModule()} document={baseDoc} onChange={() => {}} onClose={onClose} />,
    )

    await user.click(screen.getByRole('button', { name: /formate/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
