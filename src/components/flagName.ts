import { useTranslation } from "react-i18next";
import { useMe } from "./me";

/** The user's name for a flag, falling back to its colour name. */
export function useFlagName() {
  const { t } = useTranslation();
  const { settings } = useMe();
  return (flag: number) => settings.flagNames[flag - 1]?.trim() || t(`flags.default.${flag}`);
}
