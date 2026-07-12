// Every Zustand store's setters must call this first. This app's loaders run
// server-side per request, and a Zustand store created with create() is one
// instance shared by the whole Node process — a setter invoked during SSR
// (accidentally, e.g. from a render body instead of an effect/handler) would
// leak one shop's data into another shop's concurrently-rendering response.
// This turns that into an immediate crash instead of a silent cross-tenant
// leak. Reads during SSR are safe (every request's server render sees the
// same untouched default state), so this only guards writes.
export function assertClientOnly(storeName: string, action: string) {
  if (typeof document === "undefined") {
    throw new Error(`${storeName}.${action} called during SSR — would leak data across shops.`);
  }
}
