import type { CSSProperties, SVGProps } from "react";

export type RickshawIconTone = "brand" | "inverse" | "outline";

export interface RickshawIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  tone?: RickshawIconTone;
}

type RickshawToneStyle = CSSProperties &
  Record<"--rickshaw-body" | "--rickshaw-window" | "--rickshaw-detail", string>;

const TONE_STYLES: Record<RickshawIconTone, RickshawToneStyle> = {
  brand: {
    "--rickshaw-body": "var(--lime)",
    "--rickshaw-window": "var(--cyan)",
    "--rickshaw-detail": "var(--porcelain)",
  },
  inverse: {
    "--rickshaw-body": "var(--ink)",
    "--rickshaw-window": "var(--cyan)",
    "--rickshaw-detail": "var(--lime)",
  },
  outline: {
    "--rickshaw-body": "transparent",
    "--rickshaw-window": "transparent",
    "--rickshaw-detail": "transparent",
  },
};

export function RickshawIcon({
  size = 24,
  tone = "brand",
  className,
  style,
  ...props
}: RickshawIconProps) {
  const isLabelled = Boolean(props["aria-label"] || props["aria-labelledby"]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 60"
      width={size}
      height={size}
      fill="none"
      role={isLabelled ? "img" : undefined}
      aria-hidden={isLabelled ? undefined : true}
      focusable="false"
      className={className}
      style={{ ...TONE_STYLES[tone], ...style }}
      {...props}
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M2 25h9M1 31h8"
          stroke="var(--rickshaw-window)"
          strokeWidth="2.4"
          opacity="0.85"
        />
        <path
          d="M10 40V18.5C10 10.6 16.6 4 24.5 4h25.7c5.6 0 10.9 3.6 13.3 8.9L67 19v21H10Z"
          fill="var(--rickshaw-body)"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <path
          d="M20 28.5V18c0-3 2.5-5.5 5.5-5.5h24.8c4 0 7.6 2.2 9.5 5.7l1.2 2.3c1.4 2.7-.4 6-3.4 6H20v2Z"
          fill="var(--rickshaw-window)"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M42.5 13.5v14" stroke="currentColor" strokeWidth="1.8" opacity="0.8" />
        <path
          d="M62 21.5 70.5 26l7.8 8.7 1.2 5.3H62V21.5Z"
          fill="var(--rickshaw-body)"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <path
          d="m65.5 25.5 3.7 1.9 4.4 5.1h-8.1v-7Z"
          fill="var(--rickshaw-window)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M15 32h45"
          stroke="var(--rickshaw-window)"
          strokeWidth="4.5"
          opacity="0.95"
        />
        <path
          d="M27 9.2c.7-1.2 2-1.9 3.4-1.9h19.8"
          stroke="var(--rickshaw-detail)"
          strokeWidth="2.2"
        />
        <path
          d="m62.5 28 7.3-8 5.2 3"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <circle cx="75" cy="23" r="1.8" fill="var(--rickshaw-detail)" />
        <path
          d="M69.5 40c1-4.1 4.4-6.8 8.2-6.8 4 0 7.3 2.8 8.2 6.8"
          stroke="currentColor"
          strokeWidth="2.2"
        />

        <circle
          cx="20"
          cy="45"
          r="6.2"
          fill="var(--rickshaw-detail)"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <circle cx="20" cy="45" r="1.8" fill="var(--rickshaw-window)" />
        <circle
          cx="32"
          cy="45"
          r="6.2"
          fill="var(--rickshaw-detail)"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <circle cx="32" cy="45" r="1.8" fill="var(--rickshaw-window)" />
        <circle
          cx="77.7"
          cy="45"
          r="7.1"
          fill="var(--rickshaw-detail)"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <circle cx="77.7" cy="45" r="2" fill="var(--rickshaw-window)" />
      </g>
    </svg>
  );
}
