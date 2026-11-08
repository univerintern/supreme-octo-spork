import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoldRushClient } from "@covalenthq/client-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { deriveAllAddresses } from './server/derivation.js';
import { MASTER_NETWORKS_CONFIG } from './src/services/networkConfig.js';

const app = express();
// AI Studio dev environment must run on port 3000
const PORT = 3000;

// Initialize Covalent GoldRush Client
const client = new GoldRushClient("cqt_rQYrjxv96fdtRFGhW4w7JWX39XVB");

// Map of LI.FI Chain IDs to Covalent Chain Names
const COVALENT_CHAIN_MAP: Record<number, string> = {
  1: 'eth-mainnet',
  42161: 'arbitrum-mainnet',
  8453: 'base-mainnet',
  10: 'optimism-mainnet',
  137: 'matic-mainnet',
  56: 'bsc-mainnet',
  43114: 'avax-mainnet',
  250: 'fantom-mainnet',
  100: 'gnosis-mainnet',
  42220: 'celo-mainnet',
  59144: 'linea-mainnet',
  81457: 'blast-mainnet',
  534352: 'scroll-mainnet',
  5000: 'mantle-mainnet',
  324: 'zksync-mainnet',
  34443: 'mode-mainnet',
  1101: 'polygon-zkevm-mainnet',
  1284: 'moonbeam-mainnet',
  1285: 'moonriver-mainnet',
  25: 'cronos-mainnet',
  1088: 'metis-mainnet',
  169: 'manta-pacific-mainnet',
  7777777: 'zora-mainnet',
  167000: 'taiko-mainnet',
  288: 'boba-mainnet',
  1313161554: 'aurora-mainnet',
  1329: 'sei-mainnet',
  30: 'rsk-mainnet',
  1116: 'core-mainnet',
  9001: 'evmos-mainnet',
  7700: 'canto-mainnet',
  592: 'astar-mainnet',
  122: 'fuse-mainnet',
  1030: 'conflux-mainnet',
  314: 'filecoin-mainnet',
  2020: 'ronin-mainnet',
  204: 'opbnb-mainnet',
  196: 'xlayer-mainnet',
  4200: 'merlin-mainnet',
  252: 'fraxtal-mainnet',
  130: 'unichain-mainnet',
  480: 'worldchain-mainnet',
  33139: 'apechain-mainnet',
  14: 'flare-mainnet',
  19: 'songbird-mainnet',
};

app.use(express.json());

// Set security headers to mitigate COOP errors in proxy environment
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Backend Wallet & Passkey Cache (Longer TTL than balance cache)
const passkeyStore = new Map<string, { derived: Record<string, string>; timestamp: number }>();
const PASSKEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Chain Configurations for Backend Scanning (Native & Major Tokens)
interface BackendChainConfig {
  id: number | string;
  name: string;
  symbol: string;
  ecosystem: 'evm' | 'solana' | 'bitcoin' | 'tron' | 'thorchain';
  rpcs: string[];
  explorerUrl: string;
  color: string;
  accentBg: string;
  logoType: 'ethereum' | 'arbitrum' | 'optimism' | 'base' | 'polygon' | 'bsc' | 'avalanche' | 'linea' | 'blast' | 'scroll' | 'gnosis' | 'solana' | 'tron' | 'bitcoin' | 'thorchain';
  tokenAddress?: string;
  tokenDecimals?: number;
}



