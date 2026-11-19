import IconBase, { type IconProps } from "./IconBase";

// Three joined dots: share the room.
export default function ShareIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8" />
    </IconBase>
  );
}
