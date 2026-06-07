# Practical Money Tools

**Simple Tools for Smarter Money Decisions**

Free, browser-based personal finance calculators designed to help people make better long-term financial decisions. No accounts. No sign-up. All calculations run locally — your data never leaves your device.

🔗 **Live site:** https://inspiro-nz.github.io/practical-money-tools/

---

## Why This Exists

Most personal finance apps want your data, your email, and a monthly subscription. These tools don't. They run entirely in the browser using localStorage — open the page, use the tool, close it. Nothing is stored anywhere except your own device.

---

## Available Tools

### [Self-Loan Tracker](https://inspiro-nz.github.io/practical-money-tools/self-loan-tracker/)

**The problem:** You invest in an index fund and at some point need to access the money. Selling feels wrong — not just emotionally, but mathematically. Every dollar you pull out isn't just that dollar; it's everything that dollar would have become.

**The concept:** What if you treated the withdrawal as a loan to yourself? Calculate a monthly repayment at the expected market return rate, follow it, and end up in exactly the same position you'd have been in if you'd never withdrawn. The opportunity cost cancels out.

**What the tool does:**
- Calculates the break-even monthly repayment for your withdrawal
- Pulls live index prices via the free Alpha Vantage API (manual entry fallback)
- Charts two lines over time: what the withdrawn amount would be worth if left invested vs. cumulative repayments
- Stores all data in `localStorage` — nothing leaves your device
- Installable as a PWA on mobile

**Tech:** Vanilla JS, React (UMD), HTML/CSS, localStorage, Alpha Vantage free API. No framework build step. No backend.

### [Car Upgrade Cost Calculator](https://inspiro-nz.github.io/practical-money-tools/car-upgrade-calculator/)

**The problem:** Upgrading to a newer or pricier car always feels like it costs "the difference" between the two prices. In reality the true cost includes depreciation, running costs, financing, and the growth you give up on that money if it stayed invested instead.

**The concept:** Enter your current car's value, the target car's price, and how you'd pay for it. The tool models depreciation on both vehicles using a New Zealand-typical curve, layers in running cost differences (insurance, fuel, WOF and registration), financing costs if you borrow, and what the money could have grown to if invested instead — then shows the true all-in cost and a break-even point.

**What the tool does:**
- Models depreciation on both vehicles using an NZ-typical curve
- Compares running costs: insurance, fuel, WOF and registration
- Supports cash or finance purchases, with full loan amortisation
- Accounts for private sale vs. trade-in when valuing your current car
- Calculates the foregone investment growth (opportunity cost) of spending rather than investing
- Charts the true cost over time and a break-even year
- Stores all data in `localStorage` — nothing leaves your device

**Tech:** Vanilla JS, Chart.js, HTML/CSS, localStorage. No framework build step. No backend.

---

## Planned Tools

| Tool | Description |
|------|-------------|
| Rent vs Buy Calculator (NZ) | Model the real financial difference between renting and buying — split mortgage tranches, rates, insurance, maintenance, and what your deposit earns if invested instead |
| KiwiSaver Optimiser | Find your optimal KiwiSaver contribution rate and the point where directing extra money into your own investment account beats locking it in until 65 |

---

## Design Principles

**Simplicity** — Tools should be easy to understand and quick to use.

**Privacy** — Calculations are performed locally in the browser. No server. No database. No accounts.

**Accessibility** — Works across desktop and mobile devices. Installable as a PWA.

**Transparency** — Calculations are understandable and do not rely on hidden assumptions.

---

## Running Locally

```bash
git clone https://github.com/inspiro-nz/practical-money-tools.git
cd practical-money-tools
# Open index.html in your browser — no build step required
```

---

## Disclaimer

The information and calculators provided on this website are for educational and informational purposes only. Nothing contained within this project should be considered financial, legal, tax, or investment advice. Always seek professional advice before making financial decisions.

---

## Contact

inspiroanalytics@gmail.com

---

## License

MIT License
