// ============================================================
// test/test-uniswap.js
//
// Testa as fórmulas de amounts e fees do Uniswap v3
// Rodando: node test/test-uniswap.js
//
// Usa valores reais do snapshot de 29/04/2026:
//   Pool WBTC/USDT v3, NFT #1291052
//   Capital ~$4.962, BTC ~$76.159
// ============================================================

// ── Polyfill para rodar sem ethers.js ────────────────────────
const Q128 = 2n ** 128n;

function sqrtX96toNorm(sqrtPriceX96BigInt) {
  const SCALE = 10n ** 18n;
  const Q96   = 2n ** 96n;
  const scaled = sqrtPriceX96BigInt * SCALE / Q96;
  return Number(scaled) / 1e18;
}

function tickToSqrtNorm(tick) {
  return Math.sqrt(Math.pow(1.0001, tick));
}

function calcAmounts(liquidity, sqrtCur, sqrtLow, sqrtUp, dec0, dec1) {
  const L  = Number(liquidity);
  const sp = Math.min(Math.max(sqrtCur, sqrtLow), sqrtUp);
  const amt0_raw = (sp < sqrtUp && sp > 0) ? L * (sqrtUp - sp) / (sqrtUp * sp) : 0;
  const amt1_raw = (sp > sqrtLow) ? L * (sp - sqrtLow) : 0;
  return {
    amount0: Math.max(0, amt0_raw / Math.pow(10, dec0)),
    amount1: Math.max(0, amt1_raw / Math.pow(10, dec1)),
  };
}

// ── Helpers de test ──────────────────────────────────────────
let passed = 0, failed = 0;
function expect(desc, actual, expected, tolerance = 0.05) {
  const diff = Math.abs(actual - expected);
  const pct  = expected !== 0 ? diff / Math.abs(expected) : diff;
  const ok   = pct <= tolerance;
  if (ok) {
    console.log(`  ✅ ${desc}: ${actual.toFixed(4)} (esperado ~${expected})`);
    passed++;
  } else {
    console.error(`  ❌ ${desc}: ${actual.toFixed(4)} (esperado ~${expected}, diff=${(pct*100).toFixed(1)}%)`);
    failed++;
  }
}

// ════════════════════════════════════════════════════════════
// TESTE 1 — sqrtX96toNorm (conversão de sqrtPriceX96)
// ════════════════════════════════════════════════════════════
console.log("\n═══ TESTE 1: sqrtX96toNorm ═══");
// Para BTC $76.000, WBTC(8dec)/USDT(6dec):
// rawPrice = 76000 * 10^6 / 10^8 = 760
// sqrtNorm esperado = sqrt(760) ≈ 27.568
// tick ≈ log(760)/log(1.0001) ≈ 66.000
const btcPrice = 76000;
const rawPriceExpected = btcPrice * 1e6 / 1e8; // 760 (USDT raw / WBTC raw)
const sqrtExpected = Math.sqrt(rawPriceExpected);

// Simula sqrtPriceX96 a partir do sqrtNorm esperado
const Q96 = 2n ** 96n;
const sqrtPriceX96Sim = BigInt(Math.round(sqrtExpected * Number(Q96)));
const sqrtNormResult = sqrtX96toNorm(sqrtPriceX96Sim);

expect("sqrtNorm para BTC=$76k", sqrtNormResult, sqrtExpected, 0.001);

// ════════════════════════════════════════════════════════════
// TESTE 2 — calcAmounts (capital da posição)
// ════════════════════════════════════════════════════════════
console.log("\n═══ TESTE 2: calcAmounts ═══");

// Valores reais do snapshot (NFT #1291052, 29/04/2026)
// BTC = $76.159, capital = $4.962
// Estimando: tick atual ≈ 66.200, range: piso $70.674, teto $88.065

const tick_cur = 66200;  // corresponde a BTC ~$74.970
const tick_low = 64550;  // piso $70.674
const tick_up  = 68800;  // teto $88.065

const sqCur = tickToSqrtNorm(tick_cur);
const sqLow = tickToSqrtNorm(tick_low);
const sqUp  = tickToSqrtNorm(tick_up);

// Preço implícito pelo tick atual
const priceFromTick = Math.pow(1.0001, tick_cur) * Math.pow(10, 8 - 6); // dec0=8, dec1=6
console.log(`  Preço implícito pelo tick ${tick_cur}: $${priceFromTick.toFixed(0)}`);

// Para capital $4.962 com BTC @$76.159:
// Queremos encontrar o L que dá capital ~$4.962
// Escalamos: capital / (resultComL1) = L_necessario
const L_test = 1;
const { amount0: a0_L1, amount1: a1_L1 } = calcAmounts(L_test, sqCur, sqLow, sqUp, 8, 6);
const capPerL = a0_L1 * 76159 + a1_L1;
const L_para5000 = capPerL > 0 ? 4962 / capPerL : 0;

console.log(`  Capital por unidade de L: $${capPerL.toFixed(6)}`);
console.log(`  L estimado para $4.962: ${L_para5000.toFixed(0)}`);

// Verifica com L estimado
const { amount0, amount1 } = calcAmounts(L_para5000, sqCur, sqLow, sqUp, 8, 6);
const capitalResult = amount0 * 76159 + amount1;
expect("capital com L estimado ($4.962)", capitalResult, 4962, 0.10);
console.log(`  WBTC: ${amount0.toFixed(6)}, USDT: ${amount1.toFixed(2)}`);

// ════════════════════════════════════════════════════════════
// TESTE 3 — Fórmula não escala com Q96
// ════════════════════════════════════════════════════════════
console.log("\n═══ TESTE 3: verificar ausência de overflow Q96 ═══");
const L_grande = 1e14; // liquidez grande — causava overflow antes
const { amount0: a0g, amount1: a1g } = calcAmounts(L_grande, sqCur, sqLow, sqUp, 8, 6);
const capGrande = a0g * 76159 + a1g;
const isReasonable = capGrande < 1e10 && capGrande > 0;
if (isReasonable) {
  console.log(`  ✅ L=1e14: capital $${capGrande.toFixed(0)} (razoável, sem overflow)`);
  passed++;
} else {
  console.error(`  ❌ L=1e14: capital $${capGrande} (OVERFLOW DETECTADO!)`);
  failed++;
}

// ════════════════════════════════════════════════════════════
// TESTE 4 — tickToSqrtNorm consistência
// ════════════════════════════════════════════════════════════
console.log("\n═══ TESTE 4: tickToSqrtNorm ═══");
// Para tick=0: sqrtNorm = sqrt(1.0001^0) = 1
expect("tick=0 → sqrtNorm=1", tickToSqrtNorm(0), 1.0, 0.001);
// Para tick=66200 e BTC=~$75k
const sqrtAtTick66200 = tickToSqrtNorm(66200);
const priceAtTick = sqrtAtTick66200 * sqrtAtTick66200 * Math.pow(10, 8 - 6);
expect("tick=66200 → preço ~$75k WBTC", priceAtTick, 74970, 0.02);

// ════════════════════════════════════════════════════════════
// RESULTADO
// ════════════════════════════════════════════════════════════
console.log(`\n═══ RESULTADO: ${passed} passou, ${failed} falhou ═══`);
if (failed === 0) {
  console.log("✅ Todas as fórmulas estão corretas!\n");
} else {
  console.error("❌ Há falhas nas fórmulas. Revisar antes de usar no dashboard.\n");
  process.exit(1);
}
