import { useApp } from '../context'
import { IconRefresh } from '../icons'

/** Indicador del backend (GET /api/health), siempre visible (heurística 1). */
export function ServerStatus({ dark = false }: { dark?: boolean }) {
  const { servidor, revisarServidor } = useApp()
  const st = servidor.estado
  const txt =
    st === 'cargando' ? 'Conectando con el servidor…'
      : st === 'caido' ? 'Servidor sin conexión'
        : servidor.info.modo === 'mock' ? 'Servidor conectado · modo simulado'
          : 'Servidor conectado'
  return (
    <div className={`srv srv--${st}${dark ? ' srv--dark' : ''}`} role="status" aria-live="polite"
      title={st === 'caido' ? 'Ejecuta «npm run server» (o «npm run dev:all») y vuelve a intentar.' : undefined}>
      <span className="srv__dot" aria-hidden="true" />
      <span className="srv__txt">{txt}</span>
      {st === 'caido' && (
        <button className="srv__retry" onClick={() => void revisarServidor()} aria-label="Reintentar conexión">
          <IconRefresh /> Reintentar
        </button>
      )}
    </div>
  )
}
