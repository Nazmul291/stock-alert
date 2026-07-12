export function LandingHero({ description, appStoreUrl }: { description: string; appStoreUrl: string }) {
  return (
    <section className="sa-hero">
      <h1 className="sa-heroHeading">Never Lose a Sale to a Stockout</h1>
      <p className="sa-heroText">{description}</p>
      <div className="sa-heroActions">
        <a
          className="sa-primaryButton"
          href={appStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Add to Shopify — Free 30-day trial
        </a>
        <a className="sa-secondaryButton" href="#features">
          See how it works
        </a>
      </div>
      <p className="sa-heroNote">
        Installs in under 2 minutes · No credit card required to start your trial
      </p>
    </section>
  );
}
