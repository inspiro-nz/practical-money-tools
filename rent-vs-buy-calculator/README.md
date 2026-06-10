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
- `app.jsx` — React component, state sync, and projection data preparation
- `nzRentVsBuyEngine.ts` — separate TypeScript engine file for core math
- `app.bundle.js` — precompiled, minified bundle of `app.jsx` so `index.html` works over `file://` without an in-browser Babel step

## Updating the bundle

`app.bundle.js` is generated from `app.jsx`. After changing `app.jsx`, regenerate the bundle with:

```sh
npx esbuild@0.28.0 app.jsx --bundle --minify --format=iife --target=es2018 --outfile=app.bundle.js
```

CI (`.github/workflows/verify-rent-vs-buy-bundle.yml`) rebuilds `app.bundle.js` from `app.jsx` and fails if the committed bundle is out of date.
