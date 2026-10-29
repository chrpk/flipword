import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { LIMITS } from "../../shared/schemas";
import type { Deck, DeckSummary, DeckVisibility } from "../../shared/types";
import { api } from "../lib/api";
import { VisibilityPicker } from "./DeckVisibility";
import { invalidateDeck } from "../lib/decks";
import { toast } from "./toast";
import { Button, Checkbox, Dialog, Field, Input, Textarea } from "./ui";

export function DeckFormDialog({
  open,
  onClose,
  deck,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit this deck; omit to create a new one. */
  deck?: Deck;
  onCreated?: (deck: DeckSummary) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={deck ? t("deck.editTitle") : t("deck.newTitle")}>
      {open && <DeckForm deck={deck} onClose={onClose} onCreated={onCreated} />}
    </Dialog>
  );
}

function DeckForm({
  deck,
  onClose,
  onCreated,
}: {
  deck?: Deck;
  onClose: () => void;
  onCreated?: (deck: DeckSummary) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [reverseCards, setReverseCards] = useState(deck?.reverseCards ?? false);
  // New decks are private until the user decides to share them.
  const [visibility, setVisibility] = useState<DeckVisibility>(deck?.visibility ?? "private");

  const save = useMutation({
    mutationFn: () =>
      deck
        ? api.updateDeck(deck.id, { name, description, reverseCards, visibility })
        : api.createDeck({ name, description, reverseCards, visibility }),
    onSuccess: (saved) => {
      invalidateDeck(queryClient);
      toast.success(deck ? t("deck.saved") : t("deck.created"));
      onClose();
      if (!deck) onCreated?.(saved);
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label={t("deck.name")} htmlFor="deck-name">
        <Input
          id="deck-name"
          autoFocus
          required
          maxLength={LIMITS.deckName}
          placeholder={t("deck.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t("deck.description")} hint={t("common.optional")} htmlFor="deck-description">
        <Textarea
          id="deck-description"
          rows={3}
          maxLength={LIMITS.deckDescription}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Checkbox
        label={t("deck.reverseCards")}
        hint={deck?.reverseCards && !reverseCards ? t("deck.reverseCardsOffWarning") : t("deck.reverseCardsHint")}
        checked={reverseCards}
        onChange={(e) => setReverseCards(e.target.checked)}
      />
      <VisibilityPicker value={visibility} onChange={setVisibility} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
          {deck ? t("common.save") : t("deck.create")}
        </Button>
      </div>
    </form>
  );
}
