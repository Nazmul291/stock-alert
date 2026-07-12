import { PLAN_LIMITS } from "../lib/plan-limits";

export function LandingPricing({ appStoreUrl }: { appStoreUrl: string }) {
  return (
    <section id="pricing" className="sa-pricing">
      <h2 className="sa-sectionHeading">Simple, transparent pricing</h2>
      <p className="sa-sectionSub">Every plan includes a 30-day free trial.</p>
      <div className="sa-pricingGrid">
        {(["basic", "pro"] as const).map((key) => {
          const plan = PLAN_LIMITS[key];
          return (
            <div
              key={key}
              className={key === "pro" ? "sa-pricingCard sa-pricingCardHighlight" : "sa-pricingCard"}
            >
              <h3>{plan.name}</h3>
              <p className="sa-price">{plan.price}</p>
              <ul>
                {plan.features.map((feat) => (
                  <li key={feat}>{feat}</li>
                ))}
              </ul>
              <a
                className={key === "pro" ? "sa-primaryButton" : "sa-secondaryButton"}
                href={appStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Start free trial
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
