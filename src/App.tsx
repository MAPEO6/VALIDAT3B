import { useEffect } from 'react'
import { AppProvider } from './AppProvider'
import { useApp } from './context'
import { TITLES } from './data'
import { IconDownload, IconHelp } from './icons'
import { ConfirmDialog, HelpDialog } from './components/Dialogs'
import { MobileChrome } from './components/MobileChrome'
import { ServerStatus } from './components/ServerStatus'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { NuevaValidacion } from './views/NuevaValidacion'
import { PriceCheck } from './views/PriceCheck'
import { Rechazados } from './views/Rechazados'
import { RevisionManual } from './views/RevisionManual'
import { Validados } from './views/Validados'

/** Atajos: Ctrl/⌘+Enter valida, Esc cancela el análisis, ? abre la ayuda (heurística 7). */
function useAtajos() {
  const s = useApp()
  const { nav, validar, cancelar, isLoading, setHelpOpen, helpOpen, confirm } = s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (helpOpen || confirm) return
      const t = e.target as HTMLElement
      const escribiendo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
      if (nav === 'nueva' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void validar()
      } else if (e.key === 'Escape' && isLoading) {
        cancelar()
      } else if (e.key === '?' && !escribiendo) {
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, validar, cancelar, isLoading, setHelpOpen, helpOpen, confirm])
}

function Shell() {
  const { nav, downloadExcel, setHelpOpen, validados } = useApp()
  useAtajos()
  const [title, subtitle] = TITLES[nav]
  return (
    <div className="app">
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <Sidebar />
      <MobileChrome />
      <main className="main" id="contenido">
        <header className="main__head">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="main__tools">
            <ServerStatus />
            <button className="btn btn--outline btn--lg" onClick={() => setHelpOpen(true)} aria-label="Ayuda (tecla ?)">
              <IconHelp size={17} /> Ayuda
            </button>
            <button className="btn btn--green btn--lg" onClick={downloadExcel} disabled={validados.length === 0}
              title={validados.length === 0 ? 'Aún no hay productos validados' : undefined}>
              <IconDownload size={17} /> Descargar todo en Excel
            </button>
          </div>
        </header>
        <p className="mobile-sub">{subtitle}</p>
        {nav === 'nueva' && <NuevaValidacion />}
        {nav === 'revision' && <RevisionManual />}
        {nav === 'pricecheck' && <PriceCheck />}
        {nav === 'validados' && <Validados />}
        {nav === 'rechazados' && <Rechazados />}
      </main>
      <Toast />
      <ConfirmDialog />
      <HelpDialog />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
