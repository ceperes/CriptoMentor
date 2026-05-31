// ============================================================
// provider.js — Conexão RPC com fallback automático
// ============================================================

import { RPC_URLS } from "./config.js";

let _provider = null;

/**
 * Retorna um provider conectado.
 * Tenta cada RPC da lista em ordem até um funcionar.
 */
export async function getProvider() {
  if (_provider) return _provider;

  for (const url of RPC_URLS) {
    try {
      // ethers.js é carregado via CDN no HTML — disponível como window.ethers
      const p = new ethers.JsonRpcProvider(url);
      const block = await p.getBlockNumber();
      console.log(`✓ RPC conectado: ${url} (bloco ${block})`);
      _provider = p;
      return p;
    } catch (e) {
      console.warn(`✗ RPC falhou: ${url}`);
    }
  }

  throw new Error("Nenhum RPC disponível. Verifique sua conexão.");
}

/**
 * Reseta o provider (útil para reconectar após erro)
 */
export function resetProvider() {
  _provider = null;
}

/**
 * Busca o gas price atual em Gwei
 */
export async function getGasPrice() {
  const provider = await getProvider();
  const feeData = await provider.getFeeData();
  const gwei = Number(feeData.gasPrice) / 1e9;
  return {
    gwei: gwei,
    label: gwei < 3 ? "🟢 Barato" : gwei < 10 ? "🟡 Normal" : "🔴 Caro",
    color: gwei < 3 ? "#00e87a" : gwei < 10 ? "#f5c518" : "#ff4444",
    // Custo estimado de uma transação de collect no Uniswap v3
    collectCostUSD: (gwei * 0.00012 * 2300), // 120k gas * ETH price estimado
  };
}
