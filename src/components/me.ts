import { createContext, useContext } from "react";
import type { Me } from "../../shared/types";

/** The signed-in user, provided by <RequireAuth>. */
export const MeContext = createContext<Me | null>(null);

export function useMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside an authenticated route");
  return me;
}
