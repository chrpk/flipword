import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";
import type { SocialProvider } from "../../shared/types";
import { Logo } from "../components/Logo";
import { Button, Card, Field, Input, Spinner } from "../components/ui";
import { api, queryKeys } from "../lib/api";
import { authClient } from "../lib/auth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  );
}

const PROVIDERS: Record<SocialProvider, { icon: () => React.ReactElement; labelKey: string }> = {
  google: { icon: GoogleIcon, labelKey: "login.continueWithGoogle" },
  facebook: { icon: FacebookIcon, labelKey: "login.continueWithFacebook" },
};

const DEV_PASSWORD = "flipword-dev-password";

function DevLogin({ redirectTo }: { redirectTo: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("demo@flipword.dev");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const signIn = await authClient.signIn.email({ email, password: DEV_PASSWORD });
    if (signIn.error) {
      const signUp = await authClient.signUp.email({ email, password: DEV_PASSWORD, name: email.split("@")[0] });
      if (signUp.error) {
        setError(signUp.error.message ?? t("login.failed"));
        setBusy(false);
        return;
      }
    }
    window.location.assign(redirectTo);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground uppercase">
        <span className="h-px flex-1 bg-border" />
        {t("login.devOnly")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Field label={t("login.email")} htmlFor="dev-email" error={error}>
        <Input id="dev-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" className="w-full" loading={busy}>
        {t("login.devSignIn")}
      </Button>
    </form>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [params] = useSearchParams();
  const config = useQuery({ queryKey: queryKeys.config, queryFn: api.config, staleTime: Infinity });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me, retry: false });
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  const signIn = async (provider: SocialProvider) => {
    setPending(provider);
    const res = await authClient.signIn.social({
      provider,
      callbackURL: redirectTo,
      errorCallbackURL: "/login?error=oauth",
    });
    if (res.error) setPending(null);
  };

  if (me.data) return <Navigate to={redirectTo} replace />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo className="mb-6 size-14" />
          <h1 className="text-3xl font-bold tracking-tight">{t("app.name")}</h1>
          <p className="mt-3 text-muted-foreground">{t("login.tagline")}</p>
        </div>

        <Card className="p-6 shadow-sm">
          <h2 className="mb-5 text-center text-sm font-medium text-muted-foreground">{t("login.title")}</h2>
          {params.get("error") && (
            <p role="alert" className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {t("login.failed")}
            </p>
          )}
          {config.isPending ? (
            <Spinner className="py-6" />
          ) : (
            <div className="space-y-3">
              {config.data?.providers.map((p) => {
                const { icon: Icon, labelKey } = PROVIDERS[p];
                return (
                  <Button
                    key={p}
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    loading={pending === p}
                    disabled={pending !== null}
                    onClick={() => void signIn(p)}
                  >
                    {pending !== p && <Icon />}
                    {t(labelKey)}
                  </Button>
                );
              })}
              {config.data?.providers.length === 0 && !config.data.devLogin && (
                <p className="text-center text-sm text-muted-foreground">{t("login.noProviders")}</p>
              )}
              {config.data?.devLogin && <DevLogin redirectTo={redirectTo} />}
            </div>
          )}
        </Card>
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          <Trans
            i18nKey="login.terms"
            components={{
              terms: <Link to="/terms" className="underline underline-offset-2 hover:text-foreground" />,
              privacy: <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground" />,
            }}
          />
        </p>
      </div>
    </div>
  );
}
