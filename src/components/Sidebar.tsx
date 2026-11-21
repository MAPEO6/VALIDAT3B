import { useApp } from '../context'
import { IconTick } from '../icons'
import { NAV } from '../nav'
import { Summary } from './Summary'

export function Sidebar() {
  const { nav, setNav, rev, queue, validados, rech } = useApp()
  const counts = { nueva: 0, revision: rev.length, pricecheck: queue.length, validados: validados.length, rechazados: rech.length }
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__logo"><IconTick size={19} stroke="white" /></div>
        <div className="brand__text">
          <span>VALIDAT3B</span>
          <small>Validación de capturas</small>
        </div>
      </div>
      <nav aria-label="Secciones" className="sidenav">
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} className={`sidenav__btn${nav === id ? ' is-active' : ''}`} onClick={() => setNav(id)}>
            <span className="sidenav__label"><Icon size={18} />{label}</span>
            {counts[id] > 0 && <span className="sidenav__badge">{counts[id]}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar__foot">
        <div className="sidebar__cap">Resumen de hoy</div>
        <Summary />
      </div>
    </aside>
  )
}
