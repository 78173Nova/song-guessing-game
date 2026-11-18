import type { SVGProps } from "react";

// A check mark (right answer, done).
// One of the app's hand-drawn inline icons (DESIGN.md "Icons"): 24px box, 2px round stroke,
// coloured by the text colour around it. Decorative: the word next to it carries the meaning.
export default function CheckIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
