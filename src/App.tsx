import { useState } from 'react'
import { PrivacyBanner } from './app/PrivacyBanner'
import { PrivacyModal } from './app/PrivacyModal'
import { FormatPicker } from './app/FormatPicker'
import { DocumentWorkspace } from './app/DocumentWorkspace'
import { formatModules, plannedFormats, findModuleById } from './formats/registry'
import type { OpenDocument } from './formats/types'
import { useBeforeUnloadWarning } from './lib/useBeforeUnloadWarning'

interface ActiveDocument {
  moduleId: string
  document: OpenDocument
}

function App() {
  const [active, setActive] = useState<ActiveDocument | null>(null)

  useBeforeUnloadWarning(active?.document.dirty ?? false)

  const activeModule = active ? findModuleById(active.moduleId) : undefined

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <PrivacyModal />
      <PrivacyBanner />
      <main className="flex-1 min-h-0 flex flex-col">
        {active && activeModule ? (
          <DocumentWorkspace
            module={activeModule}
            document={active.document}
            onChange={(document) => setActive({ moduleId: active.moduleId, document })}
            onClose={() => setActive(null)}
          />
        ) : (
          <FormatPicker
            modules={formatModules}
            planned={plannedFormats}
            onOpen={(moduleId, document) => setActive({ moduleId, document })}
          />
        )}
      </main>
    </div>
  )
}

export default App
