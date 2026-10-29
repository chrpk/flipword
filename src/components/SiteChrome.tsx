import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Logo } from "./Logo";
import { buttonClass } from "./classes";

/** Header of the pages signed-out visitors see (landing, privacy, terms). */
export function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2.5 rounded-md">
        <Logo className="size-7" />
        <span className="text-lg font-semibold tracking-tight">{t("app.name")}</span>
      </Link>
      <Link to="/login" className={buttonClass("secondary")}>
        {t("landing.signIn")}
      </Link>
    </header>
  );
}

/** Links to the legal pages, which must be reachable without signing in. */
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("footer.legal")} className={className}>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <li>
          <Link to="/privacy" className="rounded-md hover:text-foreground">
            {t("footer.privacy")}
          </Link>
        </li>
        <li>
          <Link to="/terms" className="rounded-md hover:text-foreground">
            {t("footer.terms")}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground sm:px-6">
        <span className="flex items-center gap-2">
          <Logo className="size-5" />
          {t("app.name")}
        </span>
        <LegalLinks />
      </div>
    </footer>
  );
}
