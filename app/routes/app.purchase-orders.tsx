import { Outlet } from "react-router";

// Pathless layout for the /app/purchase-orders/* route family. Required for
// app.purchase-orders.$id.tsx to render at all: React Router's flat-routes
// convention nests any *.$id.tsx file under a same-named *.tsx file sharing
// its prefix, so without this Outlet the parent (formerly the list page
// itself, moved to app.purchase-orders._index.tsx) always rendered in full
// and the detail route's content had nowhere to mount — "View" on a PO, and
// the redirect after creating one, silently kept showing the list.
export default function PurchaseOrdersLayout() {
  return <Outlet />;
}
