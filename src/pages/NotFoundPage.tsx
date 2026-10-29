import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClass } from "../components/classes";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("notFound.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("notFound.description")}</p>
      <Link to="/" className={buttonClass("secondary", "md", "mt-8")}>
        {t("notFound.back")}
      </Link>
    </div>
  );
}
