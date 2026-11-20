import type { SVGProps } from 'react'

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5',
  life: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  sport: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  rpg: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.4 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  history: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5M12 8v4.5l3 1.8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5z',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.5 1 2 1.8 2C10.5 8 11 5.5 12 3Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM14.5 9.5c-.6-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.2 5 3.8 0 1.2-1.1 2-2.5 2-1.1 0-2-.5-2.6-1.3M12 6.8v1.5M12 15.7v1.5',
  book: 'M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3ZM5 16.5a3 3 0 0 1 3-3h10',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6Z',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  shield: 'M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6ZM9 12l2.2 2.2L15.5 10',
  download: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14',
  upload: 'M12 16V5M7.5 9 12 4.5 16.5 9M5 19.5h14',
  key: 'M15.5 14.5a4.5 4.5 0 1 0-4-2.5L4 19.5V22h2.5v-2H9v-2h2l1.5-1.5a4.5 4.5 0 0 0 3-1.5ZM16.5 8.5h.01',
  calendar: 'M5 5.5h14v14H5ZM5 9.5h14M9 3.5v4M15 3.5v4',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15ZM10 20a2 2 0 0 0 4 0',
  report: 'M6 3.5h8.5L19 8v12.5H6ZM14 3.5V8h5M9 12.5h7M9 16h7',
  alert: 'M12 4 3 19.5h18ZM12 10v4.5M12 17.2h.01',
  dumbbell: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
