// ============================================================
// aave.js — Leitura da posição Aave v3
// ============================================================

import { ABI, AAVE, TOKENS, AAVE_DEBT_APYS } from "./config.js";
import { getProvider } from "./provider.js";

/**
 * Lê a posição completa de um usuário no Aave v3.
 * @returns {Object} dados do colateral, dívida, HF, LTV e dívidas por token
 */
export async function fetchAavePosition(walletAddress) {
  const provider = await getProvider();
  const pool = new ethers.Contract(AAVE.POOL,          ABI.AAVE_POOL, provider);
  const data = new ethers.Contract(AAVE.DATA_PROVIDER, ABI.AAVE_DATA, provider);

  // Dados gerais da conta
  const acct = await pool.getUserAccountData(walletAddress);
  const totalCollateralUSD = Number(acct.totalCollateralBase)  / 1e8;
  const totalDebtUSD       = Number(acct.totalDebtBase)        / 1e8;
  const healthFactor       = Number(acct.healthFactor)         / 1e18;
  const ltv                = totalCollateralUSD > 0
    ? (totalDebtUSD / totalCollateralUSD) * 100
    : 0;
  const availableBorrowUSD = Number(acct.availableBorrowsBase) / 1e8;

  console.log(
    `✓ Aave: Col=$${totalCollateralUSD.toFixed(2)}, ` +
    `Debt=$${totalDebtUSD.toFixed(2)}, HF=${healthFactor.toFixed(3)}, LTV=${ltv.toFixed(1)}%`
  );

  // Dívidas por token — decimais corretos por token
  const DEBT_TOKENS = [
    { sym: "USDT", address: TOKENS.USDT.address, dec: 6  },
    { sym: "USDe", address: TOKENS.USDe.address, dec: 18 },
    { sym: "USDC", address: TOKENS.USDC.address, dec: 6  },
    { sym: "mUSD", address: TOKENS.mUSD.address, dec: 18 },
    { sym: "WBTC", address: TOKENS.WBTC.address, dec: 8  },
  ];

  const debtsByToken = {};
  for (const token of DEBT_TOKENS) {
    try {
      const r = await data.getUserReserveData(token.address, walletAddress);
      // currentVariableDebt + currentStableDebt
      const raw = r.currentVariableDebt + r.currentStableDebt;
      const amount = Number(ethers.formatUnits(raw, token.dec));
      debtsByToken[token.sym] = amount;
      if (amount > 0.0001) {
        console.log(`  Dívida ${token.sym}: ${amount.toFixed(token.dec <= 6 ? 2 : 6)}`);
      }
    } catch (e) {
      debtsByToken[token.sym] = 0;
      console.warn(`  Não foi possível ler dívida ${token.sym}:`, e.message);
    }
  }

  return {
    totalCollateralUSD,
    totalDebtUSD,
    healthFactor,
    ltv,
    availableBorrowUSD,
    debtsByToken,  // { USDT: 4000.77, USDe: 2.99, USDC: 0, mUSD: 0.03, WBTC: 0 }
  };
}

/**
 * Calcula o custo diário total dos juros da dívida.
 * @param {Object} debtsByToken  - saída de fetchAavePosition
 * @param {number} btcPrice      - preço atual do BTC em USD
 * @returns {number} custo em USD por dia
 */
export function calcDailyDebtCost(debtsByToken, btcPrice) {
  let costPerDay = 0;

  for (const [sym, amount] of Object.entries(debtsByToken)) {
    if (amount <= 0) continue;
    const apy = AAVE_DEBT_APYS[sym] ?? 5;
    const usdValue = sym === "WBTC" ? amount * btcPrice : amount;
    costPerDay += usdValue * (apy / 100 / 365);
  }

  return costPerDay;
}

/**
 * Gera sugestões de pagamento para hoje.
 * Três cenários: mínimo, médio (HF saudável), agressivo (quitar com ganhos)
 */
export function calcPaymentSuggestions({ totalCollateralUSD, totalDebtUSD, healthFactor, ltv }, feesAccumulated, costPerDay, btcPrice) {
  // 1. Mínimo: apenas cobre os juros de hoje
  const minimum = costPerDay;

  // 2. Médio: paga o suficiente para LTV 35% (HF >2.0)
  const targetDebtFor35 = totalCollateralUSD * 0.35;
  const medium = Math.max(0, totalDebtUSD - targetDebtFor35);

  // 3. Agressivo: usa fees acumuladas para quitar dívida
  const aggressive = Math.min(totalDebtUSD, feesAccumulated);

  return {
    minimum: {
      value: minimum,
      description: `Paga apenas os juros de hoje (${(costPerDay).toFixed(4)} USD/dia). A dívida principal permanece igual. HF: ${healthFactor.toFixed(2)} (sem alteração).`,
    },
    medium: {
      value: medium,
      description: `Pagar $${medium.toFixed(2)} reduz LTV de ${ltv.toFixed(1)}% para 35%, atingindo HF > 2.0. Posição mais confortável e segura.`,
      newLTV: 35,
      newHF: totalCollateralUSD * 0.78 / targetDebtFor35, // estimativa
    },
    aggressive: {
      value: aggressive,
      description: aggressive >= totalDebtUSD
        ? `Usar as fees acumuladas ($${feesAccumulated.toFixed(2)}) para QUITAR toda a dívida!`
        : `Usar as fees acumuladas ($${feesAccumulated.toFixed(2)}) para reduzir a dívida de $${totalDebtUSD.toFixed(2)} para $${(totalDebtUSD - aggressive).toFixed(2)}.`,
    },
  };
}

/**
 * Gera texto de diagnóstico do LTV com ação recomendada.
 */
export function getLTVStatus(ltv, totalCollateralUSD, totalDebtUSD) {
  if (ltv < 30) {
    const canBorrow = totalCollateralUSD * 0.30 - totalDebtUSD;
    return {
      zone: "SUBAPROVEITADO",
      color: "#3b9eff",
      action: `LTV ${ltv.toFixed(1)}% — Capital subutilizado. Pode emprestar mais $${canBorrow.toFixed(0)} (LTV 30%).`,
    };
  }
  if (ltv <= 40) {
    return {
      zone: "✅ ZONA IDEAL",
      color: "#00e87a",
      action: `LTV ${ltv.toFixed(1)}% — Posição saudável. Nenhuma ação necessária.`,
    };
  }
  if (ltv <= 50) {
    const toPay = totalDebtUSD - totalCollateralUSD * 0.40;
    return {
      zone: "⚠️ ATENÇÃO",
      color: "#f5c518",
      action: `LTV ${ltv.toFixed(1)}% — Pagar $${toPay.toFixed(0)} para retornar a 40%.`,
    };
  }
  const toPay = totalDebtUSD - totalCollateralUSD * 0.40;
  return {
    zone: "🔴 RISCO",
    color: "#ff4444",
    action: `LTV ${ltv.toFixed(1)}% — RISCO! Pagar $${toPay.toFixed(0)} imediatamente.`,
  };
}
