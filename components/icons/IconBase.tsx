// The shared frame of every icon (DESIGN.md, "Icons"): a 24 × 24 box, one 2px stroke in the text colour around it,
// round caps and joins. Icons are decoration next to a word, so screen readers skip them (aria-hidden); an
// icon-only button gets its own aria-label instead.
export type IconProps = { size?: number; className?: string };

export default function IconBase({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
