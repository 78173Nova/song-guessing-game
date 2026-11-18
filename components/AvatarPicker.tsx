// Picks one avatar from the fixed set (issue #44): a group of radio buttons, one emoji each, so it works with the
// keyboard and a screen reader reads the avatar's name. Used on the nickname screens and in Account settings.
import { AVATARS } from "@/lib/game/avatars";
import CheckIcon from "./icons/CheckIcon";
import styles from "./Landing.module.css";

export default function AvatarPicker({
  value,
  onChange,
  legend = "Choose an avatar",
}: {
  value: string;
  onChange: (avatar: string) => void;
  legend?: string;
}) {
  return (
    <fieldset className={styles.avatarPicker}>
      <legend className={styles.codeLabel}>{legend}</legend>
      <div className={styles.avatarGrid}>
        {AVATARS.map((avatar) => (
          <label key={avatar.id} className={styles.avatarOption} title={avatar.label}>
            <input
              type="radio"
              name="avatar"
              value={avatar.id}
              checked={value === avatar.id}
              onChange={() => onChange(avatar.id)}
              aria-label={avatar.label}
            />
            <span aria-hidden="true">{avatar.emoji}</span>
            <span className={styles.avatarCheck}>
              <CheckIcon size={14} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
