import { useApp } from '../context'
import { IconMenu, IconDownload, IconX } from '../icons'
import { NAV } from '../nav'
import { TITLES } from '../data'
import { Summary } from './Summary'

export function MobileChrome() {
  const { nav, setNav, drawerOpen, setDrawerOpen, downloadExcel } = useApp()
  return (
    <>
      <header className="topbar">
        <div className="topbar__left">
          <button className="topbar__menu" aria-label="Abrir menú" onClick={() => setDrawerOpen(true)}>
            <IconMenu />
          </button>
          <div className="topbar__title">
            <span>VALIDAT3B</span>
            <small>{TITLES[nav][0]}</small>
          </div>
        </div>
        <button className="btn btn--green btn--sm" aria-label="Descargar todo en Excel" onClick={downloadExcel}>
          <IconDownload size={16} /> Excel
        </button>
      </header>

      <nav aria-label="Secciones" className="bottomnav">
        {NAV.map(({ id, short, Icon }) => (
          <button key={id} className={nav === id ? 'is-active' : ''} onClick={() => setNav(id)}>
            <Icon size={20} />
            <span>{short}</span>
          </button>
        ))}
      </nav>

      {drawerOpen && (
        <>
          <div className="overlay" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer">
            <div className="drawer__head">
              <span>VALIDAT3B</span>
              <button aria-label="Cerrar menú" onClick={() => setDrawerOpen(false)}><IconX size={15} stroke="#C7CBD6" /></button>
            </div>
            <nav className="drawer__nav">
              {NAV.map(({ id, label }) => (
                <button key={id} className={nav === id ? 'is-active' : ''} onClick={() => setNav(id)}>{label}</button>
              ))}
            </nav>
            <div className="drawer__foot">
              <Summary />
              <button className="btn btn--green btn--lg" onClick={downloadExcel}>Descargar todo en Excel</button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
