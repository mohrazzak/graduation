"use client";
// Upload entry point: drag/drop or tap. Validates type + size client-side and
// reports rejections inline, so bad files never reach the API.
import { ImageUp } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useTranslations } from "next-intl";

export interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

// Mirrors the API contract (jpeg/png/webp, max 10 MB) so the inline message,
// not an HTTP 400, is what users see for invalid files.
const ACCEPT = { "image/jpeg": [], "image/png": [], "image/webp": [] };
const MAX_BYTES = 10 * 1024 * 1024;

type RejectionKey = "badFileType" | "fileTooLarge";

export function DropZone({ onFile, disabled = false }: DropZoneProps) {
  const t = useTranslations("analyze");
  const [rejection, setRejection] = useState<RejectionKey | null>(null);

  const onDropAccepted = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file === undefined) return;
      setRejection(null);
      onFile(file);
    },
    [onFile],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code;
    setRejection(code === "file-too-large" ? "fileTooLarge" : "badFileType");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: false,
    disabled,
    onDropAccepted,
    onDropRejected,
  });

  return (
    <div>
      <div
        {...getRootProps({
          // react-dropzone makes the root focusable + Enter/Space-operable but
          // assigns no role; without one AT announces an unnamed group (the
          // file input underneath is display:none, so it can't carry the name).
          role: "button",
          "aria-label": t("dropzone.dragOrTap"),
          className: `flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded border border-dashed p-6 text-center transition-colors duration-150 ${
            isDragActive ? "border-hazard bg-hazard/5" : "border-line bg-surface hover:border-muted"
          }`,
        })}
      >
        <input {...getInputProps()} />
        <ImageUp aria-hidden="true" className="h-6 w-6 text-muted" />
        <p className="text-sm">{t("dropzone.dragOrTap")}</p>
        <p className="font-mono text-xs text-muted">{t("dropzone.fileTypes")}</p>
      </div>
      {rejection !== null ? (
        <p
          role="alert"
          // Hazard, not alert: #FF3B30 is reserved for TD surfaces (spec section 8).
          className="mt-3 rounded border border-hazard/40 bg-hazard/10 px-3 py-2 text-xs text-hazard"
        >
          {t(`errors.${rejection}`)}
        </p>
      ) : null}
    </div>
  );
}
