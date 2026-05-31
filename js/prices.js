// ============================================================
// prices.js — Preços via Chainlink on-chain + fallback CoinGecko
// ============================================================

import { ABI, CHAINLINK, TOKENS } from "./config.js";
import { getProvider } from "./provider.js";

// Cache em memória — evita chamadas repetidas no mesmo segundo
const _cache = { btc: 0, eth: 0, ts: 0 };

/**
 * Busca BTC/USD e ETH/USD do Chainlink.
 * Cache de 15 segundos para não sobrecarregar o RPC.
 */
export async function fetchPrices() {
  const now = Date.now();
  if (now - _cache.ts < 15_000 && _cache.btc > 0) {
    return { btc: _cache.btc, eth: _cache.eth, fromCache: true };
  }

  const provider = await getProvider();

  try {
    const btcFeed = new ethers.Contract(CHAINLINK.BTC_USD, ABI.CHAINLINK, provider);
    const ethFeed = new ethers.Contract(CHAINLINK.ETH_USD, ABI.CHAINLINK, provider);

    const [btcData, ethData] = await Promise.all([
      btcFeed.latestRoundData(),
      ethFeed.latestRoundData(),
    ]);

    _cache.btc = Number(btcData.answer) / 1e8;
    _cache.eth = Number(ethData.answer) / 1e8;
    _cache.ts  = now;

    console.log(`✓ Preços Chainlink: BTC=$${_cache.btc.toLocaleString()} ETH=$${_cache.eth.toFixed(2)}`);
    return { btc: _cache.btc, eth: _cache.eth, fromCache: false };

  } catch (e) {
    console.warn("Chainlink falhou:", e.message);
  }

  // Fallback 1: Binance REST (CORS permitido)
  try {
    const [bBtc, bEth] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'),
    ]);
    const [jBtc, jEth] = await Promise.all([bBtc.json(), bEth.json()]);
    _cache.btc = parseFloat(jBtc.price);
    _cache.eth = parseFloat(jEth.price);
    _cache.ts  = now;
    console.log(`✓ Preços Binance: BTC=$${_cache.btc.toLocaleString()} ETH=$${_cache.eth.toFixed(2)}`);
    return { btc: _cache.btc, eth: _cache.eth, fromCache: false, fromFallback: 'binance' };
  } catch (e) {
    console.warn("Binance falhou:", e.message);
  }

  // Fallback 2: CoinGecko
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd");
    const d = await r.json();
    _cache.btc = d.bitcoin?.usd ?? (_cache.btc || 75000);
    _cache.eth = d.ethereum?.usd ?? (_cache.eth || 2300);
    _cache.ts  = now;
    console.log(`✓ Preços CoinGecko: BTC=$${_cache.btc.toLocaleString()}`);
    return { btc: _cache.btc, eth: _cache.eth, fromCache: false, fromFallback: 'coingecko' };
  } catch (e) {
    console.warn("CoinGecko falhou:", e.message);
  }

  // Cache antigo como último recurso
  if (_cache.btc > 0) {
    console.warn("Todos os feeds falharam — usando cache antigo");
    return { btc: _cache.btc, eth: _cache.eth, fromCache: true, stale: true };
  }
  throw new Error("Nenhum feed de preço disponível");
}

/**
 * Retorna o preço USD de um token pelo endereço.
 * Usa cache interno de preços já buscados.
 */
export function getTokenPriceUSD(tokenAddress, prices) {
  const addr = tokenAddress.toLowerCase();
  const { btc, eth } = prices;

  const known = {
    [TOKENS.WBTC.address.toLowerCase()]: btc,
    [TOKENS.WETH.address.toLowerCase()]: eth,
    [TOKENS.USDT.address.toLowerCase()]: 1,
    [TOKENS.USDC.address.toLowerCase()]: 1,
    [TOKENS.USDe.address.toLowerCase()]: 1,
    [TOKENS.mUSD.address.toLowerCase()]: 1,
    [TOKENS.DAI.address.toLowerCase()]:  1,
  };

  return known[addr] ?? 0;
}

/**
 * Busca histórico de preços do BTC para análise técnica (CoinGecko).
 * Retorna array de { price, date }
 */
export async function fetchBTCHistory(days = 30) {
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const r = await fetch(url);
  const d = await r.json();

  return d.prices.map(([ts, price]) => ({
    price,
    date: new Date(ts),
    label: `${new Date(ts).getDate()}/${new Date(ts).getMonth() + 1}`,
  }));
}

