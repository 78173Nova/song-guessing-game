"use client";

// The share pop-up of a room (issue #35): the join link with "Copy link", and the room code in large digits.
// Below them sits the QR code of the same link (issue #42), drawn on the device, for people in the same room.
// Since issue #62 it is a Vaul drawer: on phone widths a bottom sheet that can be swiped down to close, from 40rem
// a centred dialog (no dragging). Both keep the focus inside, close with Esc and give the focus back to the button
// that opened them. After copying, a short message says whether it worked (components/messages.ts).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Drawer } from "vaul";
import { copyLink, copyMessage, roomJoinLink, roomJoinQrCode } from "@/lib/client/share";
import CloseIcon from "./icons/CloseIcon";
import CopyIcon from "./icons/CopyIcon";
import { showError, showSuccess } from "./messages";
import styles from "./Landing.module.css";
import popup from "./SharePopup.module.css";

// From this width the pop-up is a centred dialog; the same value as the media query in SharePopup.module.css.
const WIDE_SCREEN = "(min-width: 40rem)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE_SCREEN);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// true on laptops, false on phones (and while the page is drawn on the server, where the pop-up is closed anyway).
function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE_SCREEN).matches,
    () => false,
  );
}

export default function SharePopup({
  code,
  appAddress,
  open,
  onClose,
}: {
  code: string;
  appAddress: string; // the site's configured address (APP_URL), from the server
  open: boolean;
  onClose: () => void;
}) {
  const wide = useWideScreen();
  const link = roomJoinLink(appAddress, code);
  // The element that had the focus when the pop-up opened (the Share button), to give it back on closing.
  const openedFrom = useRef<HTMLElement | null>(null);
  // The QR picture together with the link it was drawn for, so a picture for an old link is never shown.
  const [qr, setQr] = useState<{ link: string; src: string } | null>(null);

  useEffect(() => {
    let current = true;
    roomJoinQrCode(appAddress, code)
      .then((src) => {
        if (current) setQr({ link: roomJoinLink(appAddress, code), src });
      })
      .catch(() => {
        // no QR code: the link and the room code still work
      });
    return () => {
      current = false;
    };
  }, [appAddress, code]);

  async function copy() {
    const message = copyMessage(await copyLink(link, navigator.clipboard));
    if (message.kind === "success") showSuccess(message.text);
    else showError(message.text);
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose(); // the close button, Esc, a tap beside it or a swipe down
      }}
      handleOnly={wide} // on a laptop only a drag handle could move it, and there is none: the dialog stays put
      autoFocus // move the focus into the pop-up when it opens
    >
      <Drawer.Portal>
        <Drawer.Overlay className={popup.overlay} />
        <Drawer.Content
          className={popup.sheet}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            openedFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openedFrom.current?.isConnected) openedFrom.current.focus();
          }}
          onPointerDownOutside={(event) => {
            // Swiping a short message away must not close the pop-up underneath it.
            if (event.target instanceof Element && event.target.closest("[data-sonner-toaster]")) event.preventDefault();
          }}
        >
          {!wide && <Drawer.Handle className={popup.handle} />}
          <div className={popup.header}>
            <Drawer.Title className={popup.title}>Invite your friends</Drawer.Title>
            <Drawer.Close className={popup.close} aria-label="Close">
              <CloseIcon size={22} />
            </Drawer.Close>
          </div>
          <p className={styles.hint}>Send them this link:</p>
          <p className={popup.link} data-vaul-no-drag>
            {link}
          </p>
          <button type="button" className={styles.primary} onClick={copy}>
            <CopyIcon />
            Copy link
          </button>
          <p className={styles.hint}>Or tell them the room code:</p>
          <p className={popup.code} aria-label={`Room code ${code}`}>
            {code}
          </p>
          {qr?.link === link && (
            <>
              <p className={styles.hint}>Or scan this with a phone camera:</p>
              <div className={popup.qrFrame}>
                {/* A data: address made on this device; next/image adds nothing here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={popup.qr} src={qr.src} alt={`QR code of the join link ${link}`} />
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
