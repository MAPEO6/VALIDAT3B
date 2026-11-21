import { AppProvider } from './AppProvider'
import { useApp } from './context'
import { TITLES } from './data'
import { IconDownload } from './icons'
import { MobileChrome } from './components/MobileChrome'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { NuevaValidacion } from './views/NuevaValidacion'
import { PriceCheck } from './views/PriceCheck'
import { Rechazados } from './views/Rechazados'
import { RevisionManual } from './views/RevisionManual'
import { Validados } from './views/Validados'

function Shell() {
  const { nav, downloadExcel } = useApp()
  const [title, subtitle] = TITLES[nav]
  return (
    <div className="app">
      <Sidebar />
      <MobileChrome />
      <main className="main">
        <header className="main__head">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="main__tools">
            <button className="btn btn--green btn--lg" onClick={downloadExcel}>
              <IconDownload size={17} /> Descargar todo en Excel
            </button>
            <div className="avatar" aria-hidden="true">MG</div>
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
