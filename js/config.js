// ============================================================
// config.js — Endereços, ABIs e constantes
// Ethereum Mainnet
// ============================================================

export const WALLET_ADDRESS = "0x4D881568f24fFC38496A1832a53f23f0E63cBcd1";

// ── Tokens ────────────────────────────────────────────────
export const TOKENS = {
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8  },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6  },
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6  },
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDe: { address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", decimals: 18 },
  mUSD: { address: "0xaca92e438df0b2401ff60da7e4337b687a2435da", decimals: 18 },
  DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
};

// ── Chainlink Price Feeds ─────────────────────────────────
export const CHAINLINK = {
  BTC_USD: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88b",
  ETH_USD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
};

// ── Aave v3 Mainnet ────────────────────────────────────────
export const AAVE = {
  POOL:          "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  DATA_PROVIDER: "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3",
};

// ── Uniswap v3 ─────────────────────────────────────────────
export const UNISWAP = {
  NFT_POSITION_MANAGER: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  FACTORY:              "0x1F98431c8aD98523631AE4a59f267346ea31F984",
};

// ── Dívidas Aave — APYs médios (atualizar manualmente se necessário) ──
export const AAVE_DEBT_APYS = {
  USDT: 5.78,
  USDe: 4.02,
  USDC: 4.50,
  mUSD: 10.32,
  WBTC: 0.50,
};

// ── ABIs mínimas ───────────────────────────────────────────
export const ABI = {
  ERC20: [
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ],

  CHAINLINK: [
    "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  ],

  AAVE_POOL: [
    "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  ],

  AAVE_DATA: [
    "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
  ],

  UNI_NFT: [
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  ],

  UNI_POOL: [
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function feeGrowthGlobal0X128() view returns (uint256)",
    "function feeGrowthGlobal1X128() view returns (uint256)",
    "function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
  ],

  UNI_FACTORY: [
    "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
  ],
};

// ── RPC fallbacks ──────────────────────────────────────────
export const RPC_URLS = [
  "https://ethereum.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com",
  "https://eth.llamarpc.com",
];

// ── Constantes de cálculo ──────────────────────────────────
export const Q96  = 2n ** 96n;
export const Q128 = 2n ** 128n;
export const USD_BRL = 5.75;      // fallback manual — atualizar
export const BRL_PER_BTC = 437913; // fallback manual — Power Law estimate
