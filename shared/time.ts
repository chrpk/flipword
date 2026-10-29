/** Whether `timeZone` is an IANA zone the runtime knows. */
export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone's offset at `at`, in the same convention as Date#getTimezoneOffset (minutes, positive west of UTC),
 * so daylight-saving changes are handled. Returns null for unknown zones.
 */
export function timeZoneOffset(timeZone: string, at: number): number | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!name) return null;
    if (name === "GMT") return 0;
    const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(name);
    if (!m) return null;
    const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
    // `|| 0` turns "GMT+00:00" into 0 rather than -0.
    return (m[1] === "+" ? -minutes : minutes) || 0;
  } catch {
    return null;
  }
}
