import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useMe } from "../components/me";
import { Logo } from "../components/Logo";
import { toast } from "../components/toast";
import { Button, Card, Field, Select } from "../components/ui";
import { api, queryKeys } from "../lib/api";
import { sortedLanguages } from "../lib/languages";

export function WelcomePage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  // Where the user was headed before onboarding, e.g. a shared deck.
  const next = (location.state as { from?: string } | null)?.from ?? "/";
  const queryClient = useQueryClient();
  const languages = sortedLanguages(i18n.language);
  const [nativeLang, setNativeLang] = useState(me.settings.nativeLang);
  const [targetLang, setTargetLang] = useState(me.settings.targetLang);

  const save = useMutation({
    mutationFn: () => api.updateSettings({ nativeLang, targetLang, onboarded: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      navigate(next, { replace: true });
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  if (me.settings.onboarded) return <Navigate to={next} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-rise-in">
        <Logo className="mb-8 size-12" />
        <h1 className="text-3xl font-bold tracking-tight">{t("welcome.title", { name: me.user.name.split(" ")[0] })}</h1>
        <p className="mt-3 text-muted-foreground">{t("welcome.subtitle")}</p>
        <Card className="mt-8 p-6">
          <form onSubmit={submit} className="space-y-5">
            <Field label={t("settings.targetLang")} htmlFor="target-lang">
              <Select id="target-lang" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("settings.nativeLang")} htmlFor="native-lang">
              <Select id="native-lang" value={nativeLang} onChange={(e) => setNativeLang(e.target.value)}>
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={save.isPending}>
              {t("welcome.continue")}
              <ArrowRight />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
