export function LandingFinalCta({ appStoreUrl }: { appStoreUrl: string }) {
  return (
    <section className="sa-finalCta">
      <h2>Ready to stop losing sales to stockouts?</h2>
      <a
        className="sa-primaryButton"
        href={appStoreUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Add to Shopify — Free 30-day trial
      </a>
    </section>
  );
}
