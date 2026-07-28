import type { JSX } from 'react'

/**
 * One shared icon frame: 24 × 24 viewBox, dark outlines, rounded caps/joins and
 * a muted fill so every icon reads on light surfaces. Colour is never the only
 * carrier of meaning — every control also has a label or aria-label.
 */

export const ICON_FILLS = {
  blue: '#cfe0f5',
  coral: '#f5c0ad',
  yellow: '#f4dc9a',
  mint: '#c4e6d3',
  violet: '#d6cbf2',
  amber: '#f2d3a2',
  green: '#c2e2c8',
  purple: '#d2c6ea',
  lilac: '#e6dcf9',
  grey: '#e3e4e7',
} as const

export type IconName = keyof typeof ICONS

const ICONS = {
  surface: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" fill={ICON_FILLS.blue} />
      <path d="M6.5 8h11M6.5 12h11M6.5 16h6" opacity=".55" />
    </>
  ),
  newObject: (
    <>
      <rect x="3.5" y="8" width="11" height="10" rx="1.2" fill={ICON_FILLS.coral} />
      <ellipse cx="16" cy="10.5" rx="5" ry="4.5" fill={ICON_FILLS.yellow} fillOpacity=".85" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <rect x="3.5" y="3.5" width="5.6" height="5.6" fill={ICON_FILLS.mint} />
      <path d="M9.1 3.5v17M14.7 3.5v17M3.5 9.1h17M3.5 14.7h17" />
    </>
  ),
  snapGrid: (
    <>
      <rect x="12" y="3.5" width="8.5" height="8.5" rx="1" fill={ICON_FILLS.violet} />
      <path d="M12 7.75h8.5M16.25 3.5V12" opacity=".6" />
      <path d="M4 20v-6a3.5 3.5 0 0 1 7 0v6" fill="none" />
      <path d="M4 17.5h3M8 17.5h3" />
    </>
  ),
  snapObjects: (
    <>
      <rect x="2.8" y="5" width="6" height="6" rx="1" fill={ICON_FILLS.amber} />
      <ellipse cx="18.5" cy="8" rx="3" ry="3" fill={ICON_FILLS.amber} fillOpacity=".7" />
      <path d="M7 20v-5a3.2 3.2 0 0 1 6.4 0v5" fill="none" />
      <path d="M7 17.6h2.6M10.8 17.6h2.6" />
    </>
  ),
  align: (
    <>
      <path d="M4 3.5v17" />
      <rect x="7" y="5" width="12" height="4" rx="1" fill={ICON_FILLS.blue} />
      <rect x="7" y="11" width="7.5" height="4" rx="1" fill={ICON_FILLS.blue} />
      <rect x="7" y="17" width="10" height="3.5" rx="1" fill={ICON_FILLS.blue} />
    </>
  ),
  distribute: (
    <>
      <rect x="2.8" y="8" width="4.4" height="8" rx="1" fill={ICON_FILLS.green} />
      <rect x="9.8" y="8" width="4.4" height="8" rx="1" fill={ICON_FILLS.green} />
      <rect x="16.8" y="8" width="4.4" height="8" rx="1" fill={ICON_FILLS.green} />
      <path d="M7.9 19h1.2M14.9 19h1.2" />
      <path d="M8.5 19h-.6m7.6 0h-.6" />
    </>
  ),
  group: (
    <>
      <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="2" strokeDasharray="3 2.4" opacity=".8" fill="none" />
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" fill={ICON_FILLS.purple} />
      <rect x="10.5" y="10.5" width="8" height="8" rx="1" fill={ICON_FILLS.purple} fillOpacity=".75" />
    </>
  ),
  ungroup: (
    <>
      <path d="M2.6 7.5v-3a2 2 0 0 1 2-2h3M21.4 7.5v-3a2 2 0 0 0-2-2h-3M2.6 16.5v3a2 2 0 0 0 2 2h3M21.4 16.5v3a2 2 0 0 1-2 2h-3" fill="none" />
      <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1" fill={ICON_FILLS.lilac} />
      <rect x="11" y="11" width="7.5" height="7.5" rx="1" fill={ICON_FILLS.yellow} fillOpacity=".8" />
    </>
  ),
  forward: (
    <>
      <rect x="7" y="11" width="12" height="9" rx="1.4" fill={ICON_FILLS.grey} />
      <rect x="4" y="4" width="12" height="9" rx="1.4" fill={ICON_FILLS.coral} />
    </>
  ),
  backward: (
    <>
      <rect x="4" y="4" width="12" height="9" rx="1.4" fill={ICON_FILLS.grey} />
      <rect x="7" y="11" width="12" height="9" rx="1.4" fill={ICON_FILLS.blue} />
    </>
  ),
  toFront: (
    <>
      <path d="M3 2.6h18" />
      <rect x="4" y="12" width="12" height="8.5" rx="1.4" fill={ICON_FILLS.grey} />
      <rect x="8" y="5.5" width="12" height="8.5" rx="1.4" fill={ICON_FILLS.coral} />
    </>
  ),
  toBack: (
    <>
      <path d="M3 21.4h18" />
      <rect x="8" y="3.5" width="12" height="8.5" rx="1.4" fill={ICON_FILLS.grey} />
      <rect x="4" y="10" width="12" height="8.5" rx="1.4" fill={ICON_FILLS.blue} />
    </>
  ),
  alignLeft: (
    <>
      <path d="M3.5 3v18" />
      <rect x="6.5" y="5.5" width="13" height="5" rx="1" fill={ICON_FILLS.blue} />
      <rect x="6.5" y="13.5" width="8.5" height="5" rx="1" fill={ICON_FILLS.blue} fillOpacity=".7" />
    </>
  ),
  alignCenterX: (
    <>
      <rect x="5.5" y="5.5" width="13" height="5" rx="1" fill={ICON_FILLS.blue} />
      <rect x="7.75" y="13.5" width="8.5" height="5" rx="1" fill={ICON_FILLS.blue} fillOpacity=".7" />
      <path d="M12 3v18" strokeDasharray="2.5 2.5" />
    </>
  ),
  alignRight: (
    <>
      <path d="M20.5 3v18" />
      <rect x="4.5" y="5.5" width="13" height="5" rx="1" fill={ICON_FILLS.blue} />
      <rect x="9" y="13.5" width="8.5" height="5" rx="1" fill={ICON_FILLS.blue} fillOpacity=".7" />
    </>
  ),
  alignTop: (
    <>
      <path d="M3 3.5h18" />
      <rect x="5.5" y="6.5" width="5" height="13" rx="1" fill={ICON_FILLS.blue} />
      <rect x="13.5" y="6.5" width="5" height="8.5" rx="1" fill={ICON_FILLS.blue} fillOpacity=".7" />
    </>
  ),
  alignMiddleY: (
    <>
      <rect x="5.5" y="5.5" width="5" height="13" rx="1" fill={ICON_FILLS.blue} />
      <rect x="13.5" y="7.75" width="5" height="8.5" rx="1" fill={ICON_FILLS.blue} fillOpacity=".7" />
      <path d="M3 12h18" strokeDasharray="2.5 2.5" />
    </>
  ),
  alignBottom: (
    <>
      <path d="M3 20.5h18" />
      <rect x="5.5" y="4.5" width="5" height="13" rx="1" fill={ICON_FILLS.blue} />
      <rect x="13.5" y="9" width="5" height="8.5" rx="1" fill={ICON_FILLS.blue} fillOpacity=".7" />
    </>
  ),
  distributeH: (
    <>
      <rect x="2.5" y="4" width="4" height="7" rx="1" fill={ICON_FILLS.green} />
      <rect x="10" y="4" width="4" height="7" rx="1" fill={ICON_FILLS.green} />
      <rect x="17.5" y="4" width="4" height="7" rx="1" fill={ICON_FILLS.green} />
      <path d="M4 17.5h16" />
      <path d="m7 14.5-3 3 3 3M17 14.5l3 3-3 3" fill="none" />
    </>
  ),
  distributeV: (
    <>
      <rect x="4" y="2.5" width="7" height="4" rx="1" fill={ICON_FILLS.green} />
      <rect x="4" y="10" width="7" height="4" rx="1" fill={ICON_FILLS.green} />
      <rect x="4" y="17.5" width="7" height="4" rx="1" fill={ICON_FILLS.green} />
      <path d="M17.5 4v16" />
      <path d="m14.5 7 3-3 3 3M14.5 17l3 3 3-3" fill="none" />
    </>
  ),
  anchor: (
    <>
      <circle cx="12" cy="12" r="7.5" fill={ICON_FILLS.yellow} fillOpacity=".7" />
      <circle cx="12" cy="12" r="3.2" fill={ICON_FILLS.yellow} />
      <path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4" />
    </>
  ),
  measure: (
    <>
      <path d="M4 4.5v15M20 4.5v15" />
      <path d="M4 12h16" />
      <rect x="8" y="8.6" width="8" height="6.8" rx="1" fill="#ffffff" />
    </>
  ),
  unit: (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="1.5" fill={ICON_FILLS.blue} />
      <path d="M6.5 7v4M10 7v2.6M13.5 7v4M17 7v2.6" />
    </>
  ),
  color: (
    <>
      <path d="M12 2.8c3.6 4.2 6 7.2 6 9.9a6 6 0 0 1-12 0c0-2.7 2.4-5.7 6-9.9Z" fill={ICON_FILLS.coral} />
      <path d="M9 13.6a3 3 0 0 0 3 3" opacity=".55" />
    </>
  ),
  undo: (
    <>
      <path d="M4 9.5h9a5.5 5.5 0 0 1 0 11H8.5" fill={ICON_FILLS.mint} fillOpacity=".55" />
      <path d="m8 5-4.4 4.5L8 14" fill="none" />
    </>
  ),
  redo: (
    <>
      <path d="M20 9.5h-9a5.5 5.5 0 0 0 0 11h4.5" fill={ICON_FILLS.amber} fillOpacity=".5" />
      <path d="m16 5 4.4 4.5L16 14" fill="none" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6.8" fill={ICON_FILLS.blue} />
      <path d="M15.4 15.4 21 21M7.8 10.5h5.4M10.5 7.8v5.4" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6.8" fill={ICON_FILLS.blue} />
      <path d="M15.4 15.4 21 21M7.8 10.5h5.4" />
    </>
  ),
  fit: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.2" fill={ICON_FILLS.mint} />
      <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" fill="none" />
    </>
  ),
  transpose: (
    <>
      <rect x="3" y="3.5" width="8" height="6" rx="1" fill={ICON_FILLS.violet} />
      <rect x="14.5" y="12.5" width="6" height="8" rx="1" fill={ICON_FILLS.violet} />
      <path d="M12.5 6.5h5.5M18 6.5l-2-2M18 6.5l-2 2M11.5 17.5H6M6 17.5l2-2M6 17.5l2 2" />
    </>
  ),
  duplicate: (
    <>
      <rect x="3.5" y="3.5" width="12" height="12" rx="1.4" fill={ICON_FILLS.grey} />
      <rect x="8.5" y="8.5" width="12" height="12" rx="1.4" fill={ICON_FILLS.blue} />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V4.2c0-.6.5-1.2 1.2-1.2h3.6c.7 0 1.2.6 1.2 1.2v2.3" fill="none" />
      <path d="M6.5 6.5h11l-.9 12.6c-.05.8-.7 1.4-1.5 1.4H8.9c-.8 0-1.45-.6-1.5-1.4Z" fill={ICON_FILLS.coral} fillOpacity=".6" />
    </>
  ),
  multiSelect: (
    <>
      <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="2" strokeDasharray="3 2.4" fill="none" />
      <rect x="5.6" y="5.6" width="6" height="6" rx="1" fill={ICON_FILLS.blue} />
      <rect x="12.4" y="12.4" width="6" height="6" rx="1" fill={ICON_FILLS.blue} />
      <path d="m14 8 2 2 4-4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" fill={ICON_FILLS.grey} />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4" fill="none" />
      <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  project: (
    <>
      <path d="M3.5 6.5c0-1 .8-1.8 1.8-1.8h3.4l2 2.4h8c1 0 1.8.8 1.8 1.8v8.6c0 1-.8 1.8-1.8 1.8H5.3c-1 0-1.8-.8-1.8-1.8Z" fill={ICON_FILLS.amber} />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.2l9.5-9.5a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8Z" fill={ICON_FILLS.yellow} fillOpacity=".7" />
      <path d="m14.2 6.6 3.2 3.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.6 4.5L19 7" />,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" fill="none" />,
} satisfies Record<string, JSX.Element>

export type IconProps = {
  name: IconName
  size?: number
  className?: string
  title?: string
}

export function Icon({ name, size = 18, className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  )
}
