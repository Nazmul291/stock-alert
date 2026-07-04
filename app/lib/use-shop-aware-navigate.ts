import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

// Wraps useNavigate so every client-side navigation inside the embedded app
// keeps shop/host/embedded in the URL — otherwise SPA navigations (s-link
// clicks, programmatic navigate() calls) drop them and only the session
// token carries the shop, which is invisible to URL-based logging/debugging.
export function useShopAwareNavigate() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string, options?: { replace?: boolean }) => {
      const [path, query] = to.split("?");
      const params = new URLSearchParams(query);
      const current = new URLSearchParams(location.search);
      for (const key of ["shop", "host", "embedded"]) {
        if (!params.has(key) && current.has(key)) params.set(key, current.get(key)!);
      }
      const search = params.toString();
      navigate(search ? `${path}?${search}` : path, options);
    },
    [navigate, location.search],
  );
}
