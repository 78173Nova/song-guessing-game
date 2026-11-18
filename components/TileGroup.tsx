// A row of tiles (issue #34, shared since team feedback 18 Nov, point 8): tapping one calls onTap; `selected` says
// which are on. Used by "Create a room", the room list and the solo start screen. Optional: `disabled` greys out
// tiles that cannot be chosen (a greyed-out tile can still show as selected), and `notes` say why under the row.
import styles from "./Landing.module.css";

export type Tile = { value: string; label: string; disabled?: boolean };

export default function TileGroup({
  legend,
  options,
  selected,
  onTap,
  notes = [],
}: {
  legend: string;
  options: Tile[];
  selected: (value: string) => boolean;
  onTap: (value: string) => void;
  notes?: string[];
}) {
  return (
    <fieldset className={styles.tiles}>
      <legend className={styles.codeLabel}>{legend}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={selected(option.value) ? `${styles.tile} ${styles.tileOn}` : styles.tile}
          aria-pressed={selected(option.value)}
          disabled={option.disabled}
          onClick={() => onTap(option.value)}
        >
          {option.label}
        </button>
      ))}
      {notes.map((note) => (
        <p key={note} className={`${styles.hint} ${styles.tileNote}`}>
          {note}
        </p>
      ))}
    </fieldset>
  );
}
