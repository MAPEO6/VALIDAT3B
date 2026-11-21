import type { ReactNode } from 'react'

function Svg({ size, children, className }: { size: number; children: ReactNode; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}
type P = { size?: number; stroke?: string }
const s = (stroke?: string) => stroke ?? 'currentColor'

export const IconPlus = ({ size = 18 }: P) => (
  <Svg size={size}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></Svg>
)
export const IconClock = ({ size = 18 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
)
export const IconSend = ({ size = 18 }: P) => (
  <Svg size={size}><path d="M3 12L21 4l-6 18-4-7-7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></Svg>
)
export const IconCheck = ({ size = 18 }: P) => (
  <Svg size={size}><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>
)
export const IconTick = ({ size = 17, stroke }: P) => (
  <Svg size={size}><path d="M5 12.5L10 17.5L19 7" stroke={s(stroke)} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></Svg>
)
export const IconXCircle = ({ size = 18 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
)
export const IconX = ({ size = 16, stroke }: P) => (
  <Svg size={size}><path d="M6 6l12 12M18 6L6 18" stroke={s(stroke)} strokeWidth="2.2" strokeLinecap="round" /></Svg>
)
export const IconMenu = ({ size = 18 }: P) => (
  <Svg size={size}><path d="M4 7h16M4 12h16M4 17h16" stroke="white" strokeWidth="2" strokeLinecap="round" /></Svg>
)
export const IconDownload = ({ size = 16, stroke }: P) => (
  <Svg size={size}>
    <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" stroke={s(stroke ?? 'white')} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)
export const IconList = ({ size = 15 }: P) => (
  <Svg size={size}><path d="M4 6h16M4 12h16M4 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></Svg>
)
export const IconUploadTray = ({ size = 15 }: P) => (
  <Svg size={size}>
    <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3M12 3v10m0-10l-3.5 3.5M12 3l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)
export const IconUpload = ({ size = 24, stroke = '#5B6272' }: P) => (
  <Svg size={size}>
    <path d="M12 16V7M12 7L8.5 10.5M12 7l3.5 3.5M5 19h14" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)
export const IconImage = ({ size = 26, stroke = '#6B7180' }: P) => (
  <Svg size={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" stroke={stroke} strokeWidth="1.8" />
    <circle cx="8.5" cy="10" r="1.6" fill={stroke} />
    <path d="M4 16l5-4 4 3 3-3 4 4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)
export const IconSpinner = ({ size = 17, light = true }: P & { light?: boolean }) => (
  <Svg size={size} className="spin">
    <circle cx="12" cy="12" r="9" stroke={light ? 'rgba(255,255,255,.35)' : '#C9D3F7'} strokeWidth="3" />
    <path d="M21 12a9 9 0 00-9-9" stroke={light ? 'white' : '#2454FF'} strokeWidth="3" strokeLinecap="round" />
  </Svg>
)
