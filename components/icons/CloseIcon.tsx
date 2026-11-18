import IconBase, { type IconProps } from "./IconBase";

// A cross for closing a pop-up (same shape as CrossIcon, its own name so the meaning is clear in code).
export default function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </IconBase>
  );
}
