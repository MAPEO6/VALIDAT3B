import { useApp } from '../context'
import { IconHelp, IconMenu, IconDownload, IconX } from '../icons'
import { NAV } from '../nav'
import { TITLES } from '../data'
import { ServerStatus } from './ServerStatus'
import { Summary } from './Summary'

export function MobileChrome() {
  const { nav, setNav, drawerOpen, setDrawerOpen, downloadExcel, setHelpOpen, rev } = useApp()
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
        <div className="topbar__right">
          <button className="topbar__menu" aria-label="Ayuda" onClick={() => setHelpOpen(true)}><IconHelp /></button>
          <button className="btn btn--green btn--sm" aria-label="Descargar todo en Excel" onClick={downloadExcel}>
            <IconDownload size={16} /> Excel
          </button>
        </div>
      </header>
      <div className="mobile-srv"><ServerStatus /></div>

      <nav aria-label="Secciones" className="bottomnav">
        {NAV.map(({ id, short, Icon }) => (
          <button key={id} className={nav === id ? 'is-active' : ''} aria-current={nav === id ? 'page' : undefined} onClick={() => setNav(id)}>
            <span className="bottomnav__icon"><Icon size={20} />{id === 'revision' && rev.length > 0 && <span className="dot-badge">{rev.length}</span>}</span>
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
              <ServerStatus dark />
              <Summary />
              <button className="btn btn--green btn--lg" onClick={downloadExcel}>Descargar todo en Excel</button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
