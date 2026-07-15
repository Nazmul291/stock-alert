export function LandingFooter({ appName, year }: { appName: string; year: number }) {
  return (
    <footer className="sa-footer">
      <span>© {year} {appName}</span>
      <a href="/blog">Blog</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="mailto:nazmul291@gmail.com">Support</a>
    </footer>
  );
}
