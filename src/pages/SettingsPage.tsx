import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Settings } from "../../shared/types";
import { FLAG_NAME_MAX, FLAGS } from "../../shared/flags";
import { useMe } from "../components/me";
import { ConnectAssistant } from "../components/ConnectAssistant";
import { FlagDot } from "../components/Flags";
import { LegalLinks } from "../components/SiteChrome";
import { toast } from "../components/toast";
import { Button, Card, ConfirmDialog, Field, Input, SegmentedControl, Select } from "../components/ui";
import { buttonClass } from "../components/classes";
import { setUiLocale, UI_LOCALES, type UiLocale } from "../i18n";
import { api, queryKeys } from "../lib/api";
import { authClient } from "../lib/auth";
import { formatPercent } from "../lib/format";
import { sortedLanguages } from "../lib/languages";
import { type ThemePreference, useTheme } from "../lib/theme-context";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t py-10 first:border-t-0 first:pt-0 md:grid-cols-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 md:col-span-2">{children}</div>
    </section>
  );
}

type StudyForm = Pick<
  Settings,
  "nativeLang" | "targetLang" | "newPerDay" | "maxReviewsPerDay" | "desiredRetention" | "flagNames"
>;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const languages = sortedLanguages(i18n.language);
  const initial: StudyForm = {
    nativeLang: me.settings.nativeLang,
    targetLang: me.settings.targetLang,
    newPerDay: me.settings.newPerDay,
    maxReviewsPerDay: me.settings.maxReviewsPerDay,
    desiredRetention: me.settings.desiredRetention,
    flagNames: me.settings.flagNames,
  };
  const [form, setForm] = useState<StudyForm>(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = (Object.keys(initial) as (keyof StudyForm)[]).some(
    (k) => JSON.stringify(form[k]) !== JSON.stringify(initial[k]),
  );

  const save = useMutation({
    mutationFn: () => api.updateSettings(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
      toast.success(t("settings.saved"));
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/login");
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const res = await authClient.deleteUser();
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/login");
    },
    onError: () => {
      setConfirmDelete(false);
      toast.error(t("settings.deleteFailed"));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const number = (key: "newPerDay" | "maxReviewsPerDay") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: Math.max(0, Math.min(9999, Math.trunc(Number(e.target.value) || 0))) });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("settings.subtitle")}</p>

      <div className="mt-12">
        <form onSubmit={submit}>
          <Section title={t("settings.languagesTitle")} description={t("settings.languagesDescription")}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("settings.targetLang")} htmlFor="target-lang">
                <Select id="target-lang" value={form.targetLang} onChange={(e) => setForm({ ...form, targetLang: e.target.value })}>
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("settings.nativeLang")} htmlFor="native-lang">
                <Select id="native-lang" value={form.nativeLang} onChange={(e) => setForm({ ...form, nativeLang: e.target.value })}>
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Section>

          <Section title={t("settings.studyTitle")} description={t("settings.studyDescription")}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("settings.newPerDay")} hint={t("settings.newPerDayHint")} htmlFor="new-per-day">
                <Input id="new-per-day" type="number" inputMode="numeric" min={0} max={9999} value={form.newPerDay} onChange={number("newPerDay")} />
              </Field>
              <Field label={t("settings.maxReviews")} hint={t("settings.maxReviewsHint")} htmlFor="max-reviews">
                <Input
                  id="max-reviews"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={9999}
                  value={form.maxReviewsPerDay}
                  onChange={number("maxReviewsPerDay")}
                />
              </Field>
            </div>
            <Field
              label={
                <span className="flex justify-between">
                  {t("settings.retention")}
                  <span className="font-semibold tabular-nums">{formatPercent(i18n.language, form.desiredRetention)}</span>
                </span>
              }
              hint={t("settings.retentionHint")}
              htmlFor="retention"
            >
              <input
                id="retention"
                type="range"
                min={0.8}
                max={0.97}
                step={0.01}
                value={form.desiredRetention}
                onChange={(e) => setForm({ ...form, desiredRetention: Number(e.target.value) })}
                className="w-full accent-[hsl(var(--primary))]"
              />
            </Field>
          </Section>

          <Section title={t("flags.settingsTitle")} description={t("flags.settingsDescription")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {FLAGS.map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <FlagDot flag={f} className="size-3" />
                  <Input
                    aria-label={t("flags.nameFor", { color: t(`flags.default.${f}`) })}
                    placeholder={t(`flags.default.${f}`)}
                    maxLength={FLAG_NAME_MAX}
                    value={form.flagNames[f - 1]}
                    onChange={(e) =>
                      setForm({ ...form, flagNames: form.flagNames.map((n, i) => (i === f - 1 ? e.target.value : n)) })
                    }
                  />
                </div>
              ))}
            </div>
          </Section>

          <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background px-4 py-4 sm:mx-0 sm:rounded-lg sm:border">
            <Button variant="ghost" disabled={!dirty || save.isPending} onClick={() => setForm(initial)}>
              {t("common.reset")}
            </Button>
            <Button type="submit" disabled={!dirty} loading={save.isPending}>
              {t("settings.saveChanges")}
            </Button>
          </div>
        </form>

        <div className="mt-10">
          <Section title={t("settings.appearanceTitle")} description={t("settings.appearanceDescription")}>
            <Field label={t("settings.theme")}>
              <div>
                <SegmentedControl<ThemePreference>
                  label={t("settings.theme")}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: "system", label: t("settings.themes.system") },
                    { value: "light", label: t("settings.themes.light") },
                    { value: "dark", label: t("settings.themes.dark") },
                  ]}
                />
              </div>
            </Field>
            <Field label={t("settings.uiLanguage")} hint={t("settings.uiLanguageHint")} htmlFor="ui-locale">
              <Select
                id="ui-locale"
                className="sm:max-w-xs"
                value={i18n.language}
                onChange={(e) => setUiLocale(e.target.value as UiLocale)}
              >
                {UI_LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Section>

          <Section title={t("mcp.title")} description={t("mcp.description")}>
            <ConnectAssistant />
          </Section>

          <Section title={t("settings.accountTitle")}>
            <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{me.user.name}</p>
                <p className="truncate text-sm text-muted-foreground">{me.user.email}</p>
              </div>
              <Button variant="secondary" onClick={() => signOut.mutate()} loading={signOut.isPending}>
                <LogOut />
                {t("settings.signOut")}
              </Button>
            </Card>
            <div className="rounded-xl border p-4">
              <p className="font-medium">{t("settings.exportTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("settings.exportDescription")}</p>
              <a href={api.dataExportUrl} download className={buttonClass("secondary", "md", "mt-4")}>
                <Download />
                {t("settings.exportButton")}
              </a>
            </div>
            <div className="rounded-xl border border-destructive/30 p-4">
              <p className="font-medium">{t("settings.deleteTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("settings.deleteDescription")}</p>
              <Button variant="outline-destructive" className="mt-4" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                {t("settings.deleteButton")}
              </Button>
            </div>
            <LegalLinks className="text-sm text-muted-foreground" />
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteAccount.mutate()}
        loading={deleteAccount.isPending}
        title={t("settings.deleteConfirmTitle")}
        description={t("settings.deleteConfirmDescription")}
        confirmLabel={t("settings.deleteButton")}
      />
    </div>
  );
}
