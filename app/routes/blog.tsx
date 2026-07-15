import { Outlet } from "react-router";

import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingFooter } from "../components/landing/LandingFooter";
import chromeCss from "../styles/site-chrome.css?raw";
import blogCss from "../styles/blog.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const pageCss = `${chromeCss}\n${blogCss}`;

export default function BlogLayout() {
  return (
    <div className="sa-blogPage">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      <LandingHeader appName={APP_NAME} appStoreUrl={APP_STORE_URL} />
      <main>
        <Outlet />
      </main>
      <LandingFooter appName={APP_NAME} year={new Date().getFullYear()} />
    </div>
  );
}
