import logoMark from "../../assets/logo-mark.png";

export function LandingHeader({ appName, appStoreUrl }: { appName: string; appStoreUrl: string }) {
  return (
    <header className="sa-header">
      <div className="sa-headerInner">
        <a href="/" className="sa-brand">
          <img src={logoMark} alt="" className="sa-brandLogo" loading="lazy" />
          <span>{appName}</span>
        </a>
        <nav className="sa-nav">
          <a href="/pricing">Pricing</a>
          <a href="/blog">Blogs</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/docs">Docs</a>
        </nav>
        <a
          className="sa-headerCta"
          href={appStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Add to Shopify
        </a>
      </div>
    </header>
  );
}
