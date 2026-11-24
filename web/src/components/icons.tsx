import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V3.5M4 7.5l4-4 4 4" />
  </Svg>
);
export const IconComment = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 3.25h10.5v7.5h-6l-3 2.5v-2.5h-1.5z" />
  </Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 2.75h4M7 2.75v4L4.75 9.25h6.5L9 6.75v-4M8 9.25v4" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3 3" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" />
  </Svg>
);
export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
  </Svg>
);
export const IconMerge = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="4" cy="12.5" r="1.5" />
    <circle cx="12" cy="8" r="1.5" />
    <path d="M4 5v6M4 6.5c0 1.5 1.5 1.5 3 1.5h3.5" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.4-1.8 2.6M8 11.3h.01" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5 5.5 8 10 12.5" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Svg>
);
export const IconBoard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M6 2.5v11M10 2.5v11" />
  </Svg>
);
export const IconList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </Svg>
);
export const IconRoadmap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4h6M5 8h6.5M7.5 12h6" />
  </Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V8.5" />
  </Svg>
);
export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 3.5h11L9.25 8.5v4l-2.5 1v-5z" />
  </Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2.75h4.25V7M13 3 7.5 8.5M11.5 9.5v3.25h-8.75V4h3.25" />
  </Svg>
);
export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth={2.5} />
  </Svg>
);
export const IconSort = ({ dir, ...p }: IconProps & { dir: "desc" | "none" }) => (
  <Svg {...p}>
    {dir === "desc" ? (
      <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
    ) : (
      <path d="M5 6 8 3l3 3M5 10l3 3 3-3" opacity={0.5} />
    )}
  </Svg>
);

/** Soundings mark: a lead line with depth marks, on the brand blue. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect width="20" height="20" rx="4" fill="var(--primary)" />
      <path d="M10 3.5v8.5" stroke="var(--primary-text)" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M7.25 5.5h2.5M7.75 8h2M7.25 10.5h2.5"
        stroke="var(--primary-text)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path d="M8.1 12.4h3.8l-.6 3.1a1.3 1.3 0 0 1-2.6 0z" fill="var(--primary-text)" />
    </svg>
  );
}

/** Project avatar for the sidebar (the product whose feedback this is). */
export function ProjectMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="4" fill="#2f7f73" />
      <path d="M9 13h14l-1.6 9.2a2 2 0 0 1-2 1.8h-6.8a2 2 0 0 1-2-1.8z" fill="#fff" />
      <path d="M12 13c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" fill="none" stroke="#fff" strokeWidth="1.8" />
    </svg>
  );
}
