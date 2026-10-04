export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const internal = new URL(request.url);
    // Next.js may use its internal listener hostname in request.url. The browser
    // targets the Host authority, including through HTTPS termination in hosting.
    const host = request.headers.get("host") || internal.host;
    if (/[\s/@\\]/.test(host)) return false;
    const forwarded = request.headers.get("x-forwarded-proto");
    const protocol =
      forwarded === "http" || forwarded === "https"
        ? `${forwarded}:`
        : internal.protocol;
    return origin === new URL(`${protocol}//${host}`).origin;
  } catch {
    return false;
  }
}
