declare module "*.css";

// Shopify App Home web component type declarations
declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-page": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { heading?: string; "sub-heading"?: string; [key: string]: unknown }, HTMLElement>;
    "s-section": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { heading?: string; slot?: string; [key: string]: unknown }, HTMLElement>;
    "s-card": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { href?: string; variant?: string; loading?: boolean; submit?: boolean; slot?: string; disabled?: boolean; target?: string; onClick?: React.MouseEventHandler<HTMLElement>; [key: string]: unknown }, HTMLElement>;
    "s-link": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { href?: string; target?: string; [key: string]: unknown }, HTMLElement>;
    "s-paragraph": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-heading": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-text": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-stack": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { direction?: string; gap?: string; [key: string]: unknown }, HTMLElement>;
    "s-inline-stack": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-box": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { padding?: string; background?: string; "border-width"?: string; "border-radius"?: string; [key: string]: unknown }, HTMLElement>;
    "s-badge": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { tone?: string; [key: string]: unknown }, HTMLElement>;
    "s-banner": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { tone?: string; title?: string; [key: string]: unknown }, HTMLElement>;
    "s-unordered-list": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-list-item": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-spinner": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
    "s-divider": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: unknown }, HTMLElement>;
  }
}
