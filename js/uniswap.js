// ============================================================
// uniswap.js — Leitura e cálculos Uniswap v3
//
// FÓRMULAS VERIFICADAS com test/test-uniswap.js
// Referência: https://docs.uniswap.org/concepts/protocol/concentrated-liquidity
// ============================================================

import { ABI, UNISWAP, Q128 } from "./config.js";
import { getProvider } from "./provider.js";
import { getTokenPriceUSD } from "./prices.js";

// Cache de metadados de token (símbolo + decimais)
const _metaCache = {};

// ── Tokens conhecidos (evita chamadas RPC desnecessárias) ─────
const KNOWN_META = {
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { sym: "WBTC", dec: 8  },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { sym: "USDT", dec: 6  },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { sym: "USDC", dec: 6  },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { sym: "WETH", dec: 18 },
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": { sym: "USDe", dec: 18 },
  "0xaca92e438df0b2401ff60da7e4337b687a2435da": { sym: "mUSD", dec: 18 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { sym: "DAI",  dec: 18 },
};

async function getTokenMeta(address, provider) {
  const key = address.toLowerCase();
  if (KNOWN_META[key]) return KNOWN_META[key];
  if (_metaCache[key]) return _metaCache[key];
  try {
    const c = new ethers.Contract(address, ABI.ERC20, provider);
    const [sym, dec] = await Promise.all([c.symbol(), c.decimals()]);
    _metaCache[key] = { sym, dec: Number(dec) };
    return _metaCache[key];
  } catch (e) {
    return { sym: address.slice(0, 6) + "…", dec: 18 };
  }
}

// ── Matemática do Uniswap v3 ──────────────────────────────────

/**
 * Converte sqrtPriceX96 (BigInt do contrato) para float normalizado.
 * sqrtNorm = sqrtPriceX96 / 2^96
 *
 * IMPORTANTE: não usa Number(sqrtPriceX96) diretamente pois perde precisão.
 * Usa divisão BigInt com 18 casas decimais de precisão.
 */
export function sqrtX96toNorm(sqrtPriceX96) {
  const SCALE = 10n ** 18n;
  const Q96   = 2n ** 96n;
  const num   = BigInt(sqrtPriceX96.toString());
  const scaled = num * SCALE / Q96;
  return Number(scaled) / 1e18;
}

/**
 * Converte tick para sqrtPrice normalizado.
 * sqrtNorm = sqrt(1.0001^tick)
 */
export function tickToSqrtNorm(tick) {
  return Math.sqrt(Math.pow(1.0001, tick));
}

/**
 * Calcula amounts de token0 e token1 de uma posição Uniswap v3.
 *
 * Fórmula do whitepaper (sem Q96 explícito — evita overflow):
 *   amount0 = L × (sqrtUpper - sqrtCurrent) / (sqrtUpper × sqrtCurrent)
 *   amount1 = L × (sqrtCurrent - sqrtLower)
 *
 * Onde sqrtPrice está em formato normalizado (= sqrtPriceX96 / 2^96).
 *
 * @param {BigInt} liquidity   - Liquidez da posição (BigInt do contrato)
 * @param {number} sqrtCur     - sqrtPrice atual normalizado
 * @param {number} sqrtLow     - sqrtPrice do tick lower normalizado
 * @param {number} sqrtUp      - sqrtPrice do tick upper normalizado
 * @param {number} dec0        - Decimais do token0
 * @param {number} dec1        - Decimais do token1
 * @returns {{ amount0: number, amount1: number }} em unidades reais do token
 */
export function calcAmounts(liquidity, sqrtCur, sqrtLow, sqrtUp, dec0, dec1) {
  // Converte liquidity BigInt → number
  // Seguro até 2^53 ≈ 9×10^15 (liquidity típica de pool pequena < 10^14)
  const L = Number(liquidity);

  // Clipa sqrtCur ao range para posição fora do range
  const sp = Math.min(Math.max(sqrtCur, sqrtLow), sqrtUp);

  // amount0 (em raw units do token0)
  const amt0_raw = (sp < sqrtUp && sp > 0)
    ? L * (sqrtUp - sp) / (sqrtUp * sp)
    : 0;

  // amount1 (em raw units do token1)
  const amt1_raw = (sp > sqrtLow)
    ? L * (sp - sqrtLow)
    : 0;

  return {
    amount0: Math.max(0, amt0_raw / Math.pow(10, dec0)),
    amount1: Math.max(0, amt1_raw / Math.pow(10, dec1)),
  };
}

/**
 * Calcula fees reais acumuladas via feeGrowthInside.
 *
 * O tokensOwed do NFT só contém fees já "tombadas" (coletáveis).
 * A maior parte está no pool e precisa ser calculada com:
 *   fees = (fgInside - fgInsideLast) × liquidity / 2^128 + tokensOwed
 */
export async function calcFees(poolContract, position, dec0, dec1) {
  try {
    const [fg0, fg1, tickLowerData, tickUpperData, slot0] = await Promise.all([
      poolContract.feeGrowthGlobal0X128(),
      poolContract.feeGrowthGlobal1X128(),
      poolContract.ticks(position.tickLower),
      poolContract.ticks(position.tickUpper),
      poolContract.slot0(),
    ]);

    const curTick = Number(slot0.sqrtPriceX96 ? slot0[1] : slot0.tick ?? slot0[1]);
    const tL = Number(position.tickLower);
    const tU = Number(position.tickUpper);

    // Wrapping para números negativos (operação módulo 2^256)
    const wrap = (v) => ((v % (2n ** 256n)) + 2n ** 256n) % (2n ** 256n);

    // feeGrowthInside para token0
    const fo0L = tickLowerData.feeGrowthOutside0X128 ?? tickLowerData[2];
    const fo0U = tickUpperData.feeGrowthOutside0X128 ?? tickUpperData[2];
    const fg0b = curTick >= tL ? fo0L : wrap(fg0 - fo0L);
    const fg0a = curTick <  tU ? fo0U : wrap(fg0 - fo0U);
    const fgI0 = wrap(fg0 - fg0b - fg0a);

    // feeGrowthInside para token1
    const fo1L = tickLowerData.feeGrowthOutside1X128 ?? tickLowerData[3];
    const fo1U = tickUpperData.feeGrowthOutside1X128 ?? tickUpperData[3];
    const fg1b = curTick >= tL ? fo1L : wrap(fg1 - fo1L);
    const fg1a = curTick <  tU ? fo1U : wrap(fg1 - fo1U);
    const fgI1 = wrap(fg1 - fg1b - fg1a);

    const liq = BigInt(position.liquidity.toString());
    const fgLast0 = BigInt(position.feeGrowthInside0LastX128.toString());
    const fgLast1 = BigInt(position.feeGrowthInside1LastX128.toString());

    // fees não tombadas (earned desde último snapshot)
    const earned0 = Number(liq * wrap(fgI0 - fgLast0) / Q128) / Math.pow(10, dec0);
    const earned1 = Number(liq * wrap(fgI1 - fgLast1) / Q128) / Math.pow(10, dec1);

    // fees tombadas (já no NFT, prontas para collect)
    const owed0 = Number(position.tokensOwed0) / Math.pow(10, dec0);
    const owed1 = Number(position.tokensOwed1) / Math.pow(10, dec1);

    // Sanity check: earned > 1000x do valor da pool sugere cálculo incorreto
    const safeEarned0 = earned0 > 1e9 ? 0 : Math.max(0, earned0);
    const safeEarned1 = earned1 > 1e9 ? 0 : Math.max(0, earned1);

    return {
      fee0: safeEarned0 + Math.max(0, owed0),
      fee1: safeEarned1 + Math.max(0, owed1),
      earned0: safeEarned0,
      earned1: safeEarned1,
      owed0:   Math.max(0, owed0),
      owed1:   Math.max(0, owed1),
    };
  } catch (e) {
    console.warn("calcFees fallback (tokensOwed only):", e.message);
    const owed0 = Number(position.tokensOwed0) / Math.pow(10, dec0);
    const owed1 = Number(position.tokensOwed1) / Math.pow(10, dec1);
    return { fee0: owed0, fee1: owed1, earned0: 0, earned1: 0, owed0, owed1 };
  }
}

/**
 * Busca e processa todas as posições Uniswap v3 de um endereço.
 * @returns {Array} posições processadas com capital, fees, range, etc.
 */
export async function fetchPositions(walletAddress, prices) {
  const provider = await getProvider();
  const nft     = new ethers.Contract(UNISWAP.NFT_POSITION_MANAGER, ABI.UNI_NFT,     provider);
  const factory = new ethers.Contract(UNISWAP.FACTORY,              ABI.UNI_FACTORY, provider);

  const balance = Number(await nft.balanceOf(walletAddress));
  if (balance === 0) return [];

  // Busca todos os tokenIds em paralelo
  const tokenIds = await Promise.all(
    Array.from({ length: balance }, (_, i) => nft.tokenOfOwnerByIndex(walletAddress, i))
  );

  // Busca dados de todas as posições
  const allPositions = await Promise.all(tokenIds.map(id => nft.positions(id)));

  // Filtra apenas posições ativas (liquidity > 0)
  const active = allPositions
    .map((pos, i) => ({ pos, id: Number(tokenIds[i]) }))
    .filter(({ pos }) => BigInt(pos.liquidity.toString()) > 0n);

  console.log(`Uniswap: ${active.length} posições ativas de ${balance} NFTs`);

  const results = [];

  for (const { pos, id } of active) {
    try {
      // Metadados dos tokens
      const [meta0, meta1] = await Promise.all([
        getTokenMeta(pos.token0, provider),
        getTokenMeta(pos.token1, provider),
      ]);
      const dec0 = meta0.dec, dec1 = meta1.dec;

      // Preço USD de cada token
      let price0 = getTokenPriceUSD(pos.token0, prices);
      let price1 = getTokenPriceUSD(pos.token1, prices);

      // Endereço do pool via factory
      const poolAddress = await factory.getPool(pos.token0, pos.token1, pos.fee);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        console.warn(`Pool não encontrada para #${id}`);
        continue;
      }

      const pool   = new ethers.Contract(poolAddress, ABI.UNI_POOL, provider);
      const slot0  = await pool.slot0();

      // sqrtPrice normalizado (sem Q96)
      const sqrtCur = sqrtX96toNorm(slot0[0]);  // slot0.sqrtPriceX96
      const sqrtLow = tickToSqrtNorm(Number(pos.tickLower));
      const sqrtUp  = tickToSqrtNorm(Number(pos.tickUpper));
      const curTick = Number(slot0[1]);          // slot0.tick
      const inRange = curTick >= Number(pos.tickLower) && curTick <= Number(pos.tickUpper);

      // Preço atual: token1_raw per token0_raw = sqrtCur^2 × 10^(dec0-dec1)
      const rawPrice = sqrtCur * sqrtCur * Math.pow(10, dec0 - dec1);

      // Se não temos preço de um dos tokens, cruza pelo pool
      if (price0 === 0 && price1 > 0 && rawPrice > 0) price0 = price1 / rawPrice;
      if (price1 === 0 && price0 > 0 && rawPrice > 0) price1 = price0 * rawPrice;

      // Amounts de capital
      const { amount0, amount1 } = calcAmounts(
        pos.liquidity, sqrtCur, sqrtLow, sqrtUp, dec0, dec1
      );
      const capitalUSD = Math.max(0, amount0 * price0 + amount1 * price1);

      // Fees acumuladas (reais, via feeGrowthInside)
      const { fee0, fee1, earned0, earned1, owed0, owed1 } = await calcFees(pool, pos, dec0, dec1);
      const feeUSD = Math.max(0, fee0 * price0 + fee1 * price1);

      // Range de preço em USD
      // ptLow/ptUp = preço de token0 em termos de token1 raw, ajustado por decimais
      const ptLow = Math.pow(1.0001, Number(pos.tickLower)) * Math.pow(10, dec0 - dec1);
      const ptUp  = Math.pow(1.0001, Number(pos.tickUpper)) * Math.pow(10, dec0 - dec1);

      // Converte para USD: multiplica pelo preço de token1
      let floorUSD  = Math.min(ptLow, ptUp)  * price1;
      let ceilUSD   = Math.max(ptLow, ptUp)  * price1;
      let currentUSD = rawPrice * price1;
      if (floorUSD > ceilUSD) [floorUSD, ceilUSD] = [ceilUSD, floorUSD];

      const feePct = Number(pos.fee) / 10000;

      results.push({
        id,
        token0: { address: pos.token0, sym: meta0.sym, dec: dec0, price: price0 },
        token1: { address: pos.token1, sym: meta1.sym, dec: dec1, price: price1 },
        feePct,
        tickLower:  Number(pos.tickLower),
        tickUpper:  Number(pos.tickUpper),
        currentTick: curTick,
        inRange,
        capitalUSD,
        amount0, amount1,
        feeUSD,
        fee0, fee1,
        earned0, earned1, owed0, owed1,
        floorUSD, ceilUSD, currentUSD,
        label: `${meta0.sym}/${meta1.sym} (${feePct}%)`,
        poolAddress,
      });

      console.log(
        `✓ #${id} ${meta0.sym}/${meta1.sym}: ` +
        `capital=$${capitalUSD.toFixed(2)}, fees=$${feeUSD.toFixed(4)}, ` +
        `${inRange ? "IN RANGE" : "OUT OF RANGE"}, ` +
        `floor=$${floorUSD.toFixed(0)}, ceil=$${ceilUSD.toFixed(0)}`
      );
    } catch (e) {
      console.error(`Erro posição #${id}:`, e.message);
    }
  }

  return results;
}
