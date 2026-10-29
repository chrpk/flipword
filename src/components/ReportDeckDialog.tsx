import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { REPORT_REASONS } from "../../shared/schemas";
import { api } from "../lib/api";
import { toast } from "./toast";
import { Button, Dialog, Field, Select, Textarea } from "./ui";

type Reason = (typeof REPORT_REASONS)[number];

/** Lets a viewer flag someone else's public deck for review (notice and action). */
export function ReportDeckDialog({
  deck,
  open,
  onClose,
}: {
  deck: { id: string; name: string };
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<Reason | "">("");
  const [details, setDetails] = useState("");

  const send = useMutation({
    mutationFn: (r: Reason) => api.reportDeck(deck.id, { reason: r, details }),
    onSuccess: () => {
      toast.success(t("report.sent"));
      setReason("");
      setDetails("");
      onClose();
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason) send.mutate(reason);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("report.title", { name: deck.name })}
      description={t("report.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="report-deck" disabled={!reason} loading={send.isPending}>
            {t("report.send")}
          </Button>
        </>
      }
    >
      <form id="report-deck" onSubmit={submit} className="space-y-4">
        <Field label={t("report.reason")} htmlFor="report-reason">
          <Select id="report-reason" required value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
            <option value="" disabled>
              {t("report.choose")}
            </option>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`report.reasons.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("report.details")} hint={t("report.detailsHint")} htmlFor="report-details">
          <Textarea id="report-details" maxLength={1000} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
