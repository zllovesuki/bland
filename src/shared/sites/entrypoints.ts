export const SITES_STYLES_SOURCE = "src/styles/sites.css";
export const SITES_FONTS_SOURCE = "src/styles/fonts.css";

export const sitesEntrypoints = {
  sites: "src/client/sites/entrypoints/browser.ts",
  sitesStyles: SITES_STYLES_SOURCE,
  sitesFonts: SITES_FONTS_SOURCE,
} as const;

export const SITES_BROWSER_ENTRY = sitesEntrypoints.sites;
export const SITES_STYLES_ENTRY = sitesEntrypoints.sitesStyles;
export const SITES_FONTS_ENTRY = sitesEntrypoints.sitesFonts;
