# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Serve at http://localhost:3000 (npx serve . -l 3000)
npm test             # Run Uniswap v3 math unit tests
npm run test:all     # Run all tests (uniswap + analysis)
npm run lint         # Syntax-check all JS modules (node --check)
```

No build step — ES modules run directly in the browser. All dependencies (Ethers.js v6, Lightweight Charts) are CDN-loaded in `index.html`.

## Architecture

The dashboard is a **single-page vanilla JS app** with no bundler. `index.html` (~2600 lines) contains all HTML, CSS, and event-handler wiring. Business logic lives in `js/`:

| File | Responsibility |
|---|---|
| `js/config.js` | ABIs, RPC URLs, token addresses, contract addresses, wallet constants |
| `js/provider.js` | Ethers.js provider with 4-endpoint fallback (publicnode → ankr → cloudflare → llamarpc) |
| `js/prices.js` | Price feeds: Chainlink (primary) → Binance → CoinGecko (fallbacks) |
| `js/uniswap.js` | Uniswap v3 position math: `sqrtX96toNorm`, `calcAmounts`, `calcFees` using BigInt arithmetic |
| `js/aave.js` | Aave v3 reader: collateral, debt, HF, per-token APY, debt cost projections |
| `js/analysis.js` | Technical indicators: EMA, RSI, MACD, Bollinger Bands; signal scoring for trade tab |

### Data flow

1. On page load, `index.html` imports all `js/` modules and calls their fetch functions.
2. Results are cached in `localStorage` with per-tier TTLs to limit RPC calls.
3. Three auto-refresh tiers run in parallel:
   - **HIGH (15s)**: prices + gas
   - **MID (30s)**: Uniswap positions + wallet balances
   - **LOW (60s)**: Aave position + technical analysis

### Uniswap v3 math

All Uniswap position calculations use **BigInt** throughout to avoid precision loss with `sqrtPriceX96`. `sqrtX96toNorm()` converts the raw slot0 value; `calcAmounts()` uses the standard concentrated-liquidity formulas. Tests in `test/test-uniswap.js` validate against known-good values — run them when touching `js/uniswap.js`.

### Monitored context

- **Wallet**: `0x4D881568f24fFC38496A1832a53f23f0E63cBcd1`
- **Uniswap v3 LP NFTs**: #1291052, #1273700 (WBTC/USDT pool)
- **Aave collateral**: WBTC; **Aave debts**: USDT, USDe, USDC, mUSD

## UI structure

Tabs: **Overview · Pool · Aave · Wallet · Trade · Escola**

Themes (dark/light/google) and auto-refresh intervals are persisted in `localStorage`. The Health Factor gauge and "next action" card on the Overview tab are the primary decision-support surfaces.

## Language

UI text and comments are in **Portuguese (pt-BR)**. Keep this consistent when modifying the interface or adding new messages.
