import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { Spinner } from "../components/ui";
import { api, queryKeys } from "../lib/api";
import { formatDate } from "../lib/format";
import { LEGAL_SECTIONS, LEGAL_UPDATED, type LegalPageId } from "../lib/legal";

/** Who runs this instance and how to reach them, from the OPERATOR_NAME / CONTACT_EMAIL vars. */
function Operator() {
  const { t } = useTranslation();
  const config = useQuery({ queryKey: queryKeys.config, queryFn: api.config, staleTime: Infinity });
  if (config.isPending) return <Spinner className="justify-start py-2" />;
  const { name, email } = config.data?.operator ?? { name: "", email: "" };
  if (!name && !email) return <p className="text-sm text-muted-foreground">{t("legal.notConfigured")}</p>;
  return (
    <p className="text-sm">
      {name && <span className="font-medium">{t("legal.operator", { name })}</span>}
      {name && email && " · "}
      {email && (
        <>
          {t("legal.contact")}:{" "}
          <a href={`mailto:${email}`} className="font-medium underline underline-offset-4">
            {email}
          </a>
        </>
      )}
    </p>
  );
}

function LegalPage({ page }: { page: LegalPageId }) {
  const { t, i18n } = useTranslation();
  const sections = LEGAL_SECTIONS[page];

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
        <h1 className="text-4xl font-bold tracking-tight">{t(`legal.${page}.title`)}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("legal.updated", { date: formatDate(i18n.language, LEGAL_UPDATED) })}
        </p>
        <div className="mt-6 rounded-xl border bg-muted/40 p-4">
          <Operator />
        </div>
        <p className="mt-8 text-lg leading-relaxed text-muted-foreground">{t(`legal.${page}.intro`)}</p>

        <nav aria-label={t("legal.toc")} className="mt-8">
          <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {sections.map((s) => (
              <li key={s}>
                <a href={`#${s}`} className="rounded-md text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  {t(`legal.${page}.${s}.title`)}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s) => (
          <section key={s} id={s} className="mt-10 scroll-mt-6">
            <h2 className="text-xl font-semibold tracking-tight">{t(`legal.${page}.${s}.title`)}</h2>
            {t(`legal.${page}.${s}.body`)
              .split("\n\n")
              .map((paragraph, i) => (
                <p key={i} className="mt-3 leading-relaxed">
                  {paragraph}
                </p>
              ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PrivacyPage() {
  return <LegalPage page="privacy" />;
}

export function TermsPage() {
  return <LegalPage page="terms" />;
}
