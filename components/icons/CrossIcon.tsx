import IconBase, { type IconProps } from "./IconBase";

// A cross: wrong answer, error.
export default function CrossIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </IconBase>
  );
}
