import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Globe, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Deck, DeckVisibility } from "../../shared/types";
import { api } from "../lib/api";
import { invalidateDeck, shareUrl } from "../lib/decks";
import { toast } from "./toast";
import { Button, CopyButton, Dialog, Input } from "./ui";
import { buttonClass, cx } from "./classes";

const ICONS = { private: Lock, public: Globe } as const;

export function VisibilityBadge({ visibility, className }: { visibility: DeckVisibility; className?: string }) {
  const { t } = useTranslation();
  const Icon = ICONS[visibility];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        visibility === "public" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {t(`deck.${visibility}`)}
    </span>
  );
}

/** Private / public choice for the deck form, as two radio cards. */
export function VisibilityPicker({ value, onChange }: { value: DeckVisibility; onChange: (v: DeckVisibility) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">{t("deck.visibility")}</legend>
      {(["private", "public"] as const).map((v) => {
        const Icon = ICONS[v];
        return (
          <label
            key={v}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              value === v ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              name="deck-visibility"
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            <Icon className={cx("mt-0.5 size-4 shrink-0", value === v ? "text-primary" : "text-muted-foreground")} aria-hidden />
            <span className="text-sm leading-tight">
              <span className="font-medium">{t(`deck.${v}`)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t(`deck.${v}Hint`)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Shows the deck's link when it's public, and switches it between public and private. */
export function ShareDialog({ deck, open, onClose }: { deck: Deck; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isPublic = deck.visibility === "public";
  const url = shareUrl(deck.id);

  const toggle = useMutation({
    mutationFn: () => api.updateDeck(deck.id, { visibility: isPublic ? "private" : "public" }),
    onSuccess: (saved) => {
      invalidateDeck(queryClient);
      toast.success(saved.visibility === "public" ? t("deck.nowPublic") : t("deck.nowPrivate"));
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("deck.shareTitle", { name: deck.name })}
      footer={
        <>
          <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()}>
            {isPublic ? <Lock /> : <Globe />}
            {isPublic ? t("deck.makePrivate") : t("deck.makePublic")}
          </Button>
          <Button onClick={onClose}>{t("common.done")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <VisibilityBadge visibility={deck.visibility} />
        <p className="text-sm text-muted-foreground">{isPublic ? t("deck.sharePublic") : t("deck.sharePrivate")}</p>
        {isPublic && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="share-url" className="block text-sm font-medium">
                {t("deck.shareLink")}
              </label>
              <div className="flex gap-2">
                <Input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                <CopyButton text={url} label={t("deck.copyLink")} variant="secondary" />
              </div>
            </div>
            <Link to={`/shared/${deck.id}`} onClick={onClose} className={buttonClass("ghost", "sm", "-ml-2")}>
              <Eye />
              {t("deck.viewPublic")}
            </Link>
          </>
        )}
      </div>
    </Dialog>
  );
}
