// Short messages (issue #62), shown by components/MessageArea.tsx. Call these from event handlers or effects in
// the browser, never during rendering.
import { toast } from "sonner";

export function showSuccess(text: string) {
  toast.success(text);
}

// An error that is over once it is shown, e.g. "Could not start the game".
export function showError(text: string) {
  toast.error(text, { duration: 6000 });
}

// An error that lasts until clearProblem(id) is called, e.g. "Can't reach the server" while a page keeps asking.
// The same id updates the message in place, so asking again every few seconds never stacks copies.
export function showProblem(id: string, text: string) {
  toast.error(text, { id, duration: Infinity });
}

export function clearProblem(id: string) {
  toast.dismiss(id);
}
