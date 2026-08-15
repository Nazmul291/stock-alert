import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

type SupplierOption = { id: string; name: string };
type LocationOption = { locationId: string; locationName: string };
type VariantLine = {
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  suggestedQuantity: number;
  unitCost: number | null;
  price: string | null;
  compareAtPrice: string | null;
};
type Context = {
  entitled: boolean;
  productTitle: string;
  suppliers: SupplierOption[];
  locations: LocationOption[];
  variants: VariantLine[];
};

const NEW_SUPPLIER = '__new__';

// Shopify names the sole variant of any product with no real options
// "Default Title" — merchants never chose that name, so it's shown as the
// product title instead, same as everywhere else in the app.
function variantLabel(variant: VariantLine, productTitle: string): string {
  return variant.variantTitle && variant.variantTitle !== 'Default Title' ? variant.variantTitle : productTitle;
}

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { close, data } = shopify;
  const productGid = data.selected?.[0]?.id ?? '';
  const productId = productGid.split('/').pop() ?? '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [context, setContext] = useState<Context | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [newName, setNewName] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newWebsite, setNewWebsite] = useState('');
  const [newAddress1, setNewAddress1] = useState('');
  const [newAddress2, setNewAddress2] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newProvince, setNewProvince] = useState('');
  const [newZip, setNewZip] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newPaymentTerms, setNewPaymentTerms] = useState('');
  const [newCurrency, setNewCurrency] = useState('');
  const [newLeadTime, setNewLeadTime] = useState('');

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({});
  const [skus, setSkus] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdPoNumber, setCreatedPoNumber] = useState<number | null>(null);
  const [createdPoUrl, setCreatedPoUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/extension/context?productId=${encodeURIComponent(productId)}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = (await res.json()) as Context;
        setContext(json);
        setLocationId(json.locations[0]?.locationId ?? '');
        setQuantities(
          Object.fromEntries(
            json.variants.map((v) => [v.variantId, v.suggestedQuantity > 0 ? String(v.suggestedQuantity) : '']),
          ),
        );
        // Same live-Shopify-first defaults as the full product-detail
        // page's own Create Purchase Order flow — unitCost/sku are already resolved
        // live-vs-tracked by getProductDetail before this ever reaches the
        // extension, so it's a straight seed, no further fallback needed here.
        setUnitCosts(
          Object.fromEntries(
            json.variants.map((v) => [v.variantId, v.unitCost != null ? String(v.unitCost) : '']),
          ),
        );
        setSkus(Object.fromEntries(json.variants.map((v) => [v.variantId, v.sku ?? ''])));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [productId]);

  const canSubmit =
    !submitting &&
    context != null &&
    context.entitled &&
    (supplierId === NEW_SUPPLIER ? newName.trim() !== '' && newEmail.trim() !== '' && newPhone.trim() !== '' : supplierId !== '') &&
    // Only required when the shop actually has locations to choose from —
    // same defensive fallback as the full app's Create Purchase Order flows,
    // in case the live Shopify locations lookup itself failed.
    (context.locations.length === 0 || locationId !== '') &&
    Object.values(quantities).some((q) => (parseInt(q, 10) || 0) > 0);

  async function handleCreate() {
    if (!context) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      let resolvedSupplierId = supplierId;

      if (supplierId === NEW_SUPPLIER) {
        const res = await fetch('/api/extension/create-supplier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName,
            contactName: newContactName,
            email: newEmail,
            phone: newPhone,
            website: newWebsite,
            address1: newAddress1,
            address2: newAddress2,
            city: newCity,
            province: newProvince,
            zip: newZip,
            country: newCountry,
            paymentTerms: newPaymentTerms,
            currency: newCurrency,
            leadTimeDays: newLeadTime,
          }),
        });
        const json = (await res.json()) as { success: boolean; id?: string; error?: string };
        if (!json.success || !json.id) {
          setSubmitError(json.error ?? 'Failed to create supplier.');
          setSubmitting(false);
          return;
        }
        resolvedSupplierId = json.id;
      }

      const chosenLocation = context.locations.find((loc) => loc.locationId === locationId) ?? null;
      const lines = context.variants
        .map((v) => ({
          variantId: v.variantId,
          quantityOrdered: parseInt(quantities[v.variantId] ?? '0', 10) || 0,
          unitCost: unitCosts[v.variantId] ? parseFloat(unitCosts[v.variantId]) : null,
          sku: (skus[v.variantId] ?? '').trim() || null,
          locationId: chosenLocation?.locationId ?? null,
          locationName: chosenLocation?.locationName ?? null,
        }))
        .filter((l) => l.quantityOrdered > 0);

      const poRes = await fetch('/api/extension/create-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, supplierId: resolvedSupplierId, lines }),
      });
      const poJson = (await poRes.json()) as { success: boolean; poNumber?: number; purchaseOrderUrl?: string; error?: string };
      if (!poJson.success || poJson.poNumber == null) {
        setSubmitError(poJson.error ?? 'Failed to create purchase order.');
        setSubmitting(false);
        return;
      }
      setCreatedPoNumber(poJson.poNumber);
      setCreatedPoUrl(poJson.purchaseOrderUrl ?? null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (createdPoNumber !== null) {
    return (
      <s-admin-action heading="Purchase order created">
        <s-banner tone="success" heading={`Purchase order #${createdPoNumber} created`}>
          The supplier has been assigned to this product.
        </s-banner>
        {createdPoUrl && (
          <s-button slot="primary-action" href={createdPoUrl} target="_top">
            View Purchase Order
          </s-button>
        )}
        <s-button slot="secondary-actions" onClick={() => close()}>
          Done
        </s-button>
      </s-admin-action>
    );
  }

  return (
    <s-admin-action heading="Create purchase order" loading={loading || submitting}>
      {loadError && (
        <s-banner tone="critical" heading="Couldn't load product data">
          {loadError}
        </s-banner>
      )}

      {!loadError && context && !context.entitled && (
        <s-banner tone="info" heading="Enterprise plan feature">
          Suppliers and purchase orders are available on the Enterprise plan.
        </s-banner>
      )}

      {!loadError && context && context.entitled && (
        <s-stack direction="block" gap="base">
          {submitError && (
            <s-banner tone="critical" heading="Couldn't create purchase order">
              {submitError}
            </s-banner>
          )}

          <s-stack direction="inline" gap="base">
            <s-select label="Supplier" value={supplierId} onChange={(event) => setSupplierId(event.currentTarget.value)}>
              <s-option value="">Select a supplier…</s-option>
              {context.suppliers.map((supplier) => (
                <s-option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </s-option>
              ))}
              <s-option value={NEW_SUPPLIER}>+ Add new supplier</s-option>
            </s-select>
            <s-select
              label="Location"
              value={locationId}
              disabled={context.locations.length === 0}
              onChange={(event) => setLocationId(event.currentTarget.value)}
            >
              <s-option value="">Select a location…</s-option>
              {context.locations.map((loc) => (
                <s-option key={loc.locationId} value={loc.locationId}>
                  {loc.locationName}
                </s-option>
              ))}
            </s-select>
          </s-stack>

          {supplierId === NEW_SUPPLIER && (
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Company"
                value={newName}
                required
                onChange={(event) => setNewName(event.currentTarget.value)}
              />
              <s-text-field
                label="Contact name"
                value={newContactName}
                onChange={(event) => setNewContactName(event.currentTarget.value)}
              />
              <s-email-field
                label="Email"
                value={newEmail}
                required
                onChange={(event) => setNewEmail(event.currentTarget.value)}
              />
              <s-text-field
                label="Phone"
                value={newPhone}
                required
                onChange={(event) => setNewPhone(event.currentTarget.value)}
              />
              <s-url-field
                label="Website"
                value={newWebsite}
                onChange={(event) => setNewWebsite(event.currentTarget.value)}
              />
              <s-text-field
                label="Address"
                value={newAddress1}
                onChange={(event) => setNewAddress1(event.currentTarget.value)}
              />
              <s-text-field
                label="Apartment, suite, etc"
                value={newAddress2}
                onChange={(event) => setNewAddress2(event.currentTarget.value)}
              />
              <s-stack direction="inline" gap="base">
                <s-text-field
                  label="City"
                  value={newCity}
                  onChange={(event) => setNewCity(event.currentTarget.value)}
                />
                <s-text-field
                  label="State/Province"
                  value={newProvince}
                  onChange={(event) => setNewProvince(event.currentTarget.value)}
                />
                <s-text-field
                  label="ZIP code"
                  value={newZip}
                  onChange={(event) => setNewZip(event.currentTarget.value)}
                />
              </s-stack>
              <s-text-field
                label="Country/region"
                value={newCountry}
                onChange={(event) => setNewCountry(event.currentTarget.value)}
              />
              <s-stack direction="inline" gap="base">
                <s-text-field
                  label="Payment terms"
                  value={newPaymentTerms}
                  placeholder="e.g. Net 30"
                  onChange={(event) => setNewPaymentTerms(event.currentTarget.value)}
                />
                <s-text-field
                  label="Currency"
                  value={newCurrency}
                  placeholder="USD"
                  onChange={(event) => setNewCurrency(event.currentTarget.value)}
                />
              </s-stack>
              <s-number-field
                label="Lead time (days)"
                value={newLeadTime}
                min={0}
                onChange={(event) => setNewLeadTime(event.currentTarget.value)}
              />
            </s-stack>
          )}

          {context.variants.length === 0 ? (
            <s-banner tone="warning" heading="No tracked variants">
              Track this product in Stock Alert before ordering it.
            </s-banner>
          ) : (
            context.variants.map((variant) => (
              <s-stack key={variant.variantId} direction="block" gap="small">
                <s-text>
                  {variantLabel(variant, context.productTitle)} ({variant.currentQuantity} on hand)
                  {variant.price ? ` · ${variant.price}` : ''}
                  {variant.compareAtPrice ? ` (was ${variant.compareAtPrice})` : ''}
                </s-text>
                <s-stack direction="inline" gap="base" align-items="center">
                  <s-text-field
                    label="SKU"
                    label-accessibility-visibility="exclusive"
                    placeholder="Add SKU"
                    value={skus[variant.variantId] ?? ''}
                    onChange={(event) =>
                      setSkus((s) => ({ ...s, [variant.variantId]: event.currentTarget.value }))
                    }
                  />
                  <s-number-field
                    label="Quantity"
                    label-accessibility-visibility="exclusive"
                    value={quantities[variant.variantId] ?? ''}
                    min={0}
                    onChange={(event) =>
                      setQuantities((q) => ({ ...q, [variant.variantId]: event.currentTarget.value }))
                    }
                  />
                  <s-money-field
                    label="Unit cost"
                    label-accessibility-visibility="exclusive"
                    value={unitCosts[variant.variantId] ?? ''}
                    onChange={(event) =>
                      setUnitCosts((c) => ({ ...c, [variant.variantId]: event.currentTarget.value }))
                    }
                  />
                </s-stack>
              </s-stack>
            ))
          )}
        </s-stack>
      )}

      {context?.entitled && (
        <s-button slot="primary-action" onClick={handleCreate} disabled={!canSubmit}>
          Create Purchase Order
        </s-button>
      )}
      <s-button slot="secondary-actions" onClick={() => close()}>
        Cancel
      </s-button>
    </s-admin-action>
  );
}
