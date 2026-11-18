import IconBase, { type IconProps } from "./IconBase";

// An arrow pointing left: back to the front page.
export default function ArrowLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </IconBase>
  );
}