const BACKEND_CHAINS: BackendChainConfig[] = [
  // Major EVM Chains (Primary detection via on-chain batch multi-call + Covalent)
  { id: 1, name: 'Ethereum', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://ethereum-rpc.publicnode.com', 'https://cloudflare-eth.com', 'https://1rpc.io/eth'], explorerUrl: 'https://etherscan.io', color: '#627EEA', accentBg: 'rgba(98, 126, 234, 0.15)', logoType: 'ethereum' },
  { id: 42161, name: 'Arbitrum One', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://1rpc.io/arb'], explorerUrl: 'https://arbiscan.io', color: '#28A0F0', accentBg: 'rgba(40, 160, 240, 0.15)', logoType: 'arbitrum' },
  { id: 8453, name: 'Base', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'], explorerUrl: 'https://basescan.org', color: '#0052FF', accentBg: 'rgba(0, 82, 255, 0.15)', logoType: 'base' },
  { id: 10, name: 'Optimism', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com', 'https://1rpc.io/op'], explorerUrl: 'https://optimistic.etherscan.io', color: '#FF0420', accentBg: 'rgba(255, 4, 32, 0.15)', logoType: 'optimism' },
  { id: 137, name: 'Polygon PoS', symbol: 'POL', ecosystem: 'evm', rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://1rpc.io/matic', 'https://polygon.drpc.org'], explorerUrl: 'https://polygonscan.com', color: '#8247E5', accentBg: 'rgba(130, 71, 229, 0.15)', logoType: 'polygon' },
  { id: 56, name: 'BNB Smart Chain', symbol: 'BNB', ecosystem: 'evm', rpcs: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com', 'https://1rpc.io/bnb'], explorerUrl: 'https://bscscan.com', color: '#F3BA2F', accentBg: 'rgba(243, 186, 47, 0.15)', logoType: 'bsc' },
  { id: 43114, name: 'Avalanche', symbol: 'AVAX', ecosystem: 'evm', rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'], explorerUrl: 'https://snowtrace.io', color: '#E84142', accentBg: 'rgba(232, 65, 66, 0.15)', logoType: 'avalanche' },
  { id: 59144, name: 'Linea', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://rpc.linea.build', 'https://1rpc.io/linea'], explorerUrl: 'https://lineascan.build', color: '#61DFFF', accentBg: 'rgba(97, 223, 255, 0.15)', logoType: 'linea' },
  { id: 81457, name: 'Blast', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://rpc.blast.io'], explorerUrl: 'https://blastscan.io', color: '#FCFC03', accentBg: 'rgba(252, 252, 3, 0.15)', logoType: 'blast' },
  { id: 534352, name: 'Scroll', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://rpc.scroll.io', 'https://1rpc.io/scroll'], explorerUrl: 'https://scrollscan.com', color: '#FFEEDA', accentBg: 'rgba(255, 238, 218, 0.15)', logoType: 'scroll' },
  { id: 324, name: 'zkSync Era', symbol: 'ETH', ecosystem: 'evm', rpcs: ['https://mainnet.era.zksync.io', 'https://1rpc.io/zksync2-era'], explorerUrl: 'https://explorer.zksync.io', color: '#8C8EC9', accentBg: 'rgba(140, 142, 201, 0.15)', logoType: 'ethereum' },

  // Non-EVM Ecosystems (17 networks)
  { id: 999991, name: 'Solana', symbol: 'SOL', ecosystem: 'solana', rpcs: ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'], explorerUrl: 'https://explorer.solana.com', color: '#9945FF', accentBg: 'rgba(153, 69, 255, 0.15)', logoType: 'solana' },
  { id: 999992, name: 'Tron', symbol: 'TRX', ecosystem: 'tron', rpcs: ['https://api.trongrid.io'], explorerUrl: 'https://tronscan.org', color: '#FF0013', accentBg: 'rgba(255, 0, 19, 0.15)', logoType: 'tron' },
  { id: 999993, name: 'Bitcoin', symbol: 'BTC', ecosystem: 'bitcoin', rpcs: ['https://mempool.space', 'https://blockstream.info'], explorerUrl: 'https://mempool.space', color: '#F7931A', accentBg: 'rgba(247, 147, 26, 0.15)', logoType: 'bitcoin' },
  { id: 999994, name: 'Thorchain', symbol: 'RUNE', ecosystem: 'thorchain', rpcs: ['https://midgard.thorchain.info/v2', 'https://midgard.ninerealms.com/v2'], explorerUrl: 'https://thorchain.net', color: '#00CC99', accentBg: 'rgba(0, 204, 153, 0.15)', logoType: 'thorchain' },
  { id: 999995, name: 'Sui', symbol: 'SUI', ecosystem: 'sui', rpcs: ['https://fullnode.mainnet.sui.io:443'], explorerUrl: 'https://suiscan.xyz', color: '#6FBCF0', accentBg: 'rgba(111, 188, 240, 0.15)', logoType: 'ethereum' },
  { id: 999996, name: 'Aptos', symbol: 'APT', ecosystem: 'aptos', rpcs: ['https://fullnode.mainnet.aptoslabs.com/v1'], explorerUrl: 'https://explorer.aptoslabs.com', color: '#1EE397', accentBg: 'rgba(30, 227, 151, 0.15)', logoType: 'ethereum' },
  { id: 999997, name: 'Stellar', symbol: 'XLM', ecosystem: 'stellar', rpcs: ['https://horizon.stellar.org'], explorerUrl: 'https://stellar.expert', color: '#000000', accentBg: 'rgba(255, 255, 255, 0.15)', logoType: 'ethereum' },
  { id: 999998, name: 'XRP Ledger', symbol: 'XRP', ecosystem: 'xrp', rpcs: ['https://xrplcluster.com'], explorerUrl: 'https://xrpscan.com', color: '#23292F', accentBg: 'rgba(35, 41, 47, 0.15)', logoType: 'ethereum' },
  { id: 999999, name: 'TON', symbol: 'TON', ecosystem: 'ton', rpcs: ['https://toncenter.com/api/v2'], explorerUrl: 'https://tonviewer.com', color: '#0088CC', accentBg: 'rgba(0, 136, 204, 0.15)', logoType: 'ethereum' },
  { id: 1000000, name: 'NEAR', symbol: 'NEAR', ecosystem: 'near', rpcs: ['https://rpc.mainnet.near.org'], explorerUrl: 'https://nearblocks.io', color: '#000000', accentBg: 'rgba(255, 255, 255, 0.15)', logoType: 'ethereum' },
  { id: 1000001, name: 'Cardano', symbol: 'ADA', ecosystem: 'cardano', rpcs: ['https://api.koios.rest/api/v1'], explorerUrl: 'https://cardanoscan.io', color: '#0033AD', accentBg: 'rgba(0, 51, 173, 0.15)', logoType: 'ethereum' },
  { id: 1000002, name: 'Cosmos', symbol: 'ATOM', ecosystem: 'cosmos', rpcs: ['https://rest.cosmos.directory/cosmos'], explorerUrl: 'https://cosmoscan.net', color: '#2E3148', accentBg: 'rgba(46, 49, 72, 0.15)', logoType: 'ethereum' },
  { id: 1000003, name: 'Polkadot', symbol: 'DOT', ecosystem: 'polkadot', rpcs: ['https://polkadot.api.onfinality.io/public'], explorerUrl: 'https://polkascan.io', color: '#E6007A', accentBg: 'rgba(230, 0, 122, 0.15)', logoType: 'ethereum' },
  { id: 1000004, name: 'Algorand', symbol: 'ALGO', ecosystem: 'algorand', rpcs: ['https://mainnet-api.algonode.cloud/v2'], explorerUrl: 'https://algoexplorer.io', color: '#000000', accentBg: 'rgba(255, 255, 255, 0.15)', logoType: 'ethereum' },
  { id: 1000005, name: 'Litecoin', symbol: 'LTC', ecosystem: 'litecoin', rpcs: ['https://litecoinspace.org'], explorerUrl: 'https://litecoinspace.org', color: '#BEBEBE', accentBg: 'rgba(190, 190, 190, 0.15)', logoType: 'litecoin' },
  { id: 1000006, name: 'Dogecoin', symbol: 'DOGE', ecosystem: 'dogecoin', rpcs: ['https://dogechain.info/api/v1'], explorerUrl: 'https://dogechain.info', color: '#C2A633', accentBg: 'rgba(194, 166, 51, 0.15)', logoType: 'ethereum' },
  { id: 1000007, name: 'Zcash', symbol: 'ZEC', ecosystem: 'zcash', rpcs: ['https://api.blockchair.com/zcash'], explorerUrl: 'https://zec.blockexplorer.com', color: '#ECB22E', accentBg: 'rgba(236, 178, 46, 0.15)', logoType: 'ethereum' },
];

function isValidAddressForEcosystem(ecosystem: string, addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false;
  const clean = addr.trim();
  if (clean.length === 0) return false;

  switch (ecosystem) {
    case 'evm':
      return /^0x[a-fA-F0-9]{40}$/i.test(clean);
    case 'solana':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean) && !clean.startsWith('0x');
    case 'tron':
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean);
    case 'bitcoin':
      return /^bc1[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(clean) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(clean);
    case 'thorchain':
      return /^thor1[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(clean);
    case 'litecoin':
      return /^ltc1[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(clean) || /^[LM3][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(clean);
    case 'dogecoin':
      return /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(clean);
    case 'zcash':
      return /^t1[a-zA-Z0-9]{33}$/.test(clean);
    case 'sui':
      return /^0x[a-fA-F0-9]{64}$/i.test(clean);
    case 'aptos':
      return /^0x[a-fA-F0-9]{64}$/i.test(clean);
    case 'stellar':
      return /^G[A-Z2-7]{55}$/.test(clean);
    case 'xrp':
      return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(clean);
    case 'cardano':
      return /^addr1[a-zA-HJ-NP-Z0-9]{50,110}$/i.test(clean);
    case 'cosmos':
      return /^cosmos1[a-zA-HJ-NP-Z0-9]{38,45}$/i.test(clean);
    case 'polkadot':
      return /^1[0-9a-zA-Z]{46,48}$/.test(clean);
    case 'algorand':
      return /^[A-Z2-7]{58}$/.test(clean);
    case 'near':
      return /^[0-9a-f]{64}$/i.test(clean) || clean.endsWith('.near');
    case 'ton':
      return clean.length >= 48 && !clean.startsWith('0x');
    default:
      return false;
  }
}

function detectEcosystem(addr: string): string {
  if (!addr) return 'unknown';
  const clean = addr.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(clean)) return 'evm';
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean)) return 'tron';
  if (/^bc1[a-zA-HJ-NP-Z0-9]{25,62}$/.test(clean)) return 'bitcoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean)) return 'solana';
  return 'unknown';
}

function formatBalanceNumber(val: number): string {
  if (val <= 0) return '0.0000';
  if (val < 0.0001) return '< 0.0001';
  if (val < 1) return val.toFixed(4);
  return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// In-memory short TTL cache to reduce RPC strain
const balanceCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 60000; // Increased to 60s since we refresh on transaction now

const KNOWN_ERC20_TOKENS: Record<number, Array<{ symbol: string; name: string; contractAddress: string; decimals: number }>> = {
  1: [ // Ethereum
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18 },
    { symbol: 'WBTC', name: 'Wrapped BTC', contractAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8 },
    { symbol: 'LINK', name: 'Chainlink', contractAddress: '0x514910771af9ca656af840dff83e8264ecf986ca', decimals: 18 },
    { symbol: 'UNI', name: 'Uniswap', contractAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', decimals: 18 },
  ],
  137: [ // Polygon
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', decimals: 18 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x7ceb23fd6bc0ad272544d44422e11894dff430bb', decimals: 18 },
  ],
  42161: [ // Arbitrum
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
    { symbol: 'USDC.e', name: 'Bridged USDC', contractAddress: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', decimals: 6 },
    { symbol: 'DAI', name: 'Dai Stablecoin', contractAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
    { symbol: 'ARB', name: 'Arbitrum', contractAddress: '0x912ce59144191c1204e64559fe8253a0e49e6548', decimals: 18 },
  ],
  10: [ // Optimism
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6 },
    { symbol: 'OP', name: 'Optimism', contractAddress: '0x4200000000000000000000000000000000000042', decimals: 18 },
  ],
  8453: [ // Base
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
    { symbol: 'WETH', name: 'Wrapped Ether', contractAddress: '0x4200000000000000000000000000000000000006', decimals: 18 },
  ],
  56: [ // BSC
    { symbol: 'USDT', name: 'Tether USD', contractAddress: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
    { symbol: 'BUSD', name: 'Binance USD', contractAddress: '0xe9e7cea3dedca5984780bafc599bd69add087d56', decimals: 18 },
  ],
  43114: [ // Avalanche
    { symbol: 'USDT.e', name: 'Tether USD', contractAddress: '0xc7198437980c041c805a1edcba50c145db790204', decimals: 6 },
    { symbol: 'USDC', name: 'USD Coin', contractAddress: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', decimals: 6 },
  ],
};

interface ChainTokenInfo {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string;
}

async function fetchCovalentBalances(address: string, chainId: number) {
  const chainName = COVALENT_CHAIN_MAP[chainId];
  if (!chainName) return [];
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Covalent timeout')), 3000)
    );
    const resp: any = await Promise.race([
      client.BalanceService.getTokenBalancesForWalletAddress(chainName as any, address),
      timeoutPromise
    ]);
    if (resp && !resp.error && resp.data && Array.isArray(resp.data.items)) {
      return resp.data.items;
    }
    if (resp && resp.error) {
      console.warn(`[Covalent SDK] ${chainName} error: code ${resp.error_code}, msg: ${resp.error_message}`);
    }
    return [];
  } catch (e) {
    return [];
  }
}

const chainTokensCache = new Map<number, ChainTokenInfo[]>();

async function getChainTokensToScan(chainId: number): Promise<ChainTokenInfo[]> {
  if (chainTokensCache.has(chainId)) {
    return chainTokensCache.get(chainId)!;
  }

  const tokenList: ChainTokenInfo[] = [];

  // 1. Include hardcoded known major tokens first if available
  const known = KNOWN_ERC20_TOKENS[chainId] || [];
  for (const k of known) {
    tokenList.push({
      symbol: k.symbol,
      name: k.name,
      contractAddress: k.contractAddress.toLowerCase(),
      decimals: k.decimals
    });
  }

  // 2. Query LiFi verified token registry for this chain via backend proxy
  try {
    const lifiProxyUrl = (process.env.VITE_LIFI_PROXY_URL || 'https://crimson-unit-da4e.universeeco.workers.dev').replace(/\/+$/, '');
    const res = await fetch(`${lifiProxyUrl}/tokens?chains=${chainId}`, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const json: any = await res.json();
      const rawTokens: any[] = json?.tokens?.[chainId] || [];
      for (const t of rawTokens) {
        if (!t.address || t.address === '0x0000000000000000000000000000000000000000' || t.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          continue;
        }
        const lowerAddr = t.address.toLowerCase();
        if (!tokenList.some(item => item.contractAddress === lowerAddr)) {
          tokenList.push({
            symbol: t.symbol || 'TOKEN',
            name: t.name || t.symbol || 'Token',
            contractAddress: lowerAddr,
            decimals: typeof t.decimals === 'number' ? t.decimals : 18,
            logoURI: t.logoURI,
            priceUSD: t.priceUSD
          });
        }
        if (tokenList.length >= 35) break;
      }
    }
  } catch {}

  chainTokensCache.set(chainId, tokenList);
  return tokenList;
}

// POST /api/scan-balances: Backend-Powered Multi-Chain Asset Resolution
app.post('/api/scan-balances', async (req, res) => {
  try {
    const {
      evmAddress,
      solanaAddress,
      tronAddress,
      bitcoinAddress,
      thorchainAddress,
      ecosystemAddresses,
      passkey,
      requestedChainIds
    } = req.body || {};

    let targetEvm = (evmAddress || (ecosystemAddresses && ecosystemAddresses.evm) || '').trim();
    if (!isValidAddressForEcosystem('evm', targetEvm)) {
      targetEvm = '';
    }

    const rawSol = (solanaAddress || (ecosystemAddresses && ecosystemAddresses.solana) || '').trim();
    const rawTron = (tronAddress || (ecosystemAddresses && ecosystemAddresses.tron) || '').trim();
    const rawBtc = (bitcoinAddress || (ecosystemAddresses && ecosystemAddresses.bitcoin) || '').trim();
    const rawThor = (thorchainAddress || (ecosystemAddresses && ecosystemAddresses.thorchain) || '').trim();

    let derived: Record<string, string> = {
      evm: targetEvm,
      solana: isValidAddressForEcosystem('solana', rawSol) ? rawSol : '',
      tron: isValidAddressForEcosystem('tron', rawTron) ? rawTron : '',
      bitcoin: isValidAddressForEcosystem('bitcoin', rawBtc) ? rawBtc : '',
      thorchain: isValidAddressForEcosystem('thorchain', rawThor) ? rawThor : '',
    };

    // If ecosystemAddresses dictionary was passed, import other non-EVM chains
    if (ecosystemAddresses && typeof ecosystemAddresses === 'object') {
      for (const [k, v] of Object.entries(ecosystemAddresses)) {
        if (typeof v === 'string' && isValidAddressForEcosystem(k, v)) {
          if (!derived[k]) derived[k] = v.trim();
        }
      }
    }

    // 0. Handle Passkey Derivation & Caching
    if (passkey && typeof passkey === 'string' && passkey.trim().split(' ').length >= 12) {
      const cleanPasskey = passkey.trim();
      let derivedRes = passkeyStore.get(cleanPasskey);

      if (!derivedRes || (Date.now() - derivedRes.timestamp > PASSKEY_TTL_MS)) {
        console.log('[Backend] Deriving and caching addresses for new passkey...');
        const d = deriveAllAddresses(cleanPasskey);
        derivedRes = { derived: d, timestamp: Date.now() };
        passkeyStore.set(cleanPasskey, derivedRes);
      }

      const passkeyDerived = derivedRes.derived;
      if (!targetEvm && passkeyDerived.evm) {
        targetEvm = passkeyDerived.evm;
        derived.evm = passkeyDerived.evm;
      }

      // Populate or override with valid non-EVM addresses
      for (const [k, v] of Object.entries(passkeyDerived)) {
        if (v && (!derived[k] || !isValidAddressForEcosystem(k, derived[k]))) {
          derived[k] = v;
        }
      }
    }

    // Strict sanitation: ensure no non-EVM key holds a 0x address
    for (const [k, v] of Object.entries(derived)) {
      if (k !== 'evm' && v && !isValidAddressForEcosystem(k, v)) {
        console.warn(`[Backend] Rejecting invalid address for ${k}: ${v}`);
        derived[k] = '';
      }
    }

    const hasAnyAddress = !!(targetEvm || derived.evm || derived.solana || derived.tron || derived.bitcoin || derived.thorchain);
    if (!hasAnyAddress) {
      return res.json({ success: true, activeNetworksWithBalance: [], totalActiveCount: 0, scannedAt: Date.now() });
    }

    const finalEvm = targetEvm || derived.evm || '';
    const cacheKey = `bal|${finalEvm}|${derived.solana || ''}|${derived.tron || ''}|${derived.bitcoin || ''}|${requestedChainIds?.join(',') || 'all'}`;
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // 1. Fetch EVM balances via Covalent & live RPCs in parallel for all requested or mapped chains
    const evmChainIdsToScan = new Set<number>();
    if (requestedChainIds && requestedChainIds.length > 0) {
      for (const cid of requestedChainIds) {
        if (typeof cid === 'number' && cid < 999990) {
          evmChainIdsToScan.add(cid);
        }
      }
    } else {
      for (const cidStr of Object.keys(COVALENT_CHAIN_MAP)) {
        evmChainIdsToScan.add(parseInt(cidStr));
      }
    }

    const evmPromises = Array.from(evmChainIdsToScan).map(async (cid) => {
      if (!finalEvm) return null;
      const masterNet = Object.values(MASTER_NETWORKS_CONFIG).find(n => n.chainId === cid);
      const chainConfig = BACKEND_CHAINS.find(c => c.id === cid) || {
        id: cid,
        name: masterNet?.name || `EVM Chain ${cid}`,
        symbol: masterNet?.name?.split(' ')?.[0] || 'ETH',
        ecosystem: 'evm' as const,
        rpcs: masterNet?.rpcUrl ? [masterNet.rpcUrl] : [],
        explorerUrl: '#',
        color: '#22d3ee',
        accentBg: 'rgba(34, 211, 238, 0.15)',
        logoType: 'ethereum' as const
      };

      const tokens: Array<{
        symbol: string;
        name: string;
        contractAddress?: string;
        balance: number;
        weiString: string;
        formattedBalance: string;
        logoUrl?: string;
        isNative?: boolean;
        quoteUsd?: number;
      }> = [];

      let nativeBalanceVal = 0;
      let nativeWeiStr = '0';

      // 1. Covalent API Strategy (using Covalent SDK)
      try {
        const items = await fetchCovalentBalances(finalEvm, cid);
        for (const item of items) {
          const decimals = typeof item.contract_decimals === 'number' && item.contract_decimals >= 0 ? item.contract_decimals : 18;
          let numBal = 0;
          let rawStr = '0';

          if (item.balance !== undefined && item.balance !== null) {
            const strBal = String(item.balance).trim();
            if (strBal.includes('.')) {
              numBal = parseFloat(strBal);
              rawStr = strBal;
            } else {
              try {
                const rawBig = BigInt(strBal);
                numBal = Number(rawBig) / Math.pow(10, decimals);
                rawStr = strBal;
              } catch {
                numBal = parseFloat(strBal) / Math.pow(10, decimals);
                rawStr = strBal;
              }
            }
          }

          if (numBal <= 0 || isNaN(numBal)) continue;

          const isNativeToken = !!(
            item.native_token ||
            item.contract_address === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
            !item.contract_address ||
            (item.contract_ticker_symbol && item.contract_ticker_symbol.toLowerCase() === chainConfig.symbol.toLowerCase())
          );

          const symbol = item.contract_ticker_symbol || (isNativeToken ? chainConfig.symbol : 'TOKEN');
          const name = item.contract_name || (isNativeToken ? chainConfig.name : symbol);
          const logoUrl = item.logo_url || (item as any).logo_urls?.token_logo_url || undefined;
          const quoteUsd = typeof item.quote === 'number' && item.quote > 0 
            ? item.quote 
            : (typeof (item as any).quote_rate === 'number' && (item as any).quote_rate > 0 ? (item as any).quote_rate * numBal : undefined);

          if (isNativeToken) {
            nativeBalanceVal = numBal;
            nativeWeiStr = rawStr;
          }

          tokens.push({
            symbol,
            name,
            contractAddress: isNativeToken ? undefined : item.contract_address,
            balance: numBal,
            weiString: rawStr,
            formattedBalance: formatBalanceNumber(numBal),
            logoUrl,
            isNative: isNativeToken,
            quoteUsd: typeof quoteUsd === 'number' && !isNaN(quoteUsd) && quoteUsd > 0 ? quoteUsd : undefined
          });
        }
      } catch {}

      // 2. Direct On-Chain RPC Query (Native balance & all ERC-20 contract tokens)
      const isTargeted = requestedChainIds && requestedChainIds.includes(cid);
      const availableRpcs = (chainConfig.rpcs && chainConfig.rpcs.length > 0) ? chainConfig.rpcs : (masterNet?.rpcUrl ? [masterNet.rpcUrl] : []);

      if (availableRpcs.length > 0) {
        for (const rpc of availableRpcs) {
          try {
            // A. Query native balance on-chain if missing or targeted
            if (!tokens.some(t => t.isNative)) {
              const rpcRes = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: cid, method: 'eth_getBalance', params: [finalEvm, 'latest'] }),
                signal: AbortSignal.timeout(3500)
              });
              if (rpcRes.ok) {
                const rpcJson: any = await rpcRes.json();
                if (rpcJson?.result) {
                  const wei = BigInt(rpcJson.result);
                  const bal = Number(wei) / 1e18;
                  if (bal > 0) {
                    nativeBalanceVal = bal;
                    nativeWeiStr = wei.toString();
                    tokens.unshift({
                      symbol: chainConfig.symbol,
                      name: chainConfig.name,
                      balance: bal,
                      weiString: nativeWeiStr,
                      formattedBalance: formatBalanceNumber(bal),
                      isNative: true
                    });
                  }
                }
              }
            }

            // B. Query tokens on this chain via batch eth_call
            const tokensToScan = await getChainTokensToScan(cid);
            if (tokensToScan.length > 0) {
              const cleanAddr = finalEvm.replace(/^0x/, '').toLowerCase().padStart(64, '0');
              const calldata = `0x70a08231${cleanAddr}`;

              const batchBody = tokensToScan.map((tk, idx) => ({
                jsonrpc: '2.0',
                id: idx + 10,
                method: 'eth_call',
                params: [{ to: tk.contractAddress, data: calldata }, 'latest']
              }));

              const batchRes = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchBody),
                signal: AbortSignal.timeout(4500)
              });

              if (batchRes.ok) {
                const batchJson: any = await batchRes.json();
                if (Array.isArray(batchJson)) {
                  for (let i = 0; i < tokensToScan.length; i++) {
                    const tk = tokensToScan[i];
                    const itemRes = batchJson.find((r: any) => r.id === i + 10);
                    if (itemRes?.result && itemRes.result !== '0x' && itemRes.result !== '0x0') {
                      try {
                        const rawBig = BigInt(itemRes.result);
                        if (rawBig > 0n) {
                          const bal = Number(rawBig) / Math.pow(10, tk.decimals);
                          if (bal > 0 && !tokens.some(t => t.contractAddress?.toLowerCase() === tk.contractAddress.toLowerCase())) {
                            const quoteUsd = tk.priceUSD ? bal * parseFloat(tk.priceUSD) : undefined;
                            tokens.push({
                              symbol: tk.symbol,
                              name: tk.name,
                              contractAddress: tk.contractAddress,
                              balance: bal,
                              weiString: rawBig.toString(),
                              formattedBalance: formatBalanceNumber(bal),
                              logoUrl: tk.logoURI,
                              isNative: false,
                              quoteUsd: typeof quoteUsd === 'number' && quoteUsd > 0 ? quoteUsd : undefined
                            });
                          }
                        }
                      } catch {}
                    }
                  }
                }
              }
            }

            break; // Successfully scanned RPC
          } catch {}
        }
      }

      // Sort found tokens: native first (if held), then non-native tokens by USD value or balance
      tokens.sort((a, b) => {
        if (a.isNative && !b.isNative) return -1;
        if (!a.isNative && b.isNative) return 1;
        if (typeof a.quoteUsd === 'number' && typeof b.quoteUsd === 'number') {
          return b.quoteUsd - a.quoteUsd;
        }
        return b.balance - a.balance;
      });

      // Strictly filter for tokens with positive balance (> 0)
      const positiveTokens = tokens.filter(t => typeof t.balance === 'number' && t.balance > 0);

      if (positiveTokens.length > 0 || isTargeted) {
        return {
          ...chainConfig,
          balance: nativeBalanceVal,
          weiString: nativeWeiStr,
          formattedBalance: formatBalanceNumber(nativeBalanceVal),
          tokens: positiveTokens,
          lastUpdated: Date.now()
        };
      }
      return null;
    });

    // 2. Fetch non-EVM balances using public RPCs/APIs (expanded across all non-EVM chains)
    const nonEvmPromises = BACKEND_CHAINS.filter(c => c.ecosystem !== 'evm' || c.id >= 999991).map(async (chain) => {
      // If EVM, skip (handled by EVM scanner)
      if (chain.ecosystem === 'evm' && chain.id < 999991) return null;
      if (requestedChainIds && !requestedChainIds.includes(Number(chain.id))) return null;

      const lowerName = chain.name.toLowerCase().replace(/\s/g, '');
      const lowerSymbol = chain.symbol.toLowerCase();

      // Look up address strictly matching this chain or ecosystem
      const addr = (chain.ecosystem && (derived as any)[chain.ecosystem]) ||
                   (derived as any)[lowerName] ||
                   (derived as any)[lowerSymbol] ||
                   (derived as any)[chain.name.toLowerCase()] ||
                   (derived as any)[chain.symbol.toLowerCase()] ||
                   ((derived as any)['xrp'] && lowerName === 'xrpledger' ? (derived as any)['xrp'] : null);

      // CRITICAL: Reject if address is missing or invalid for this ecosystem (zero EVM addresses on non-EVM chains!)
      if (!addr || !isValidAddressForEcosystem(chain.ecosystem, addr)) {
        return null;
      }

      let balanceVal = 0;
      let weiVal = '0';
      const nonEvmTokens: Array<{
        symbol: string;
        name: string;
        contractAddress?: string;
        balance: number;
        weiString: string;
        formattedBalance: string;
        logoUrl?: string;
        isNative?: boolean;
      }> = [];

      try {
        if (chain.id === 999991) { // Solana
          for (const rpc of chain.rpcs) {
            try {
              const rpcRes = await fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }),
                signal: AbortSignal.timeout(3500)
              });
              if (rpcRes.ok) {
                const json: any = await rpcRes.json();
                const val = json?.result?.value || json?.result;
                if (typeof val === 'number' && val > 0) {
                  balanceVal = val / 1e9;
                  weiVal = val.toString();
                  nonEvmTokens.push({
                    symbol: 'SOL',
                    name: 'Solana',
                    balance: balanceVal,
                    weiString: weiVal,
                    formattedBalance: formatBalanceNumber(balanceVal),
                    isNative: true
                  });
                }
                break;
              }
            } catch {}
          }

          // Fetch SPL Token Accounts for Solana (Standard Token & Token-2022)
          for (const programId of [
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Standard SPL Token
            'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'  // Token-2022 Program
          ]) {
            try {
              const splRes = await fetch(chain.rpcs[0], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'getTokenAccountsByOwner',
                  params: [
                    addr,
                    { programId },
                    { encoding: 'jsonParsed' }
                  ]
                }),
                signal: AbortSignal.timeout(4000)
              });
              if (splRes.ok) {
                const splJson: any = await splRes.json();
                const accounts = splJson?.result?.value;
                if (Array.isArray(accounts)) {
                  const KNOWN_SOLANA_MINTS: Record<string, { symbol: string; name: string }> = {
                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
                    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD' },
                    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk' },
                    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol: 'WIF', name: 'dogwifhat' },
                    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium' },
                    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter' },
                    '2b1kV6ebUAKGgnUoKzp5z7P27b4bCjP4b4b4b4b4b4b': { symbol: 'PYUSD', name: 'PayPal USD' },
                  };

                  for (const accObj of accounts) {
                    const info = accObj?.account?.data?.parsed?.info;
                    const uiAmount = info?.tokenAmount?.uiAmount;
                    const mint = info?.mint;
                    if (typeof uiAmount === 'number' && uiAmount > 0 && mint) {
                      const known = KNOWN_SOLANA_MINTS[mint] || {
                        symbol: mint.slice(0, 4).toUpperCase(),
                        name: `SPL Token (${mint.slice(0, 4)}...${mint.slice(-4)})`
                      };
                      if (!nonEvmTokens.some(t => t.contractAddress === mint)) {
                        nonEvmTokens.push({
                          symbol: known.symbol,
                          name: known.name,
                          contractAddress: mint,
                          balance: uiAmount,
                          weiString: info?.tokenAmount?.amount || String(uiAmount),
                          formattedBalance: formatBalanceNumber(uiAmount),
                          isNative: false
                        });
                      }
                    }
                  }
                }
              }
            } catch {}
          }
        } else if (chain.id === 999992) { // Tron
          const apiRes = await fetch(`${chain.rpcs[0]}/v1/accounts/${addr}`, { signal: AbortSignal.timeout(3500) });
          const json: any = await apiRes.json();
          const acc = json?.data?.[0];
          if (acc) {
            if (acc.balance && Number(acc.balance) > 0) {
              balanceVal = acc.balance / 1e6;
              weiVal = acc.balance.toString();
              nonEvmTokens.push({
                symbol: 'TRX',
                name: 'Tron',
                balance: balanceVal,
                weiString: weiVal,
                formattedBalance: formatBalanceNumber(balanceVal),
                isNative: true
              });
            }
            if (Array.isArray(acc.trc20)) {
              const KNOWN_TRC20: Record<string, { symbol: string; name: string; decimals: number }> = {
                'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT', name: 'Tether USD (TRC20)', decimals: 6 },
                'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8': { symbol: 'USDC', name: 'USD Coin (TRC20)', decimals: 6 },
                'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn': { symbol: 'USDD', name: 'Decentralized USD', decimals: 18 },
                'TCFLL5Z5KKVIW2Pddqw7hHJdnqzzPuNWao': { symbol: 'BTT', name: 'BitTorrent Token', decimals: 18 },
                'TF17BgPaZYbz8oxbjhriubPDsA7ArWuLXg': { symbol: 'JST', name: 'JUST Token', decimals: 18 },
                'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S': { symbol: 'SUN', name: 'Sun Token', decimals: 18 },
              };

              for (const trcMap of acc.trc20) {
                for (const [contractAddr, rawBalStr] of Object.entries(trcMap)) {
                  const rawVal = Number(rawBalStr);
                  if (rawVal > 0) {
                    const known = KNOWN_TRC20[contractAddr] || { symbol: 'TRC20', name: 'TRC-20 Token', decimals: 6 };
                    const bal = rawVal / Math.pow(10, known.decimals);
                    nonEvmTokens.push({
                      symbol: known.symbol,
                      name: known.name,
                      contractAddress: contractAddr,
                      balance: bal,
                      weiString: String(rawVal),
                      formattedBalance: formatBalanceNumber(bal),
                      isNative: false
                    });
                  }
                }
              }
            }
          }
        } else if (chain.id === 999993) { // Bitcoin
          for (const apiHost of ['https://mempool.space', 'https://blockstream.info']) {
            try {
              const apiRes = await fetch(`${apiHost}/api/address/${addr}`, { signal: AbortSignal.timeout(3500) });
              if (apiRes.ok) {
                const json: any = await apiRes.json();
                if (json?.chain_stats) {
                  const sat = (Number(json.chain_stats.funded_txo_sum) || 0) - (Number(json.chain_stats.spent_txo_sum) || 0);
                  if (sat > 0) {
                    balanceVal = sat / 1e8;
                    weiVal = sat.toString();
                    nonEvmTokens.push({
                      symbol: 'BTC',
                      name: 'Bitcoin',
                      balance: balanceVal,
                      weiString: weiVal,
                      formattedBalance: formatBalanceNumber(balanceVal),
                      isNative: true
                    });
                  }
                }
                break;
              }
            } catch {}
          }
        } else if (chain.id === 999994) { // Thorchain
          for (const apiHost of ['https://midgard.thorchain.info/v2', 'https://midgard.ninerealms.com/v2']) {
            try {
              const apiRes = await fetch(`${apiHost}/balance/${addr}`, { signal: AbortSignal.timeout(3500) });
              if (apiRes.ok) {
                const json: any = await apiRes.json();
                if (Array.isArray(json?.coins)) {
                  for (const c of json.coins) {
                    const amt = Number(c.amount);
                    if (amt > 0) {
                      const isRune = c.asset === 'THOR.RUNE';
                      const bal = amt / 1e8;
                      const sym = isRune ? 'RUNE' : (c.asset.split('.')[1] || c.asset);
                      if (isRune) {
                        balanceVal = bal;
                        weiVal = String(amt);
                      }
                      nonEvmTokens.push({
                        symbol: sym,
                        name: isRune ? 'THORChain' : `THOR ${c.asset}`,
                        contractAddress: c.asset,
                        balance: bal,
                        weiString: String(amt),
                        formattedBalance: formatBalanceNumber(bal),
                        isNative: isRune
                      });
                    }
                  }
                }
                break;
              }
            } catch {}
          }
        } else if (chain.id === 999995) { // Sui
          const rpcRes = await fetch('https://fullnode.mainnet.sui.io:443', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getAllBalances', params: [addr] }),
            signal: AbortSignal.timeout(3500)
          });
          if (rpcRes.ok) {
            const json: any = await rpcRes.json();
            if (Array.isArray(json?.result)) {
              for (const item of json.result) {
                const rawVal = Number(item.totalBalance);
                if (rawVal > 0) {
                  const isSui = item.coinType === '0x2::sui::SUI';
                  const bal = rawVal / 1e9;
                  const sym = isSui ? 'SUI' : (item.coinType.split('::').pop() || 'COIN');
                  if (isSui) {
                    balanceVal = bal;
                    weiVal = String(item.totalBalance);
                  }
                  nonEvmTokens.push({
                    symbol: sym,
                    name: isSui ? 'Sui' : `${sym} (Sui)`,
                    contractAddress: item.coinType,
                    balance: bal,
                    weiString: String(item.totalBalance),
                    formattedBalance: formatBalanceNumber(bal),
                    isNative: isSui
                  });
                }
              }
            }
          }
        } else if (chain.id === 999996) { // Aptos
          const apiRes = await fetch(`https://fullnode.mainnet.aptoslabs.com/v1/accounts/${addr}/resources`, { signal: AbortSignal.timeout(3500) });
          if (apiRes.ok) {
            const json: any = await apiRes.json();
            if (Array.isArray(json)) {
              for (const r of json) {
                if (r.type?.startsWith('0x1::coin::CoinStore<')) {
                  const rawVal = Number(r.data?.coin?.value);
                  if (rawVal > 0) {
                    const coinType = r.type.replace('0x1::coin::CoinStore<', '').replace('>', '');
                    const isApt = coinType.includes('AptosCoin');
                    const bal = rawVal / 1e8;
                    const sym = isApt ? 'APT' : (coinType.split('::').pop() || 'COIN');
                    if (isApt) {
                      balanceVal = bal;
                      weiVal = String(rawVal);
                    }
                    nonEvmTokens.push({
                      symbol: sym,
                      name: isApt ? 'Aptos' : `${sym} (Aptos)`,
                      contractAddress: coinType,
                      balance: bal,
                      weiString: String(rawVal),
                      formattedBalance: formatBalanceNumber(bal),
                      isNative: isApt
                    });
                  }
                }
              }
            }
          }
        } else if (chain.id === 999997) { // Stellar
          const apiRes = await fetch(`https://horizon.stellar.org/accounts/${addr}`, { signal: AbortSignal.timeout(3500) });
          if (apiRes.ok) {
            const json: any = await apiRes.json();
            if (Array.isArray(json?.balances)) {
              for (const b of json.balances) {
                const numBal = parseFloat(b.balance);
                if (numBal > 0) {
                  const isNative = b.asset_type === 'native';
                  const sym = isNative ? 'XLM' : (b.asset_code || 'TOKEN');
                  if (isNative) {
                    balanceVal = numBal;
                    weiVal = String(Math.floor(numBal * 1e7));
                  }
                  nonEvmTokens.push({
                    symbol: sym,
                    name: isNative ? 'Stellar Lumens' : sym,
                    contractAddress: b.asset_issuer,
                    balance: numBal,
                    weiString: String(Math.floor(numBal * 1e7)),
                    formattedBalance: formatBalanceNumber(numBal),
                    isNative
                  });
                }
              }
            }
          }
        } else if (chain.id === 999998) { // XRP Ledger
          const rpcRes = await fetch('https://xrplcluster.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'account_info', params: [{ account: addr, ledger_index: 'validated' }] }),
            signal: AbortSignal.timeout(3500)
          });
          if (rpcRes.ok) {
            const json: any = await rpcRes.json();
            const drops = Number(json?.result?.account_data?.Balance);
            if (drops > 0) {
              balanceVal = drops / 1e6;
              weiVal = String(drops);
              nonEvmTokens.push({
                symbol: 'XRP',
                name: 'XRP Ledger',
                balance: balanceVal,
                weiString: weiVal,
                formattedBalance: formatBalanceNumber(balanceVal),
                isNative: true
              });
            }
          }
        } else if (chain.id === 999999) { // TON
          const apiRes = await fetch(`https://toncenter.com/api/v2/getAddressBalance?address=${addr}`, { signal: AbortSignal.timeout(3500) });
          if (apiRes.ok) {
            const json: any = await apiRes.json();
            const nano = Number(json?.result);
            if (nano > 0) {
              balanceVal = nano / 1e9;
              weiVal = String(nano);
              nonEvmTokens.push({
                symbol: 'TON',
                name: 'The Open Network',
                balance: balanceVal,
                weiString: weiVal,
                formattedBalance: formatBalanceNumber(balanceVal),
                isNative: true
              });
            }
          }
        } else if (chain.id === 1000000) { // NEAR
          const rpcRes = await fetch('https://rpc.mainnet.near.org', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: addr } }),
            signal: AbortSignal.timeout(3500)
          });
          if (rpcRes.ok) {
            const json: any = await rpcRes.json();
            const rawAmount = json?.result?.amount;
            if (rawAmount) {
              try {
                const big = BigInt(rawAmount);
                if (big > 0n) {
                  balanceVal = Number(big / 1000000000000000000n) / 1e6;
                  weiVal = rawAmount;
                  nonEvmTokens.push({
                    symbol: 'NEAR',
                    name: 'NEAR Protocol',
                    balance: balanceVal,
                    weiString: weiVal,
                    formattedBalance: formatBalanceNumber(balanceVal),
                    isNative: true
                  });
                }
              } catch {}
            }
          }
        } else if (chain.id === 1000002) { // Cosmos Hub
          const apiRes = await fetch(`https://rest.cosmos.directory/cosmos/cosmos/bank/v1beta1/balances/${addr}`, { signal: AbortSignal.timeout(3500) });
          if (apiRes.ok) {
            const json: any = await apiRes.json();
            if (Array.isArray(json?.balances)) {
              for (const b of json.balances) {
                const raw = Number(b.amount);
                if (raw > 0) {
                  const isAtom = b.denom === 'uatom';
                  const bal = isAtom ? raw / 1e6 : raw;
                  const sym = isAtom ? 'ATOM' : b.denom.toUpperCase();
                  if (isAtom) {
                    balanceVal = bal;
                    weiVal = String(raw);
                  }
                  nonEvmTokens.push({
                    symbol: sym,
                    name: isAtom ? 'Cosmos Hub' : sym,
                    balance: bal,
                    weiString: String(raw),
                    formattedBalance: formatBalanceNumber(bal),
                    isNative: isAtom
                  });
                }
              }
            }
          }
        } else if (chain.id === 1000005) { // Litecoin
          const apiRes = await fetch(`https://litecoinspace.org/api/address/${addr}`, { signal: AbortSignal.timeout(3500) });
          if (apiRes.ok) {
            const json: any = await apiRes.json();
            if (json?.chain_stats) {
              const sat = (Number(json.chain_stats.funded_txo_sum) || 0) - (Number(json.chain_stats.spent_txo_sum) || 0);
              if (sat > 0) {
                balanceVal = sat / 1e8;
                weiVal = sat.toString();
                nonEvmTokens.push({
                  symbol: 'LTC',
                  name: 'Litecoin',
                  balance: balanceVal,
                  weiString: weiVal,
                  formattedBalance: formatBalanceNumber(balanceVal),
                  isNative: true
                });
              }
            }
          }
        } else if (chain.id === 1000006) { // Dogecoin
          const apiRes = await fetch(`https://dogechain.info/api/v1/address/balance/${addr}`, { signal: AbortSignal.timeout(3500) });
          if (apiRes.ok) {
            const json: any = await apiRes.json();
            const bal = parseFloat(json?.balance);
            if (bal > 0) {
              balanceVal = bal;
              weiVal = String(Math.floor(bal * 1e8));
              nonEvmTokens.push({
                symbol: 'DOGE',
                name: 'Dogecoin',
                balance: balanceVal,
                weiString: weiVal,
                formattedBalance: formatBalanceNumber(balanceVal),
                isNative: true
              });
            }
          }
        }
      } catch (e) {}

      const positiveTokens = nonEvmTokens.filter(t => typeof t.balance === 'number' && t.balance > 0);
      const isTargeted = requestedChainIds && requestedChainIds.includes(Number(chain.id));
      if (positiveTokens.length > 0 || isTargeted) {
        return {
          ...chain,
          balance: balanceVal,
          weiString: weiVal,
          formattedBalance: formatBalanceNumber(balanceVal),
          tokens: positiveTokens,
          lastUpdated: Date.now()
        };
      }
      return null;
    });

    const [evmResults, nonEvmResults] = await Promise.all([
      Promise.all(evmPromises),
      Promise.all(nonEvmPromises)
    ]);

    const activeNetworksWithBalance = [...evmResults, ...nonEvmResults].filter((n): n is any => n !== null);

    const payload = {
      success: true,
      activeNetworksWithBalance,
      totalActiveCount: activeNetworksWithBalance.length,
      scannedAt: Date.now(),
    };

    balanceCache.set(cacheKey, { timestamp: Date.now(), data: payload });

    return res.json(payload);
  } catch (err: any) {
    console.error('[API /api/scan-balances] Error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to scan network balances',
      activeNetworksWithBalance: [],
      totalActiveCount: 0,
    });
  }
});


// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Vite mounting
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Full-Stack Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Error]:', err);
});