/**
 * Busca OHLC diário de BTC dos últimos N dias via CoinGecko.
 * Retorna [{time: 'YYYY-MM-DD', open, high, low, close}] ordenado por data.
 */
export async function fetchBTCOHLC(days = 30) {
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko OHLC ${r.status}`);
  const data = await r.json();
  // CoinGecko retorna [[ts_ms, open, high, low, close], ...] em intervalos de 4h
  // Agrega para candles diários
  const daily = {};
  for (const [ts, o, h, l, c] of data) {
    const d   = new Date(ts);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    if (!daily[key]) {
      daily[key] = { time: key, open: o, high: h, low: l, close: c };
    } else {
      daily[key].high  = Math.max(daily[key].high, h);
      daily[key].low   = Math.min(daily[key].low,  l);
      daily[key].close = c;
    }
  }
  return Object.values(daily).sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Busca OHLC de BTC para diferentes períodos via CoinGecko.
 * period: '30d' → candles diários | '7d'|'3d'|'1d' → timestamps Unix em segundos
 */
export async function fetchBTCOHLCPeriod(period = '30d') {
  const days = { '30d': 30, '7d': 7, '3d': 3, '1d': 1 }[period] ?? 30;
  const url  = `https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`;
  const r    = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko OHLC ${r.status}`);
  const data = await r.json();

  if (period === '30d') {
    // Agrega candles de 4h em diários (LightweightCharts aceita 'YYYY-MM-DD')
    const daily = {};
    for (const [ts, o, h, l, c] of data) {
      const d   = new Date(ts);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      if (!daily[key]) {
        daily[key] = { time: key, open: o, high: h, low: l, close: c };
      } else {
        daily[key].high  = Math.max(daily[key].high, h);
        daily[key].low   = Math.min(daily[key].low,  l);
        daily[key].close = c;
      }
    }
    return Object.values(daily).sort((a, b) => a.time.localeCompare(b.time));
  }

  // Intraday: retorna timestamps em segundos (LightweightCharts usa seconds, CoinGecko dá ms)
  return data
    .map(([ts, o, h, l, c]) => ({ time: Math.floor(ts / 1000), open: o, high: h, low: l, close: c }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Lê saldos de tokens ERC20 + ETH nativo na carteira.
 * Retorna apenas tokens com saldo > 0.
 */
export async function fetchWalletBalances(walletAddress, prices) {
  const provider = await getProvider();
  const { btc, eth } = prices;

  const TOKENS_TO_CHECK = [
    { sym: 'WBTC', address: TOKENS.WBTC.address, dec: 8,  priceUSD: btc },
    { sym: 'WETH', address: TOKENS.WETH.address, dec: 18, priceUSD: eth },
    { sym: 'USDT', address: TOKENS.USDT.address, dec: 6,  priceUSD: 1   },
    { sym: 'USDe', address: TOKENS.USDe.address, dec: 18, priceUSD: 1   },
    { sym: 'mUSD', address: TOKENS.mUSD.address, dec: 18, priceUSD: 1   },
    { sym: 'USDC', address: TOKENS.USDC.address, dec: 6,  priceUSD: 1   },
    { sym: 'DAI',  address: TOKENS.DAI.address,  dec: 18, priceUSD: 1   },
  ];

  const balances = {};
  let totalUSD = 0;

  // ETH nativo
  try {
    const raw = await provider.getBalance(walletAddress);
    const amount = Number(ethers.formatEther(raw));
    const usd = amount * eth;
    if (amount > 0.0001) { balances['ETH'] = { amount, usd }; totalUSD += usd; }
  } catch {}

  // ERC20
  await Promise.all(TOKENS_TO_CHECK.map(async t => {
    try {
      const c = new ethers.Contract(t.address, ABI.ERC20, provider);
      const raw = await c.balanceOf(walletAddress);
      const amount = Number(ethers.formatUnits(raw, t.dec));
      const usd = amount * t.priceUSD;
      if (amount > 0.0001) { balances[t.sym] = { amount, usd }; totalUSD += usd; }
    } catch {}
  }));

  console.log(`✓ Wallet tokens: $${totalUSD.toFixed(2)} (${Object.keys(balances).join(', ') || 'vazia'})`);
  return { balances, totalUSD };
}
