import IconBase, { type IconProps } from "./IconBase";

// A dashed circle: a player who is away.
export default function AwayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3.3" />
    </IconBase>
  );
}
