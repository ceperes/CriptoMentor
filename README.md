# ⬡ DeFi Dashboard — Carlos

Dashboard pessoal para monitoramento de operações DeFi em tempo real.
Lê dados diretamente da blockchain Ethereum via Ethers.js + RPCs públicos.

---

## 📁 Estrutura do projeto

```
defi-dashboard/
├── index.html              ← Painel principal (abrir no browser)
├── package.json
├── js/
│   ├── config.js           ← Endereços, ABIs, constantes
│   ├── provider.js         ← Conexão RPC com fallback
│   ├── prices.js           ← Preços Chainlink + CoinGecko
│   ├── uniswap.js          ← Posições LP + cálculos de amounts/fees
│   ├── aave.js             ← Posição Aave v3 + sugestões de pagamento
│   └── analysis.js         ← EMA, RSI, MACD, Bollinger, sinais de trade
└── test/
    └── test-uniswap.js     ← Testa fórmulas antes de usar no painel
```

---

## 🚀 Como usar

### 1. Testar as fórmulas (primeiro passo sempre)
```powershell
cd P:\iaClaude\defi-dashboard
node test/test-uniswap.js
```
Deve mostrar: `✅ Todas as fórmulas estão corretas!`

### 2. Abrir o dashboard
Basta abrir `index.html` no Chrome/Edge.
Cole o endereço da carteira e clique em Carregar.

### 3. Servir localmente (opcional, para ES modules)
```powershell
npx serve . --port 3000
# Acessa: http://localhost:3000
```

---

## 🛠️ Desenvolvimento com Claude Code

Se você instalou o Claude Code, use assim:
```powershell
cd P:\iaClaude\defi-dashboard
claude
```

Comandos úteis dentro do Claude Code:
- `"Adicione suporte para a rede Arbitrum"`
- `"Corrija o cálculo de fees da posição #1273700"`
- `"Adicione um alerta quando o HF cair abaixo de 1.8"`
- `"Crie um gráfico de evolução do patrimônio"`

O Claude Code pode:
✅ Ler e editar todos os arquivos do projeto
✅ Rodar `node test/test-uniswap.js` para verificar as fórmulas
✅ Ver erros reais antes de mostrar no browser
✅ Dividir o trabalho em arquivos organizados

---

## 📊 Dados lidos on-chain

| Dado | Fonte | Arquivo |
|------|-------|---------|
| Preço BTC/ETH | Chainlink Mainnet | `prices.js` |
| Saldos carteira | Contratos ERC-20 | `provider.js` |
| Colateral + Dívida Aave | Aave v3 Pool | `aave.js` |
| Health Factor + LTV | Aave v3 Pool | `aave.js` |
| Posições Uniswap v3 | NFT Position Manager | `uniswap.js` |
| Capital da pool | Cálculo local (tick math) | `uniswap.js` |
| Fees acumuladas | feeGrowthInside on-chain | `uniswap.js` |
| Análise técnica | CoinGecko histórico | `analysis.js` |

---

## 🔧 Configuração

Edite `js/config.js` para:
- Alterar `WALLET_ADDRESS` (endereço padrão)
- Atualizar `AAVE_DEBT_APYS` se as taxas mudarem
- Adicionar novos tokens conhecidos
- Trocar RPCs se algum ficar instável

---

## 📋 Carteira monitorada

- **Endereço**: `0x4D881568f24fFC38496A1832a53f23f0E63cBcd1`
- **Redes**: Ethereum Mainnet (Arbitrum, Base, Optimism — em breve)
- **Pools**: NFT #1291052 e #1273700 (WBTC/USDT Uniswap v3)
- **Aave**: WBTC colateral + dívidas USDT/USDe/mUSD

---

## 🎯 Próximas melhorias

- [ ] Suporte a Arbitrum, Base, Optimism
- [ ] Histórico de patrimônio (localStorage)
- [ ] Alertas por Telegram/email quando HF < 1.8
- [ ] Simulador de cenários (e se BTC cair 20%?)
- [ ] Integração com Revert Finance API
