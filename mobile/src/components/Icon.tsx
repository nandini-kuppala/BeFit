import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Hand-drawn icon set on a 24×24 grid.
 *
 * Custom rather than an icon pack so stroke weight and corner radii match the
 * rest of the system exactly — and so the bundle carries five icons, not a
 * thousand.
 */
export type IconName =
  | 'today'
  | 'food'
  | 'plus'
  | 'train'
  | 'body'
  | 'mic'
  | 'water'
  | 'search'
  | 'close'
  | 'check'
  | 'chevronRight'
  | 'chevronLeft'
  | 'trash'
  | 'sparkle'
  | 'edit'
  | 'flame'
  | 'moon'
  | 'pill'
  | 'calendar'
  | 'trend'
  | 'copy';

const PATHS: Record<IconName, { d: string; fill?: boolean }[]> = {
  today: [{ d: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5' }],
  food: [
    { d: 'M3.5 11.5h17a8.5 8.5 0 0 1-8.5 8 8.5 8.5 0 0 1-8.5-8Z' },
    { d: 'M8 8.5c0-1.5 1-2 1-3.5M12 8c0-2 1.2-2.5 1.2-4.5M16 8.5c0-1.5 1-2 1-3.5' },
  ],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  train: [
    { d: 'M6.5 9v6M17.5 9v6M3.5 10.5v3M20.5 10.5v3M6.5 12h11' },
  ],
  body: [
    { d: 'M12 3.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z' },
    { d: 'M8 8.8h8l1 5.2-2 .5V21h-3v-4h-0.2v4H8.8v-6.5l-1.8-.5Z' },
  ],
  mic: [
    { d: 'M12 3.5a2.8 2.8 0 0 1 2.8 2.8v5.4a2.8 2.8 0 0 1-5.6 0V6.3A2.8 2.8 0 0 1 12 3.5Z' },
    { d: 'M5.8 11a6.2 6.2 0 0 0 12.4 0M12 17.4V21' },
  ],
  water: [{ d: 'M12 3.5c3.6 4 6 6.9 6 9.9a6 6 0 0 1-12 0c0-3 2.4-5.9 6-9.9Z' }],
  search: [{ d: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14ZM16.2 16.2 21 21' }],
  close: [{ d: 'M6 6l12 12M18 6 6 18' }],
  check: [{ d: 'M4.5 12.5 9.5 17.5 19.5 6.5' }],
  chevronRight: [{ d: 'M9.5 5.5 16 12l-6.5 6.5' }],
  trash: [
    { d: 'M4 6.5h16M9.5 6.5V4.2h5v2.3M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5' },
  ],
  sparkle: [
    { d: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z' },
    { d: 'M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z' },
  ],
  chevronLeft: [{ d: 'M14.5 5.5 8 12l6.5 6.5' }],
  edit: [
    { d: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z' },
    { d: 'M14.5 6 18 9.5' },
  ],
  flame: [
    { d: 'M12 3.2c.4 3 2.1 3.9 3.4 5.6a6.6 6.6 0 0 1 1.4 4.2 6.8 6.8 0 1 1-13.6 0c0-1.7.8-3.2 1.8-4' },
    { d: 'M12 20.5a3 3 0 0 1-1.6-5.6c1-.7 1.6-1.5 1.7-2.8.9.8 2.9 2.3 2.9 4.4a3 3 0 0 1-3 4Z' },
  ],
  moon: [{ d: 'M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z' }],
  pill: [
    { d: 'M8.8 3.8h0a5 5 0 0 1 5 5v6.4a5 5 0 0 1-5 5h0a5 5 0 0 1-5-5V8.8a5 5 0 0 1 5-5Z' },
    { d: 'M3.8 12h10' },
    { d: 'M15.5 15.5h5.7M18.3 12.6v5.7' },
  ],
  calendar: [
    { d: 'M4.5 6.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1Z' },
    { d: 'M8 3.5v4M16 3.5v4M4.5 10.5h15' },
  ],
  trend: [{ d: 'M3.5 16.5 9 11l3.5 3.5L20.5 6.5M20.5 6.5h-4.8M20.5 6.5v4.8' }],
  copy: [
    { d: 'M9 9.5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5Z' },
    { d: 'M15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H9' },
  ],
};

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  filled?: boolean;
};

export function Icon({ name, size = 24, color, strokeWidth = 1.9, filled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((path, index) => (
        <Path
          key={index}
          d={path.d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={filled ? color : 'none'}
          fillOpacity={filled ? 0.16 : 0}
        />
      ))}
    </Svg>
  );
}

export { Circle, Rect };
