import { IconImage } from '../icons'

/** Miniatura de una foto; sin foto muestra el marcador de posición del diseño. */
export function Thumb({ src, alt, icon = 28, className }: { src?: string; alt: string; icon?: number; className?: string }) {
  return (
    <div className={`thumb ${className ?? ''}`}>
      {src ? <img src={src} alt={alt} /> : <IconImage size={icon} />}
    </div>
  )
}
