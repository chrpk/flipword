import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePause, CirclePlay, GraduationCap, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { LIMITS } from "../../shared/schemas";
import type { CardDto } from "../../shared/types";
import { api, ApiError, queryKeys } from "../lib/api";
import { languageName } from "../lib/languages";
import { useMe } from "./me";
import { CardPhotoField, type PhotoChange } from "./CardPhoto";
import { CardProgressPanel } from "./CardProgressPanel";
import { FlagPicker } from "./Flags";
import { toast } from "./toast";
import { Button, ConfirmDialog, Dialog, Field, Input, Kbd, Select, Textarea } from "./ui";

export function CardFormDialog({
  open,
  onClose,
  deckId,
  card,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  deckId: string;
  /** Edit this card; omit to add new cards. */
  card?: CardDto;
  onSaved?: (card: CardDto) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={card ? t("card.editTitle") : t("card.addTitle")}>
      {open && <CardForm deckId={deckId} card={card} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function CardForm({
  deckId,
  card,
  onClose,
  onSaved,
}: {
  deckId: string;
  card?: CardDto;
  onClose: () => void;
  onSaved?: (card: CardDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const { settings } = useMe();
  const queryClient = useQueryClient();
  const frontRef = useRef<HTMLInputElement>(null);
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [example, setExample] = useState(card?.example ?? "");
  const [targetDeck, setTargetDeck] = useState(card?.deckId ?? deckId);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const [flag, setFlag] = useState(card?.flag ?? 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const decks = useQuery({ queryKey: queryKeys.decks, queryFn: api.decks, enabled: !!card });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
  };

  const save = useMutation({
    mutationFn: async () => {
      let saved = card
        ? await api.updateCard(card.id, { front, back, example, deckId: targetDeck, flag })
        : await api.createCard(deckId, { front, back, example });
      if (!card && flag) saved = await api.updateCard(saved.id, { flag });
      if (photo.kind === "set") return api.uploadCardImage(saved.id, photo.blob);
      if (photo.kind === "remove") return api.removeCardImage(saved.id);
      return saved;
    },
    onSuccess: (saved) => {
      invalidate();
      onSaved?.(saved);
      if (card) {
        toast.success(t("card.saved"));
        onClose();
      } else {
        toast.success(t("card.added"));
        setFront("");
        setBack("");
        setExample("");
        setPhoto({ kind: "keep" });
        setFlag(0);
        frontRef.current?.focus();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 507) {
        // The word itself was saved; only its photo was turned away.
        invalidate();
        toast.error(t("card.photo.storageFull"));
      } else {
        toast.error(t("errors.saveFailed"));
      }
    },
  });

  const reset = useMutation({
    mutationFn: () => api.resetCard(card!.id),
    onSuccess: (saved) => {
      invalidate();
      onSaved?.(saved);
      toast.success(t("card.resetDone"));
      onClose();
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const suspend = useMutation({
    mutationFn: () => api.updateCard(card!.id, { suspended: !card!.suspended }),
    onSuccess: (saved) => {
      invalidate();
      onSaved?.(saved);
      toast.success(saved.suspended ? t("card.suspendedToast") : t("card.unsuspendedToast"));
      onClose();
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const learn = useMutation({
    mutationFn: () => api.updateCard(card!.id, { learned: card!.learnedAt === null }),
    onSuccess: (saved) => {
      invalidate();
      onSaved?.(saved);
      toast.success(saved.learnedAt !== null ? t("card.learnedToast", { front: saved.front }) : t("card.unlearnedToast", { front: saved.front }));
      onClose();
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteCard(card!.id),
    onSuccess: () => {
      invalidate();
      toast.success(t("card.deleted"));
      onClose();
    },
    onError: () => toast.error(t("errors.deleteFailed")),
  });

  const valid = front.trim() !== "" && back.trim() !== "";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !save.isPending) save.mutate();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
  };

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className="space-y-5">
      <Field
        label={t("card.front")}
        hint={t("card.frontHint", { language: languageName(settings.targetLang, i18n.language) })}
        htmlFor="card-front"
      >
        <Input
          id="card-front"
          ref={frontRef}
          autoFocus
          required
          maxLength={LIMITS.cardField}
          lang={settings.targetLang}
          value={front}
          onChange={(e) => setFront(e.target.value)}
        />
      </Field>
      <Field
        label={t("card.back")}
        hint={t("card.backHint", { language: languageName(settings.nativeLang, i18n.language) })}
        htmlFor="card-back"
      >
        <Input
          id="card-back"
          required
          maxLength={LIMITS.cardField}
          lang={settings.nativeLang}
          value={back}
          onChange={(e) => setBack(e.target.value)}
        />
      </Field>
      <Field label={t("card.example")} hint={t("common.optional")} htmlFor="card-example">
        <Textarea
          id="card-example"
          rows={2}
          maxLength={LIMITS.cardField}
          lang={settings.targetLang}
          value={example}
          onChange={(e) => setExample(e.target.value)}
        />
      </Field>
      <CardPhotoField imageKey={card?.imageKey ?? null} change={photo} onChange={setPhoto} />
      <div>
        <p className="mb-1.5 text-sm font-medium">{t("flags.label")}</p>
        <FlagPicker value={flag} onChange={setFlag} />
      </div>
      {card && decks.data && decks.data.length > 1 && (
        <Field label={t("card.deck")} htmlFor="card-deck">
          <Select id="card-deck" value={targetDeck} onChange={(e) => setTargetDeck(e.target.value)}>
            {decks.data.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {card && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <CardProgressPanel cardId={card.id} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        {card ? (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => learn.mutate()} loading={learn.isPending}>
              <GraduationCap />
              {card.learnedAt !== null ? t("card.markNotLearned") : t("card.markLearned")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => suspend.mutate()} loading={suspend.isPending}>
              {card.suspended ? <CirclePlay /> : <CirclePause />}
              {card.suspended ? t("card.unsuspend") : t("card.suspend")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reset.mutate()} loading={reset.isPending}>
              <RotateCcw />
              {t("card.reset")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              {t("common.delete")}
            </Button>
          </div>
        ) : (
          <p className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span className="ml-1">{t("card.addShortcut")}</span>
          </p>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {card ? t("common.cancel") : t("common.done")}
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>
            {card ? t("common.save") : t("card.add")}
          </Button>
        </div>
      </div>

      {card && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate()}
          loading={remove.isPending}
          title={t("card.deleteTitle")}
          description={t("card.deleteDescription", { front: card.front })}
          confirmLabel={t("common.delete")}
        />
      )}
    </form>
  );
}
