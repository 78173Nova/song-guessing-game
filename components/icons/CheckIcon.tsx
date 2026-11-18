import IconBase, { type IconProps } from "./IconBase";

// A tick: right answer, answered, selected.
export default function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </IconBase>
  );
}
