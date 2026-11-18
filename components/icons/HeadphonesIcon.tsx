import IconBase, { type IconProps } from "./IconBase";

// Headphones: listen to a clip (landing page).
export default function HeadphonesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </IconBase>
  );
}
