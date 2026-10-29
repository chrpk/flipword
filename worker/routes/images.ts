import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context";

const PREFIX = "/api/images/";

/** Serves a card photo; keys start with the owner's user id, so users only see their own. */
export const images = new Hono<AppEnv>().get("/*", async (c) => {
  const key = c.req.path.slice(PREFIX.length).split("/").map(decodeURIComponent).join("/");
  if (!key.startsWith(`${c.get("userId")}/`)) throw new HTTPException(404, { message: "Not found" });

  const object = await c.env.IMAGES.get(key, { onlyIf: c.req.raw.headers });
  if (!object) throw new HTTPException(404, { message: "Not found" });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Keys are unique per upload, so the content never changes.
  headers.set("cache-control", "private, max-age=31536000, immutable");
  // Only image types are accepted on upload; never let a browser sniff the bytes as something else.
  headers.set("x-content-type-options", "nosniff");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
});

/** Deletes R2 objects in batches of 1000 (the API limit). */
export async function deleteImages(bucket: R2Bucket, keys: (string | null)[]) {
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  for (let i = 0; i < unique.length; i += 1000) await bucket.delete(unique.slice(i, i + 1000));
}

/** Deletes everything under a prefix, e.g. all of a user's photos. */
export async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    await deleteImages(bucket, page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
