import IconBase, { type IconProps } from "./IconBase";

// A play triangle: start the clip.
export default function PlayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 5v14l12-7z" />
    </IconBase>
  );
}
