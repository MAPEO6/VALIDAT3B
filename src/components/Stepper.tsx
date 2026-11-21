import { PASOS } from '../data'
import { IconTick } from '../icons'

/** Guía de pasos de Nueva validación (heurísticas 1 y 6). */
export function Stepper({ paso, errorEn }: { paso: number; errorEn?: number }) {
  return (
    <ol className="stepper" aria-label="Pasos de la validación">
      {PASOS.map((p, i) => {
        const st = errorEn === i ? 'error' : i < paso ? 'done' : i === paso ? 'current' : 'todo'
        return (
          <li key={p} className={`stepper__item stepper__item--${st}`} aria-current={i === paso ? 'step' : undefined}>
            <span className="stepper__dot">{st === 'done' ? <IconTick size={12} stroke="white" /> : st === 'error' ? '!' : i + 1}</span>
            <span className="stepper__label">{p}</span>
          </li>
        )
      })}
    </ol>
  )
}
