import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CreatedToken } from "../../shared/types";
import { api, queryKeys } from "../lib/api";
import { formatDate, formatRelative } from "../lib/format";
import { toast } from "./toast";
import { Button, ConfirmDialog, CopyButton, Field, Input, SegmentedControl, Spinner } from "./ui";
import { cx } from "./classes";

type Client = "claude-code" | "claude-desktop" | "cursor";

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative rounded-lg border bg-muted/50">
      <div className="absolute top-1.5 right-1.5">
        <CopyButton text={code} label={label} />
      </div>
      {/* Wrap instead of scrolling so long commands never run under the Copy button. */}
      <pre className="p-4 pr-24 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

function snippet(client: Client, url: string, token: string) {
  if (client === "claude-code") {
    return `claude mcp add --transport http flipword ${url} \\\n  --header "Authorization: Bearer ${token}"`;
  }
  if (client === "cursor") {
    return JSON.stringify({ mcpServers: { flipword: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  }
  return JSON.stringify(
    {
      mcpServers: {
        flipword: {
          command: "npx",
          args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
          env: { AUTH_HEADER: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** Settings section: personal access tokens for MCP clients, with copy-paste setup per client. */
export function ConnectAssistant() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: queryKeys.tokens, queryFn: api.tokens });
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [client, setClient] = useState<Client>("claude-code");
  const [revoking, setRevoking] = useState<string | null>(null);
  const url = `${window.location.origin}/api/mcp`;

  const create = useMutation({
    mutationFn: () => api.createToken(name.trim()),
    onSuccess: (token) => {
      setCreated(token);
      setName("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
    },
    onError: () => toast.error(t("errors.saveFailed")),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeToken(id),
    onSuccess: (_, id) => {
      if (created?.id === id) setCreated(null);
      setRevoking(null);
      toast.success(t("mcp.revoked"));
      void queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
    },
    onError: () => toast.error(t("errors.deleteFailed")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <div className="space-y-6">
      <Field label={t("mcp.serverUrl")} hint={t("mcp.serverUrlHint")} htmlFor="mcp-server-url">
        <div className="flex items-center gap-2">
          <Input id="mcp-server-url" readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <CopyButton text={url} label={t("mcp.copyUrl")} />
        </div>
      </Field>

      {created ? (
        <div className="space-y-4 rounded-xl border border-review/30 bg-review/5 p-4">
          <div>
            <p className="font-medium">{t("mcp.createdTitle", { name: created.name })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("mcp.createdHint")}</p>
          </div>
          <CodeBlock code={created.token} label={t("mcp.copyToken")} />
          <div className="space-y-3">
            <SegmentedControl<Client>
              label={t("mcp.client")}
              value={client}
              onChange={setClient}
              options={[
                { value: "claude-code", label: "Claude Code" },
                { value: "claude-desktop", label: "Claude Desktop" },
                { value: "cursor", label: "Cursor" },
              ]}
            />
            <p className="text-sm text-muted-foreground">{t(`mcp.instructions.${client}`)}</p>
            <CodeBlock code={snippet(client, url, created.token)} label={t("mcp.copySetup")} />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
            {t("common.done")}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t("mcp.newToken")} htmlFor="token-name">
              <Input
                id="token-name"
                maxLength={60}
                placeholder={t("mcp.tokenNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            <KeyRound />
            {t("mcp.create")}
          </Button>
        </form>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">{t("mcp.tokens")}</p>
        {tokens.isPending ? (
          <Spinner className="py-4" />
        ) : !tokens.data?.length ? (
          <p className="text-sm text-muted-foreground">{t("mcp.noTokens")}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {tokens.data.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tk.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{tk.prefix}…</span> · {t("mcp.createdOn", { date: formatDate(i18n.language, tk.createdAt) })} ·{" "}
                    {tk.lastUsedAt ? t("mcp.lastUsed", { when: formatRelative(i18n.language, tk.lastUsedAt) }) : t("mcp.neverUsed")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cx("text-destructive hover:bg-destructive/10")}
                  onClick={() => setRevoking(tk.id)}
                  aria-label={t("mcp.revokeNamed", { name: tk.name })}
                >
                  <Trash2 />
                  {t("mcp.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        loading={revoke.isPending}
        title={t("mcp.revokeTitle")}
        description={t("mcp.revokeDescription")}
        confirmLabel={t("mcp.revoke")}
      />
    </div>
  );
}
