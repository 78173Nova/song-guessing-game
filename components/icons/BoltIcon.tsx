import IconBase, { type IconProps } from "./IconBase";

// A lightning bolt: answer fast for more points (landing page).
export default function BoltIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13 3L5 13.5h6L10 21l8-11h-6z" />
    </IconBase>
  );
}
