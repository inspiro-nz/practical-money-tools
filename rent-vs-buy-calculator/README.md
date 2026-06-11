# NZ Rent vs Buy Calculator

This browser-only calculator is part of the Practical Money Tools web app. It runs entirely in the browser with no backend or login required.

## Feature overview

- React-based form layer with simple/advanced progressive disclosure
- LocalStorage persistence under key `pmt_rent_vs_buy_data`
- Advanced mortgage tranche inputs with fixed and floating rates
- PIE tax configuration and savings discipline slider
- Prepared chart series for Net Wealth Horizon and break-even crossover detection

## Files

- `index.html` — app shell and React entry point
- `styles.css` — calculator styles
- `app.jsx` — React component, state sync, and UI
- `nzRentVsBuyEngine.ts` — single source of truth for projection math, validation, and sanitization, imported by `app.jsx`
- `app.bundle.js` — precompiled, minified bundle of `app.jsx` (and `nzRentVsBuyEngine.ts`) so `index.html` works over `file://` without an in-browser Babel/TypeScript step
- `vendor/` — local copies of the React/ReactDOM production builds (kept independent of `self-loan-tracker`)

## Updating the bundle

`app.bundle.js` is generated from `app.jsx` (which imports `nzRentVsBuyEngine.ts`) using the pinned `esbuild` dependency in `package.json`. After changing `app.jsx` or `nzRentVsBuyEngine.ts`, regenerate the bundle with:

```sh
npm ci
npm run build
```

CI (`.github/workflows/verify-rent-vs-buy-bundle.yml`) installs the pinned dependencies via `npm ci`, rebuilds `app.bundle.js` from `app.jsx` with the local `esbuild` binary, and fails if the committed bundle is out of date.
