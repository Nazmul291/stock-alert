declare module "*.css";

// Shopify App Home web component type declarations
declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-page": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { heading?: string; "sub-heading"?: string; [key: string]: any }, HTMLElement>;
    "s-section": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { heading?: string; slot?: string; [key: string]: any }, HTMLElement>;
    "s-card": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { href?: string; variant?: string; loading?: boolean; submit?: boolean; slot?: string; disabled?: boolean; target?: string; onClick?: React.MouseEventHandler<HTMLElement>; [key: string]: any }, HTMLElement>;
    "s-link": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { href?: string; target?: string; [key: string]: any }, HTMLElement>;
    "s-paragraph": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-heading": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-text": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-stack": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { direction?: string; gap?: string; [key: string]: any }, HTMLElement>;
    "s-inline-stack": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-box": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { padding?: string; background?: string; "border-width"?: string; "border-radius"?: string; [key: string]: any }, HTMLElement>;
    "s-badge": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { tone?: string; [key: string]: any }, HTMLElement>;
    "s-banner": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { tone?: string; title?: string; [key: string]: any }, HTMLElement>;
    "s-unordered-list": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-list-item": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-spinner": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
    "s-divider": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { [key: string]: any }, HTMLElement>;
  }
}
