"use client";

// The share pop-up of a room (issue #35): the join link with "Copy link", and the room code in large digits.
// It is the browser's own <dialog>, so it sits on top of the lobby, keeps the focus inside and closes with Esc.
// Below them sits the QR code of the same link (issue #42), drawn on the device, for people in the same room.
import { useEffect, useRef, useState } from "react";
import { copyLink, roomJoinLink, roomJoinQrCode } from "@/lib/client/share";
import styles from "./Landing.module.css";
import popup from "./SharePopup.module.css";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copyNote, setCopyNote] = useState("");
  const link = roomJoinLink(appAddress, code);
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function copy() {
    const result = await copyLink(link, navigator.clipboard);
    setCopyNote(result.ok ? "Link copied!" : result.message);
  }

  return (
    <dialog
      ref={dialogRef}
      className={popup.dialog}
      aria-labelledby="share-title"
      onClose={() => {
        setCopyNote("");
        onClose(); // also after Esc, which closes the dialog by itself
      }}
    >
      <div className={popup.header}>
        <h2 id="share-title" className={popup.title}>
          Invite your friends
        </h2>
        <button type="button" className={popup.close} aria-label="Close" onClick={() => dialogRef.current?.close()}>
          ✕
        </button>
      </div>
      <p className={styles.hint}>Send them this link:</p>
      <p className={popup.link}>{link}</p>
      <button type="button" className={styles.primary} onClick={copy}>
        Copy link
      </button>
      <p className={styles.hint} role="status">
        {copyNote}
      </p>
      <p className={styles.hint}>Or tell them the room code:</p>
      <p className={popup.code} aria-label={`Room code ${code}`}>
        {code}
      </p>
      {qr?.link === link && (
        <>
          <p className={styles.hint}>Or scan this with a phone camera:</p>
          {/* A data: address made on this device; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={popup.qr} src={qr.src} alt={`QR code of the join link ${link}`} />
        </>
      )}
    </dialog>
  );
}
