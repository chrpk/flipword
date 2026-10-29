import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { imageUrl } from "../../shared/images";
import { isSupportedImage, prepareImage } from "../lib/image";
import { toast } from "./toast";
import { Button } from "./ui";
import { cx } from "./classes";

/** What the user wants to happen to the card's photo when the form is saved. */
export type PhotoChange = { kind: "keep" } | { kind: "set"; blob: Blob } | { kind: "remove" };

/** Displays a stored card photo. */
/** A photo that isn't uploaded yet. The object URL lives exactly as long as the effect, so it's always revoked. */
function BlobImage({ blob, className }: { blob: Blob; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    ref.current!.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={ref} alt="" className={className} />;
}

export function CardImage({ imageKey, alt, className }: { imageKey: string; alt: string; className?: string }) {
  return <img src={imageUrl(imageKey)} alt={alt} loading="lazy" decoding="async" className={cx("object-cover", className)} />;
}

/** Photo picker for the card form: choose a file, drop one, or paste. Resizes before handing it back. */
export function CardPhotoField({
  imageKey,
  change,
  onChange,
}: {
  imageKey: string | null;
  change: PhotoChange;
  onChange: (change: PhotoChange) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const accept = async (file: File | Blob | null | undefined) => {
    if (!file) return;
    if (!isSupportedImage(file)) {
      toast.error(t("card.photo.unsupported"));
      return;
    }
    setBusy(true);
    try {
      onChange({ kind: "set", blob: await prepareImage(file) });
    } catch {
      toast.error(t("card.photo.unreadable"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Paste anywhere in the dialog.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void accept(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const saved = change.kind === "keep" ? imageKey : null;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{t("card.photo.label")}</p>
      {change.kind === "set" || saved ? (
        <div className="flex items-end gap-4">
          {change.kind === "set" ? (
            <BlobImage blob={change.blob} className="size-28 rounded-lg border object-cover" />
          ) : (
            <CardImage imageKey={saved!} alt="" className="size-28 rounded-lg border" />
          )}
          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} loading={busy}>
              <ImagePlus />
              {t("card.photo.change")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => onChange(imageKey ? { kind: "remove" } : { kind: "keep" })}
            >
              <Trash2 />
              {t("card.photo.remove")}
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void accept(e.dataTransfer.files[0]);
          }}
          className={cx(
            "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors",
            dragging ? "border-ring bg-muted" : "hover:bg-muted/50",
          )}
        >
          <ImagePlus className="size-5 shrink-0" aria-hidden />
          <span>{busy ? t("card.photo.processing") : t("card.photo.add")}</span>
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void accept(e.target.files?.[0])}
      />
    </div>
  );
}
