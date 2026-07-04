import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('ignores a second synchronous click while an export is already in flight (no double download)', async () => {
    const exportFile = vi.fn(async (content: string) => new Blob([content]))
    const onChange = vi.fn()

    render(
      <DocumentWorkspace
        module={makeModule({ exportFile })}
        document={{ ...baseDoc, dirty: true }}
        onChange={onChange}
        onClose={() => {}}
      />,
    )

    const button = screen.getByRole('button', { name: /exportieren/i })
    // Two clicks fired in the same synchronous tick simulate a very fast double-click
    // or synthetic event pair — both happen before React commits `disabled={exporting}`.
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(exportFile).toHaveBeenCalledTimes(1)
  })

  it('does not clear "dirty" (or clobber the edit) when editing happens while export is still in flight', async () => {
    let resolveExport: (blob: Blob) => void = () => {}
    const exportPromise = new Promise<Blob>((resolve) => {
      resolveExport = resolve
    })
    const exportFile = vi.fn(() => exportPromise)
    const onChange = vi.fn()
    const user = userEvent.setup()
    const testModule = makeModule({ exportFile })

    const { rerender } = render(
      <DocumentWorkspace
        module={testModule}
        document={{ ...baseDoc, dirty: true }}
        onChange={onChange}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /exportieren/i }))
    expect(exportFile).toHaveBeenCalledTimes(1)

    // Simulate the parent re-rendering with a newer document because the user kept
    // typing while `module.exportFile(...)` was still pending.
    rerender(
      <DocumentWorkspace
        module={testModule}
        document={{ ...baseDoc, content: 'hallo mehr', dirty: true }}
        onChange={onChange}
        onClose={() => {}}
      />,
    )

    resolveExport(new Blob(['hallo']))
    // Let the pending `await module.exportFile(...)` continuation run.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The export resolved against the *stale* snapshot ('hallo'), which no longer
    // matches the current content ('hallo mehr') — onChange must not be called with
    // a stale-content/dirty:false payload that would clobber the newer edit.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('recovers when exportFile throws synchronously instead of rejecting', async () => {
    // A non-async mock that throws immediately (no Promise involved at all) exercises
    // the case where `module.exportFile(...)` fails before any `await` is reached —
    // the `finally` block must still run so the button/ref state resets.
    const exportFile = vi.fn(() => {
      throw new Error('kaputt')
    }) as unknown as (content: string, fileName: string) => Promise<Blob>
    const user = userEvent.setup()

    render(
      <DocumentWorkspace
        module={makeModule({ exportFile })}
        document={baseDoc}
        onChange={() => {}}
        onClose={() => {}}
      />,
    )

    const button = screen.getByRole('button', { name: /exportieren/i })
    await user.click(button)

    expect(await screen.findByText(/kaputt/i)).toBeInTheDocument()
    expect(button).toHaveTextContent('Exportieren')
    expect(button).not.toBeDisabled()

    // The re-entrancy guard must also have been reset, so a subsequent click still
    // calls exportFile again instead of being silently swallowed forever.
    await user.click(button)
    expect(exportFile).toHaveBeenCalledTimes(2)
  })
})
