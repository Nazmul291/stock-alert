import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Kept in sync by hand with app/lib/supplier-options.ts — this extension is
// a separately bundled Shopify admin UI extension (its own build, no
// cross-import of app/lib), so the two option lists are intentionally
// duplicated rather than shared. Update both if this list ever changes.
const PAYMENT_TERMS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'NET7', label: 'Net 7' },
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'COD', label: 'Cash on delivery' },
  { value: 'ON_RECEIPT', label: 'Payment on receipt' },
  { value: 'IN_ADVANCE', label: 'Payment in advance' },
];

const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'USD', label: 'US Dollar (USD $)' },
  { value: 'EUR', label: 'Euro (EUR €)' },
  { value: 'GBP', label: 'British Pound (GBP £)' },
  { value: 'CAD', label: 'Canadian Dollar (CAD $)' },
  { value: 'AFN', label: 'Afghan Afghani (AFN ؋)' },
  { value: 'ALL', label: 'Albanian Lek (ALL)' },
  { value: 'DZD', label: 'Algerian Dinar (DZD)' },
  { value: 'AOA', label: 'Angolan Kwanza (AOA Kz)' },
  { value: 'ARS', label: 'Argentine Peso (ARS $)' },
  { value: 'AMD', label: 'Armenian Dram (AMD ֏)' },
  { value: 'AWG', label: 'Aruban Florin (AWG)' },
  { value: 'AUD', label: 'Australian Dollar (AUD $)' },
  { value: 'BBD', label: 'Barbadian Dollar (BBD $)' },
  { value: 'AZN', label: 'Azerbaijani Manat (AZN ₼)' },
  { value: 'BDT', label: 'Bangladeshi Taka (BDT ৳)' },
  { value: 'BSD', label: 'Bahamian Dollar (BSD $)' },
  { value: 'BHD', label: 'Bahraini Dinar (BHD)' },
  { value: 'BIF', label: 'Burundian Franc (BIF)' },
  { value: 'BYN', label: 'Belarusian Ruble (BYN)' },
  { value: 'BZD', label: 'Belize Dollar (BZD $)' },
  { value: 'BMD', label: 'Bermudan Dollar (BMD $)' },
  { value: 'BTN', label: 'Bhutanese Ngultrum (BTN)' },
  { value: 'BAM', label: 'Bosnia-Herzegovina Convertible Mark (BAM KM)' },
  { value: 'BRL', label: 'Brazilian Real (BRL R$)' },
  { value: 'BOB', label: 'Bolivian Boliviano (BOB Bs)' },
  { value: 'BWP', label: 'Botswanan Pula (BWP P)' },
  { value: 'BND', label: 'Brunei Dollar (BND $)' },
  { value: 'BGN', label: 'Bulgarian Lev (BGN)' },
  { value: 'MMK', label: 'Myanmar Kyat (MMK K)' },
  { value: 'KHR', label: 'Cambodian Riel (KHR ៛)' },
  { value: 'CVE', label: 'Cape Verdean Escudo (CVE)' },
  { value: 'KYD', label: 'Cayman Islands Dollar (KYD $)' },
  { value: 'XAF', label: 'Central African CFA Franc (XAF FCFA)' },
  { value: 'CLP', label: 'Chilean Peso (CLP $)' },
  { value: 'CNY', label: 'Chinese Yuan (CNY ¥)' },
  { value: 'COP', label: 'Colombian Peso (COP $)' },
  { value: 'KMF', label: 'Comorian Franc (KMF CF)' },
  { value: 'CDF', label: 'Congolese Franc (CDF)' },
  { value: 'CRC', label: 'Costa Rican Colón (CRC ₡)' },
  { value: 'HRK', label: 'Croatian Kuna (HRK kn)' },
  { value: 'CZK', label: 'Czech Koruna (CZK Kč)' },
  { value: 'DKK', label: 'Danish Krone (DKK kr)' },
  { value: 'DJF', label: 'Djiboutian Franc (DJF)' },
  { value: 'DOP', label: 'Dominican Peso (DOP $)' },
  { value: 'XCD', label: 'East Caribbean Dollar (XCD $)' },
  { value: 'EGP', label: 'Egyptian Pound (EGP E£)' },
  { value: 'ERN', label: 'Eritrean Nakfa (ERN)' },
  { value: 'ETB', label: 'Ethiopian Birr (ETB)' },
  { value: 'FKP', label: 'Falkland Islands Pound (FKP £)' },
  { value: 'XPF', label: 'CFP Franc (XPF CFPF)' },
  { value: 'FJD', label: 'Fijian Dollar (FJD $)' },
  { value: 'GIP', label: 'Gibraltar Pound (GIP £)' },
  { value: 'GMD', label: 'Gambian Dalasi (GMD)' },
  { value: 'GHS', label: 'Ghanaian Cedi (GHS ₵)' },
  { value: 'GTQ', label: 'Guatemalan Quetzal (GTQ Q)' },
  { value: 'GYD', label: 'Guyanaese Dollar (GYD $)' },
  { value: 'GEL', label: 'Georgian Lari (GEL ₾)' },
  { value: 'GNF', label: 'Guinean Franc (GNF FG)' },
  { value: 'HTG', label: 'Haitian Gourde (HTG)' },
  { value: 'HNL', label: 'Honduran Lempira (HNL L)' },
  { value: 'HKD', label: 'Hong Kong Dollar (HKD HK$)' },
  { value: 'HUF', label: 'Hungarian Forint (HUF Ft)' },
  { value: 'ISK', label: 'Icelandic Króna (ISK kr)' },
  { value: 'INR', label: 'Indian Rupee (INR ₹)' },
  { value: 'IDR', label: 'Indonesian Rupiah (IDR Rp)' },
  { value: 'ILS', label: 'Israeli New Shekel (ILS ₪)' },
  { value: 'IRR', label: 'Iranian Rial (IRR)' },
  { value: 'IQD', label: 'Iraqi Dinar (IQD)' },
  { value: 'JMD', label: 'Jamaican Dollar (JMD $)' },
  { value: 'JPY', label: 'Japanese Yen (JPY ¥)' },
  { value: 'JEP', label: 'Jersey Pound (JEP)' },
  { value: 'JOD', label: 'Jordanian Dinar (JOD)' },
  { value: 'KZT', label: 'Kazakhstani Tenge (KZT ₸)' },
  { value: 'KES', label: 'Kenyan Shilling (KES)' },
  { value: 'KID', label: 'Kiribati Dollar (KID)' },
  { value: 'KWD', label: 'Kuwaiti Dinar (KWD)' },
  { value: 'KGS', label: 'Kyrgystani Som (KGS ⃀)' },
  { value: 'LAK', label: 'Laotian Kip (LAK ₭)' },
  { value: 'LVL', label: 'Latvian Lats (LVL)' },
  { value: 'LBP', label: 'Lebanese Pound (LBP L£)' },
  { value: 'LSL', label: 'Lesotho Loti (LSL)' },
  { value: 'LRD', label: 'Liberian Dollar (LRD $)' },
  { value: 'LYD', label: 'Libyan Dinar (LYD)' },
  { value: 'LTL', label: 'Lithuanian Litas (LTL)' },
  { value: 'MGA', label: 'Malagasy Ariary (MGA Ar)' },
  { value: 'MKD', label: 'Macedonian Denar (MKD)' },
  { value: 'MOP', label: 'Macanese Pataca (MOP)' },
  { value: 'MWK', label: 'Malawian Kwacha (MWK)' },
  { value: 'MVR', label: 'Maldivian Rufiyaa (MVR)' },
  { value: 'MRU', label: 'Mauritanian Ouguiya (MRU)' },
  { value: 'MXN', label: 'Mexican Peso (MXN $)' },
  { value: 'MYR', label: 'Malaysian Ringgit (MYR RM)' },
  { value: 'MUR', label: 'Mauritian Rupee (MUR Rs)' },
  { value: 'MDL', label: 'Moldovan Leu (MDL)' },
  { value: 'MAD', label: 'Moroccan Dirham (MAD)' },
  { value: 'MNT', label: 'Mongolian Tugrik (MNT ₮)' },
  { value: 'MZN', label: 'Mozambican Metical (MZN)' },
  { value: 'NAD', label: 'Namibian Dollar (NAD $)' },
  { value: 'NPR', label: 'Nepalese Rupee (NPR Rs)' },
  { value: 'ANG', label: 'Netherlands Antillean Guilder (ANG)' },
  { value: 'NZD', label: 'New Zealand Dollar (NZD $)' },
  { value: 'NIO', label: 'Nicaraguan Córdoba (NIO C$)' },
  { value: 'NGN', label: 'Nigerian Naira (NGN ₦)' },
  { value: 'NOK', label: 'Norwegian Krone (NOK kr)' },
  { value: 'OMR', label: 'Omani Rial (OMR)' },
  { value: 'PAB', label: 'Panamanian Balboa (PAB)' },
  { value: 'PKR', label: 'Pakistani Rupee (PKR Rs)' },
  { value: 'PGK', label: 'Papua New Guinean Kina (PGK)' },
  { value: 'PYG', label: 'Paraguayan Guarani (PYG ₲)' },
  { value: 'PEN', label: 'Peruvian Sol (PEN)' },
  { value: 'PHP', label: 'Philippine Piso (PHP ₱)' },
  { value: 'PLN', label: 'Polish Zloty (PLN zł)' },
  { value: 'QAR', label: 'Qatari Rial (QAR)' },
  { value: 'RON', label: 'Romanian Leu (RON lei)' },
  { value: 'RUB', label: 'Russian Ruble (RUB ₽)' },
  { value: 'RWF', label: 'Rwandan Franc (RWF RF)' },
  { value: 'WST', label: 'Samoan Tala (WST)' },
  { value: 'SHP', label: 'St. Helena Pound (SHP £)' },
  { value: 'SAR', label: 'Saudi Riyal (SAR)' },
  { value: 'RSD', label: 'Serbian Dinar (RSD)' },
  { value: 'SCR', label: 'Seychellois Rupee (SCR)' },
  { value: 'SLL', label: 'Sierra Leonean Leone (SLL)' },
  { value: 'SGD', label: 'Singapore Dollar (SGD $)' },
  { value: 'SDG', label: 'Sudanese Pound (SDG)' },
  { value: 'SOS', label: 'Somali Shilling (SOS)' },
  { value: 'SYP', label: 'Syrian Pound (SYP £)' },
  { value: 'ZAR', label: 'South African Rand (ZAR R)' },
  { value: 'KRW', label: 'South Korean Won (KRW ₩)' },
  { value: 'SSP', label: 'South Sudanese Pound (SSP £)' },
  { value: 'SBD', label: 'Solomon Islands Dollar (SBD $)' },
  { value: 'LKR', label: 'Sri Lankan Rupee (LKR Rs)' },
  { value: 'SRD', label: 'Surinamese Dollar (SRD $)' },
  { value: 'SZL', label: 'Swazi Lilangeni (SZL)' },
  { value: 'SEK', label: 'Swedish Krona (SEK kr)' },
  { value: 'CHF', label: 'Swiss Franc (CHF)' },
  { value: 'TWD', label: 'New Taiwan Dollar (TWD $)' },
  { value: 'THB', label: 'Thai Baht (THB ฿)' },
  { value: 'TJS', label: 'Tajikistani Somoni (TJS)' },
  { value: 'TZS', label: 'Tanzanian Shilling (TZS)' },
  { value: 'TOP', label: "Tongan Pa'anga (TOP T$)" },
  { value: 'TTD', label: 'Trinidad & Tobago Dollar (TTD $)' },
  { value: 'TND', label: 'Tunisian Dinar (TND)' },
  { value: 'TRY', label: 'Turkish Lira (TRY ₺)' },
  { value: 'TMT', label: 'Turkmenistani Manat (TMT)' },
  { value: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { value: 'UAH', label: 'Ukrainian Hryvnia (UAH ₴)' },
  { value: 'AED', label: 'United Arab Emirates Dirham (AED)' },
  { value: 'UYU', label: 'Uruguayan Peso (UYU $)' },
  { value: 'UZS', label: 'Uzbekistani Som (UZS)' },
  { value: 'VUV', label: 'Vanuatu Vatu (VUV)' },
  { value: 'VES', label: 'Venezuelan Bolívar (VES)' },
  { value: 'VND', label: 'Vietnamese Dong (VND ₫)' },
  { value: 'XOF', label: 'West African CFA Franc (XOF F CFA)' },
  { value: 'YER', label: 'Yemeni Rial (YER)' },
  { value: 'ZMW', label: 'Zambian Kwacha (ZMW ZK)' },
  { value: 'BYR', label: 'Belarusian Ruble (2000–2016) (BYR)' },
  { value: 'STD', label: 'São Tomé & Príncipe Dobra (1977–2017) (STD)' },
  { value: 'STN', label: 'São Tomé & Príncipe Dobra (STN Db)' },
  { value: 'VED', label: 'Bolívar Soberano (VED)' },
  { value: 'VEF', label: 'Venezuelan Bolívar (2008–2018) (VEF)' },
  { value: 'XXX', label: 'Unknown Currency (XXX)' },
  { value: 'USDC', label: 'USDC (USDC USD)' },
];

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
                <s-select label="Payment terms" value={newPaymentTerms} onChange={(event) => setNewPaymentTerms(event.currentTarget.value)}>
                  {PAYMENT_TERMS_OPTIONS.map((o) => (
                    <s-option key={o.value} value={o.value}>{o.label}</s-option>
                  ))}
                </s-select>
                <s-select label="Currency" value={newCurrency} onChange={(event) => setNewCurrency(event.currentTarget.value)}>
                  <s-option value="">None</s-option>
                  {CURRENCY_OPTIONS.map((o) => (
                    <s-option key={o.value} value={o.value}>{o.label}</s-option>
                  ))}
                </s-select>
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
