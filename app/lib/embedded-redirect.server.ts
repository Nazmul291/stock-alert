// Preserves shop/host/embedded query params across server-side redirects so
// the destination page's URL — and every loader log line that reads it —
// always carries the shop, instead of relying solely on the session token.
export function embeddedRedirectPath(
  request: Request,
  path: string,
  shop: string,
  extraParams?: Record<string, string>,
): string {
  const url = new URL(request.url);
  const params = new URLSearchParams(extraParams);
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded") ?? "1";
  if (host) params.set("host", host);
  params.set("shop", shop);
  params.set("embedded", embedded);
  return `${path}?${params.toString()}`;
}
