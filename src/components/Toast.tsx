import { useApp } from '../context'

export function Toast() {
  const { toast } = useApp()
  return toast ? <div role="status" className="toast">{toast}</div> : null
}
