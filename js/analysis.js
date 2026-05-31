// ============================================================
// analysis.js — Análise técnica: EMA, RSI, MACD, Bollinger
// ============================================================

/**
 * Calcula EMA (Exponential Moving Average)
 * @param {number[]} prices
 * @param {number} period
 * @returns {number[]}
 */
export function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * Calcula RSI (Relative Strength Index) com período de 14 dias
 * @param {number[]} prices
 * @param {number} period
 * @returns {number} RSI entre 0 e 100
 */
export function calcRSI(prices, period = 14) {
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains   = changes.map(c => Math.max(0, c));
  const losses  = changes.map(c => Math.max(0, -c));

  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * Calcula MACD
 * @param {number[]} prices
 * @returns {{ macd: number, signal: number, histogram: number, bullish: boolean }}
 */
export function calcMACD(prices) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] || v));
  const signal   = calcEMA(macdLine, 9);
  const macd     = macdLine[macdLine.length - 1];
  const sig      = signal[signal.length - 1];
  return {
    macd,
    signal: sig,
    histogram: macd - sig,
    bullish: macd > sig,
  };
}

/**
 * Calcula Bandas de Bollinger (período 20, 2 desvios)
 * @param {number[]} prices
 * @returns {{ upper, middle, lower, percentB }}
 */
export function calcBollinger(prices, period = 20, stdDev = 2) {
  const slice  = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const std    = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period);
  const upper  = middle + stdDev * std;
  const lower  = middle - stdDev * std;
  const current = prices[prices.length - 1];
  const percentB = (current - lower) / (upper - lower) * 100; // 0-100%

  return { upper, middle, lower, percentB };
}

/**
 * Processa todos os indicadores e gera sinal de trade.
 * @param {number[]} prices  - histórico de preços diários
 * @param {number} currentBTC - preço atual do BTC (Chainlink, mais preciso)
 * @returns {Object} análise completa
 */
export function analyzeMarket(prices, currentBTC) {
  // Substitui último preço pelo preço real do Chainlink
  const pts = [...prices];
  if (currentBTC > 0) pts[pts.length - 1] = currentBTC;

  const ema9  = calcEMA(pts, 9);
  const ema21 = calcEMA(pts, 21);
  const e9v   = ema9[ema9.length - 1];
  const e21v  = ema21[ema21.length - 1];
  const macd  = calcMACD(pts);
  const rsi   = calcRSI(pts);
  const bb    = calcBollinger(pts);
  const P     = pts[pts.length - 1];

  // Tendência
  const trend = e9v > e21v && P > e9v ? "ALTA"
              : e9v < e21v && P < e9v ? "BAIXA"
              : "LATERAL";

  // Score de sinal (0-4 indicadores positivos)
  let score = 0;
  if (macd.bullish)          score++;  // MACD bullish
  if (e9v > e21v)            score++;  // EMA crossover positivo
  if (rsi > 40 && rsi < 65) score++;  // RSI neutro-positivo
  if (P > bb.middle)         score++;  // Preço acima da BB média

  const signal = score >= 3 ? "COMPRAR" : score <= 1 ? "VENDER" : "AGUARDAR";

  // Níveis de trade
  const entry = {
    ideal:        Math.round(e9v),             // entrada na EMA9
    aggressive:   Math.round(bb.middle),       // entrada na BB média
    conservative: Math.round(bb.lower),        // entrada na BB inferior (pullback)
  };
  const takeProfit = {
    tp1: Math.round(P * 1.03),  // +3%
    tp2: Math.round(P * 1.06),  // +6%
    tp3: Math.round(bb.upper),  // BB superior
  };
  const stopLoss = {
    conservative: Math.round(P * 0.97),  // -3%
    technical:    Math.round(e21v),      // abaixo da EMA21 invalida setup
  };

  // Risk/Reward (entrada ideal → TP2 / entrada ideal → SL conservador)
  const rr = entry.ideal > stopLoss.conservative
    ? ((takeProfit.tp2 - entry.ideal) / (entry.ideal - stopLoss.conservative)).toFixed(1)
    : "—";

  return {
    price: P,
    trend,
    score,
    signal,
    rsi,
    ema9: e9v, ema21: e21v,
    macd,
    bb,
    entry, takeProfit, stopLoss, rr,
    ema9arr: ema9, ema21arr: ema21,
  };
}
