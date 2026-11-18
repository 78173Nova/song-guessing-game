import type { SVGProps } from "react";

// A play triangle (start the sound).
// One of the app's hand-drawn inline icons (DESIGN.md "Icons"): 24px box, 2px round stroke,
// coloured by the text colour around it. Decorative: the word next to it carries the meaning.
export default function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  );
}
