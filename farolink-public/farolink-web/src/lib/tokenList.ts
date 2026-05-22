export interface TokenInfo { chainId:number; address:string; symbol:string; name:string; decimals:number; logoURI:string; tags?:string[]; }
const CG = 'https://assets.coingecko.com/coins/images';
const L = (n:string) => `${CG}/${n}`;

// Fix M-2: Detect sequential mock addresses used during testnet development.
// Addresses like 0x0000...0001, 0x0000...0002 are placeholders — NOT real contracts.
// This guard prevents accidentally deploying with placeholders in production.
const MOCK_ADDRESS_RE = /^0x0{38}[0-9a-f]{2}$/i;
function isMockAddress(addr: string): boolean {
  return MOCK_ADDRESS_RE.test(addr);
}

/**
 * Must be called once at app startup (see main.tsx).
 * Throws in production if any Pharos mainnet (chainId 688688) token still uses a mock address.
 */
export function assertTokenAddressesAreReal(): void {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) {
    const mocks = TOKENS.filter(t => t.chainId === 688689 && isMockAddress(t.address));
    if (mocks.length > 0) {
      throw new Error(
        `[FaroLink] Production build contains ${mocks.length} mock token address(es) on Pharos (chainId 688689). ` +
        `Replace all 0x0000...00XX addresses with real deployed contract addresses before deploying to mainnet. ` +
        `Tokens: ${mocks.map(t => t.symbol).join(', ')}`
      );
    }
  }
}

export const TOKENS: TokenInfo[] = [

  // ─── Pharos Atlantic Testnet (chainId 688689) — AUTO-VERIFIED on-chain addresses ───
  // Resolved from live DEX pair contracts via Pharos Atlantic RPC (2026-05-17)
  // Re-run: node scratch/discover_all_pools.js to refresh
  {chainId:688689,address:'0x7d211f77525ea39a0592794f793cc1036eeaccd5',symbol:'WETH',  name:'Wrapped Ether',         decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0xe0be08c77f415f577a1b3a9ad7a1df1479564ec8',symbol:'USDC',  name:'USD Coin',              decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:688689,address:'0xe7e84b8b4f39c507499c40b4ac199b050e2882d5',symbol:'USDT',  name:'Tether USD',            decimals:6, logoURI:L('325/small/Tether.png'),        tags:['stablecoin']},
  {chainId:688689,address:'0x0c64f03eea5c30946d5c55b4b532d08ad74638a4',symbol:'WBTC',  name:'Wrapped Bitcoin',       decimals:18,logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:688689,address:'0x838800b758277cc111b2d48ab01e5e164f8e9471',symbol:'WPHRS', name:'Wrapped PHRS',          decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0x0000000000000000000000000000000000000000',symbol:'PHRS',  name:'Pharos',                decimals:18,logoURI:L('279/small/ethereum.png'),        tags:['native']},
  {chainId:688689,address:'0x4436c5e183e6b3ad64a83f6d0a82a030d81c08cf',symbol:'SAFI',  name:'SAFI Token',            decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C',symbol:'USDM',  name:'Mountain Protocol USD', decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:688689,address:'0x96f6ef951840721adbf46ac996b59e0235cb985c',symbol:'USDY',  name:'Ondo US Dollar Yield',  decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  // Pharos structured tokens (discovered from on-chain DEX pairs)
  {chainId:688689,address:'0x4de6a1d9b8a541221031296506c19536efdf177a',symbol:'SS-UST-30JUN2026',    name:'Superstate UST Jun 2026',   decimals:18,logoURI:L('279/small/ethereum.png'),tags:['rwa']},
  {chainId:688689,address:'0x93bc7267d802201e51926bef331de80c965ec55f',symbol:'S-UST',               name:'Superstate UST',            decimals:18,logoURI:L('279/small/ethereum.png'),tags:['rwa']},
  {chainId:688689,address:'0xd97d27e267d8ee5ed346366828791378f9e0145b',symbol:'AQ-UST',              name:'Aqua UST',                  decimals:18,logoURI:L('279/small/ethereum.png'),tags:['rwa']},
  {chainId:688689,address:'0xc3643070a6e7aace696710e3a685108d93c09ad6',symbol:'C-UST',               name:'Compound UST',              decimals:18,logoURI:L('279/small/ethereum.png'),tags:['rwa']},
  {chainId:688689,address:'0x2bb80cfd6f2b14f6b93b1269c9a19f2dc0933344',symbol:'P-UST',               name:'Pendle UST',                decimals:18,logoURI:L('279/small/ethereum.png'),tags:['rwa']},
  {chainId:688689,address:'0xa020cd049acd8725100b7bb800557f7cc1adfb66',symbol:'C-TPC',               name:'Compound TPC',              decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0xbf43ff0baff5f9a38a5c278b92b8a65750122129',symbol:'P-TPC',               name:'Pendle TPC',                decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0x6bb00ad0c718d1227b8f96a422e47aa7c5efca47',symbol:'S-TPC',               name:'Superstate TPC',            decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0xc3206025fcc8bd0414ae315936e8c4df64afa570',symbol:'AQ-TPC',              name:'Aqua TPC',                  decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0xdf13c9d473cfbcea9cacae75f877927b7302d8e7',symbol:'SS-TPC-31DEC2026',    name:'Superstate TPC Dec 2026',   decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0x9306bb32b6211bc409466354178fb61f25d75eb0',symbol:'SS-STNOVA-31DEC2026', name:'Superstate stNova Dec 2026',decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0xcf2bdbae0271dd07cceee55d09808d35c6c51014',symbol:'S-stNova',            name:'Superstate stNova',         decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0xe2e9f3b60115bcb516ec0395e864e4785def751f',symbol:'P-stNova',            name:'Pendle stNova',             decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:688689,address:'0x568188ecd98429f5f4c14b4cfd548cd51d443a09',symbol:'AQ-stNova',           name:'Aqua stNova',               decimals:18,logoURI:L('279/small/ethereum.png')},


  // ─── Ethereum Mainnet 1 ───────────────────────────────────────────────────
  {chainId:1,address:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',symbol:'WETH',  name:'Wrapped Ether',         decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:1,address:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',symbol:'USDC',  name:'USD Coin',              decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:1,address:'0xdAC17F958D2ee523a2206206994597C13D831ec7',symbol:'USDT',  name:'Tether USD',            decimals:6, logoURI:L('325/small/Tether.png'),tags:['stablecoin']},
  {chainId:1,address:'0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',symbol:'WBTC',  name:'Wrapped Bitcoin',       decimals:8, logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:1,address:'0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C',symbol:'USDM',  name:'Mountain Protocol USD',decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:1,address:'0x96f6ef951840721adbf46ac996b59e0235cb985c',symbol:'USDY',  name:'Ondo US Dollar Yield', decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:1,address:'0x6B175474E89094C44Da98b954EedeAC495271d0F',symbol:'DAI',   name:'Dai Stablecoin',        decimals:18,logoURI:L('9956/small/Badge_Dai.png'),tags:['stablecoin']},
  {chainId:1,address:'0x514910771AF9Ca656af840dff83E8264EcF986CA',symbol:'LINK',  name:'Chainlink',             decimals:18,logoURI:L('877/small/chainlink-new-logo.png')},
  {chainId:1,address:'0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',symbol:'UNI',   name:'Uniswap',               decimals:18,logoURI:L('12504/small/uniswap-uni.png')},
  {chainId:1,address:'0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',symbol:'AAVE',  name:'Aave',                  decimals:18,logoURI:L('12645/small/AAVE.png')},
  {chainId:1,address:'0xD533a949740bb3306d119CC777fa900bA034cd52',symbol:'CRV',   name:'Curve DAO Token',       decimals:18,logoURI:L('12124/small/Curve.png')},
  {chainId:1,address:'0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',symbol:'MKR',   name:'Maker',                 decimals:18,logoURI:L('1364/small/Mark_Maker.png')},
  {chainId:1,address:'0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',symbol:'LDO',   name:'Lido DAO',              decimals:18,logoURI:L('13573/small/Lido_DAO.png')},
  {chainId:1,address:'0xc00e94Cb662C3520282E6f5717214004A7f26888',symbol:'COMP',  name:'Compound',              decimals:18,logoURI:L('10775/small/COMP.png')},
  {chainId:1,address:'0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6f',symbol:'SNX',   name:'Synthetix',             decimals:18,logoURI:L('3406/small/SNX.png')},
  {chainId:1,address:'0xba100000625a3754423978a60c9317c58a424e3D',symbol:'BAL',   name:'Balancer',              decimals:18,logoURI:L('11683/small/Balancer.png')},
  {chainId:1,address:'0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',symbol:'stETH', name:'Lido Staked Ether',     decimals:18,logoURI:L('13442/small/steth_logo.png'),tags:['lst']},
  {chainId:1,address:'0xae78736Cd615f374D3085123A210448E74Fc6393',symbol:'rETH',  name:'Rocket Pool ETH',       decimals:18,logoURI:L('20764/small/reth.png'),tags:['lst']},
  {chainId:1,address:'0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',symbol:'wstETH',name:'Wrapped stETH',        decimals:18,logoURI:L('18834/small/wstETH.png'),tags:['lst']},
  {chainId:1,address:'0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',symbol:'cbETH', name:'Coinbase Staked ETH',   decimals:18,logoURI:L('27008/small/cbeth.png'),tags:['lst']},
  {chainId:1,address:'0x853d955aCEf822Db058eb8505911ED77F175b99e',symbol:'FRAX',  name:'Frax',                  decimals:18,logoURI:L('13422/small/frax_share.png'),tags:['stablecoin']},
  {chainId:1,address:'0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',symbol:'LUSD',  name:'Liquity USD',           decimals:18,logoURI:L('14666/small/Group_3.png'),tags:['stablecoin']},
  {chainId:1,address:'0x111111111117dC0aa78b770fA6A738034120C302',symbol:'1INCH', name:'1inch',                 decimals:18,logoURI:L('13469/small/1inch-token.png')},
  {chainId:1,address:'0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',symbol:'CVX',   name:'Convex Finance',        decimals:18,logoURI:L('15585/small/convex.png')},
  {chainId:1,address:'0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0',symbol:'FXS',   name:'Frax Share',            decimals:18,logoURI:L('13423/small/frax_share.png')},
  {chainId:1,address:'0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',symbol:'YFI',   name:'yearn.finance',         decimals:18,logoURI:L('11849/small/yfi-192x192.png')},
  {chainId:1,address:'0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',symbol:'SUSHI', name:'SushiSwap',             decimals:18,logoURI:L('12271/small/512x512_Logo_no_chop.png')},
  {chainId:1,address:'0xD33526068D116cE69F19A9ee46F0bd304F21A51f',symbol:'RPL',   name:'Rocket Pool',           decimals:18,logoURI:L('20764/small/reth.png')},
  {chainId:1,address:'0xc944E90C64B2c07662A292be6244BDf05Cda44a7',symbol:'GRT',   name:'The Graph',             decimals:18,logoURI:L('13397/small/Graph_Token.png')},
  {chainId:1,address:'0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF',symbol:'IMX',   name:'Immutable X',           decimals:18,logoURI:L('17233/small/immutableX-symbol-BLK-RGB.png')},
  {chainId:1,address:'0x4d224452801ACEd8B2F0aebE155379bb5D594381',symbol:'APE',   name:'ApeCoin',               decimals:18,logoURI:L('24383/small/apecoin.jpg')},
  {chainId:1,address:'0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',symbol:'ENS',   name:'Ethereum Name Service', decimals:18,logoURI:L('25613/small/ENS.png')},
  {chainId:1,address:'0x6982508145454Ce325dDbE47a25d4ec3d2311933',symbol:'PEPE',  name:'Pepe',                  decimals:18,logoURI:L('29850/small/pepe-token.jpeg')},
  {chainId:1,address:'0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',symbol:'SHIB',  name:'Shiba Inu',             decimals:18,logoURI:L('11939/small/shiba.png')},
  {chainId:1,address:'0x808507121B80c02388fAd14726482e061B8da827',symbol:'PENDLE',name:'Pendle',                decimals:18,logoURI:L('15Higher/small/pendle-chart-logo.png')},
  {chainId:1,address:'0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',symbol:'MATIC', name:'Polygon',               decimals:18,logoURI:L('4713/small/matic-token-icon.png')},
  {chainId:1,address:'0x5026F006B85729a8b14553FAE6af249aD19335d1',symbol:'PYUSD', name:'PayPal USD',            decimals:6, logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin']},
  {chainId:1,address:'0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24',symbol:'RNDR',  name:'Render Token',          decimals:18,logoURI:L('11636/small/rndr.png')},
  {chainId:1,address:'0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30',symbol:'INJ',   name:'Injective',             decimals:18,logoURI:L('12882/small/Secondary_Symbol.png')},
  {chainId:1,address:'0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',symbol:'ARB',   name:'Arbitrum',              decimals:18,logoURI:L('16547/small/photo_2023-03-29_21.47.00.jpeg')},
  {chainId:1,address:'0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b',symbol:'AXS',   name:'Axie Infinity',         decimals:18,logoURI:L('13029/small/axie_infinity_logo.png')},
  {chainId:1,address:'0x3845badAde8e6dFF049820680d1F14bD3903a5d0',symbol:'SAND',  name:'The Sandbox',           decimals:18,logoURI:L('12129/small/sandbox_logo.jpg')},
  {chainId:1,address:'0x0F5D2fB29fb7d3CFeE444a200298f468908cC942',symbol:'MANA',  name:'Decentraland',          decimals:18,logoURI:L('878/small/decentraland-mana.png')},
  {chainId:1,address:'0xB64ef51C888972c908CFacf59B47C1AfBC0Ab8aC',symbol:'STORJ', name:'Storj',                 decimals:8, logoURI:L('3855/small/storj.png')},
  {chainId:1,address:'0x58b6A8A3302369DAEc383334672404Ee733aB239',symbol:'LPT',   name:'Livepeer',              decimals:18,logoURI:L('7858/small/livepeer-token.png')},
  {chainId:1,address:'0x090185f2135308BaD17527004364eBcC2D37e5F',symbol:'SPELL', name:'Spell Token',           decimals:18,logoURI:L('15861/small/abracadabra-3.png')},
  {chainId:1,address:'0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF',symbol:'ALCX',  name:'Alchemix',              decimals:18,logoURI:L('14113/small/Alchemix_logo.png')},
  {chainId:1,address:'0x4691937a7508860F876c9c0a2a617E7d9E945D4B',symbol:'WOO',   name:'WOO Network',           decimals:18,logoURI:L('12921/small/WOO_logotype.png')},
  {chainId:1,address:'0x6810e776880C02933D47DB1b9fc05908e5386b96',symbol:'GNO',   name:'Gnosis',                decimals:18,logoURI:L('662/small/logo_square_simple_300px.png')},
  {chainId:1,address:'0x9D79d5B61De59D882ce90125b18F74af650acB93',symbol:'NBTC',  name:'Nomic Bitcoin',         decimals:8, logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:1,address:'0x4Fabb145d64652a948d72533023f6E7A623C7C53',symbol:'BUSD',  name:'Binance USD',           decimals:18,logoURI:L('9576/small/BUSD.png'),tags:['stablecoin']},
  {chainId:1,address:'0x8207c1FfC5B6804F6024322CcF34F29c3541Ae26',symbol:'OGN',   name:'Origin Protocol',       decimals:18,logoURI:L('3298/small/op.jpg')},
  // ─── Polygon 137 ──────────────────────────────────────────────────────────
  {chainId:137,address:'0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',symbol:'WMATIC',name:'Wrapped Matic',        decimals:18,logoURI:L('4713/small/matic-token-icon.png')},
  {chainId:137,address:'0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C',symbol:'USDM',  name:'Mountain Protocol USD',decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:137,address:'0x96f6ef951840721adbf46ac996b59e0235cb985c',symbol:'USDY',  name:'Ondo US Dollar Yield', decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:137,address:'0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',symbol:'WETH',  name:'Wrapped Ether',        decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:137,address:'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',symbol:'USDC',  name:'USD Coin',             decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:137,address:'0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',symbol:'USDC.e',name:'Bridged USDC',         decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:137,address:'0xc2132D05D31c914a87C6611C10748AEb04B58e8F',symbol:'USDT',  name:'Tether USD',           decimals:6, logoURI:L('325/small/Tether.png'),tags:['stablecoin']},
  {chainId:137,address:'0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',symbol:'DAI',   name:'Dai Stablecoin',       decimals:18,logoURI:L('9956/small/Badge_Dai.png'),tags:['stablecoin']},
  {chainId:137,address:'0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',symbol:'WBTC',  name:'Wrapped Bitcoin',      decimals:8, logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:137,address:'0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',symbol:'LINK',  name:'Chainlink',            decimals:18,logoURI:L('877/small/chainlink-new-logo.png')},
  {chainId:137,address:'0xD6DF932A45C0f255f85145f286eA0b292B21C90B',symbol:'AAVE',  name:'Aave',                 decimals:18,logoURI:L('12645/small/AAVE.png')},
  {chainId:137,address:'0x172370d5Cd63279eFa6d502DAB29171933a610AF',symbol:'CRV',   name:'Curve DAO',            decimals:18,logoURI:L('12124/small/Curve.png')},
  {chainId:137,address:'0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89',symbol:'FRAX',  name:'Frax',                 decimals:18,logoURI:L('13422/small/frax_share.png'),tags:['stablecoin']},
  {chainId:137,address:'0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A7',symbol:'BAL',   name:'Balancer',             decimals:18,logoURI:L('11683/small/Balancer.png')},
  {chainId:137,address:'0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',symbol:'SUSHI', name:'SushiSwap',            decimals:18,logoURI:L('12271/small/512x512_Logo_no_chop.png')},
  {chainId:137,address:'0xb33EaAd8d922B1083446DC23f610c2567fB5180f',symbol:'UNI',   name:'Uniswap',              decimals:18,logoURI:L('12504/small/uniswap-uni.png')},
  {chainId:137,address:'0x831753DD7087CaC61aB5644b308642cc1c33Dc13',symbol:'QUICK', name:'QuickSwap',            decimals:18,logoURI:L('13970/small/1617remaintoken.png')},
  {chainId:137,address:'0x3a58a54c066fdc0f2d55fc9c89f0415c92ebf3c4',symbol:'stMATIC',name:'Staked MATIC',        decimals:18,logoURI:L('24463/small/stMATIC.png'),tags:['lst']},
  {chainId:137,address:'0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6',symbol:'MaticX', name:'Stader MaticX',        decimals:18,logoURI:L('28791/small/MaticX.png'),tags:['lst']},
  {chainId:137,address:'0x50B728D8D964fd00C2d0AAD81718b71311feF68a',symbol:'SNX',   name:'Synthetix',            decimals:18,logoURI:L('3406/small/SNX.png')},
  {chainId:137,address:'0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c',symbol:'COMP',  name:'Compound',             decimals:18,logoURI:L('10775/small/COMP.png')},
  {chainId:137,address:'0x6f7C932e7684666C9fd1d44527765433e01fF61d',symbol:'MKR',   name:'Maker',                decimals:18,logoURI:L('1364/small/Mark_Maker.png')},
  {chainId:137,address:'0xDA537104D6A5edd53c6fBba9A898708E465260b6',symbol:'YFI',   name:'yearn.finance',        decimals:18,logoURI:L('11849/small/yfi-192x192.png')},
  {chainId:137,address:'0x5fe2B58c013d7601147DcdD68C143277AbD10425',symbol:'GRT',   name:'The Graph',            decimals:18,logoURI:L('13397/small/Graph_Token.png')},
  {chainId:137,address:'0x61299774020dA444Af134c82fa83E3810b309991',symbol:'RNDR',  name:'Render Token',         decimals:18,logoURI:L('11636/small/rndr.png')},
  {chainId:137,address:'0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f',symbol:'1INCH', name:'1inch',                decimals:18,logoURI:L('13469/small/1inch-token.png')},
  {chainId:137,address:'0xC3C7d422809852031b44ab29EEC9F1EfF2A58756',symbol:'LDO',   name:'Lido DAO',             decimals:18,logoURI:L('13573/small/Lido_DAO.png')},
  {chainId:137,address:'0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7',symbol:'GHST',  name:'Aavegotchi',           decimals:18,logoURI:L('12467/small/ghst_token.png')},
  {chainId:137,address:'0xBbba073C31bF03b8ACf7c28EF0738DeCF3695683',symbol:'SAND',  name:'The Sandbox',          decimals:18,logoURI:L('12129/small/sandbox_logo.jpg')},
  {chainId:137,address:'0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4',symbol:'MANA',  name:'Decentraland',         decimals:18,logoURI:L('878/small/decentraland-mana.png')},
  {chainId:137,address:'0x61BDD9C7d4dF4Bf47A4508c0c8245505F2Af5b7b',symbol:'AXS',   name:'Axie Infinity',        decimals:18,logoURI:L('13029/small/axie_infinity_logo.png')},
  {chainId:137,address:'0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD',symbol:'wstETH',name:'Wrapped stETH',        decimals:18,logoURI:L('18834/small/wstETH.png'),tags:['lst']},
  {chainId:137,address:'0x4e3Decbb3645551B8A19f0eA1678079FCB33fB4c',symbol:'jEUR',  name:'Jarvis Euro',          decimals:18,logoURI:L('17385/small/jEUR.png'),tags:['stablecoin']},
  {chainId:137,address:'0xe0B52e49357Fd4DAf2c15e02058DCE6BC0057db4',symbol:'agEUR', name:'agEUR',                decimals:18,logoURI:L('19479/small/agEUR.png'),tags:['stablecoin']},
  {chainId:137,address:'0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756',symbol:'TUSD',  name:'TrueUSD',              decimals:18,logoURI:L('3449/small/tusd.png'),tags:['stablecoin']},
  {chainId:137,address:'0x4B016aA2d1A89F0B7a55B12c8B8b77DC5C9a8b9',symbol:'PENDLE',name:'Pendle',               decimals:18,logoURI:L('15Higher/small/pendle-chart-logo.png')},
  {chainId:137,address:'0x8f3360fb57f5c0fb8a05c5bcbf671e1db3db5e6D',symbol:'IMX',   name:'Immutable X',          decimals:18,logoURI:L('17233/small/immutableX-symbol-BLK-RGB.png')},
  {chainId:137,address:'0xd6df932a45c0f255f85145f286ea0b292b21c90b',symbol:'AAVE',  name:'Aave (v2)',             decimals:18,logoURI:L('12645/small/AAVE.png')},
  // ─── Arbitrum 42161 ───────────────────────────────────────────────────────
  {chainId:42161,address:'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',symbol:'WETH',  name:'Wrapped Ether',        decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:42161,address:'0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C',symbol:'USDM',  name:'Mountain Protocol USD',decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:42161,address:'0x96f6ef951840721adbf46ac996b59e0235cb985c',symbol:'USDY',  name:'Ondo US Dollar Yield', decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:42161,address:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',symbol:'USDC',  name:'USD Coin',             decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:42161,address:'0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',symbol:'USDC.e',name:'Bridged USDC',         decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:42161,address:'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',symbol:'USDT',  name:'Tether USD',           decimals:6, logoURI:L('325/small/Tether.png'),tags:['stablecoin']},
  {chainId:42161,address:'0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',symbol:'DAI',   name:'Dai Stablecoin',       decimals:18,logoURI:L('9956/small/Badge_Dai.png'),tags:['stablecoin']},
  {chainId:42161,address:'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',symbol:'WBTC',  name:'Wrapped Bitcoin',      decimals:8, logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:42161,address:'0x912CE59144191C1204E64559FE8253a0e49E6548',symbol:'ARB',   name:'Arbitrum',             decimals:18,logoURI:L('16547/small/photo_2023-03-29_21.47.00.jpeg')},
  {chainId:42161,address:'0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',symbol:'GMX',   name:'GMX',                  decimals:18,logoURI:L('18323/small/arbit.png')},
  {chainId:42161,address:'0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',symbol:'LINK',  name:'Chainlink',            decimals:18,logoURI:L('877/small/chainlink-new-logo.png')},
  {chainId:42161,address:'0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',symbol:'PENDLE',name:'Pendle',               decimals:18,logoURI:L('15Higher/small/pendle-chart-logo.png')},
  {chainId:42161,address:'0x3082CC23568eA640225c2467653dB90e9250AaA0',symbol:'RDNT',  name:'Radiant Capital',      decimals:18,logoURI:L('26536/small/Radiant200x200.png')},
  {chainId:42161,address:'0x18c11FD286C5EC11c3b683Caa813B77f5163A122',symbol:'GNS',   name:'Gains Network',        decimals:18,logoURI:L('19737/small/logo.png')},
  {chainId:42161,address:'0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978',symbol:'CRV',   name:'Curve DAO',            decimals:18,logoURI:L('12124/small/Curve.png')},
  {chainId:42161,address:'0xba5DdD1f9d7F570dc94a51479a000E3BCE967196',symbol:'AAVE',  name:'Aave',                 decimals:18,logoURI:L('12645/small/AAVE.png')},
  {chainId:42161,address:'0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',symbol:'UNI',   name:'Uniswap',              decimals:18,logoURI:L('12504/small/uniswap-uni.png')},
  {chainId:42161,address:'0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',symbol:'FRAX',  name:'Frax',                 decimals:18,logoURI:L('13422/small/frax_share.png'),tags:['stablecoin']},
  {chainId:42161,address:'0x6694340fc020c5E6B96567843da2df01b2CE1eb6',symbol:'STG',   name:'Stargate Finance',     decimals:18,logoURI:L('18143/small/stargate.png')},
  {chainId:42161,address:'0x539bdE0d7Dbd336b79148AA742883198BBF60342',symbol:'MAGIC', name:'Magic',                decimals:18,logoURI:L('18623/small/magic.png')},
  {chainId:42161,address:'0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',symbol:'LDO',   name:'Lido DAO',             decimals:18,logoURI:L('13573/small/Lido_DAO.png')},
  {chainId:42161,address:'0x5979D7b546E38E414F7E9822514be443A4800529',symbol:'wstETH',name:'Wrapped stETH',        decimals:18,logoURI:L('18834/small/wstETH.png'),tags:['lst']},
  {chainId:42161,address:'0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA',symbol:'rETH',  name:'Rocket Pool ETH',      decimals:18,logoURI:L('20764/small/reth.png'),tags:['lst']},
  {chainId:42161,address:'0x93b346b6BC2548dA6A1E7d98E9a421B42541425b',symbol:'LUSD',  name:'Liquity USD',          decimals:18,logoURI:L('14666/small/Group_3.png'),tags:['stablecoin']},
  {chainId:42161,address:'0x6dAf586B7370B14163171544fca24AbcC0862ac5',symbol:'PREMIA',name:'Premia',               decimals:18,logoURI:L('11223/small/Premia.png')},
  {chainId:42161,address:'0xaeF5bbcbFa438519a5ea80B4c7181B4E78d419f2',symbol:'RAI',   name:'Rai Reflex Index',     decimals:18,logoURI:L('14004/small/RAI-logo-coin.png'),tags:['stablecoin']},
  {chainId:42161,address:'0x09e18590E8f76b6Cf471b3cd75fE1A1a9D2B2c2',symbol:'AIDOGE',name:'ArbDoge AI',           decimals:6, logoURI:L('279/small/ethereum.png')},
  {chainId:42161,address:'0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF',symbol:'SPELL', name:'Spell Token',          decimals:18,logoURI:L('15861/small/abracadabra-3.png')},
  {chainId:42161,address:'0xcAFcD85D8ca7Ad1e1C6F82F651fA15E33AEfD07d',symbol:'WOO',   name:'WOO Network',          decimals:18,logoURI:L('12921/small/WOO_logotype.png')},
  {chainId:42161,address:'0x4D15a3A2286D883AF0AA1B3f21367843FAc63E07',symbol:'TUSD',  name:'TrueUSD',              decimals:18,logoURI:L('3449/small/tusd.png'),tags:['stablecoin']},
  {chainId:42161,address:'0x7DfF46370e9eA5f0Bad3C4E29711aD50062EA7A4',symbol:'SOL',   name:'Solana (Wormhole)',    decimals:9, logoURI:L('4128/small/solana.png')},
  {chainId:42161,address:'0xd85E038593d7A098614721EaE955EC2022B9B91B',symbol:'DOGE',  name:'Dogecoin (Bridged)',   decimals:8, logoURI:L('5/small/dogecoin.png')},
  {chainId:42161,address:'0xb87a436B93fFE9D75c5cFA7bAcFff96430325872',symbol:'SHIB',  name:'Shiba Inu',            decimals:18,logoURI:L('11939/small/shiba.png')},
  {chainId:42161,address:'0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB99',symbol:'PEPE',  name:'Pepe',                 decimals:18,logoURI:L('29850/small/pepe-token.jpeg')},
  {chainId:42161,address:'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb1',symbol:'COMP',  name:'Compound',             decimals:18,logoURI:L('10775/small/COMP.png')},
  {chainId:42161,address:'0x040d1EdC9569d4Bab2D15287Dc5A4F10F56a56B',symbol:'BAL',   name:'Balancer',             decimals:18,logoURI:L('11683/small/Balancer.png')},
  {chainId:42161,address:'0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55',symbol:'DPX',   name:'Dopex',                decimals:18,logoURI:L('16583/small/Dopex.png')},
  {chainId:42161,address:'0x10393c20975cF177a3513071bC110f7962CD67da',symbol:'JONES', name:'Jones DAO',            decimals:18,logoURI:L('20371/small/jones.png')},
  {chainId:42161,address:'0xD74f5255D557944cf7Dd0E45FF521520002D5748',symbol:'USDs',  name:'Sperax USD',           decimals:18,logoURI:L('16720/small/sperax-logo.png'),tags:['stablecoin']},
  {chainId:42161,address:'0x3d9907F9a368ad0a51Be60f7Da3b97cf940982D8',symbol:'GRAIL', name:'Camelot Token',        decimals:18,logoURI:L('26617/small/Camelot.png')},
  {chainId:42161,address:'0x9623063377AD1B27544C965cCd7342f7EA7e88C7',symbol:'GRT',   name:'The Graph',            decimals:18,logoURI:L('13397/small/Graph_Token.png')},
  {chainId:42161,address:'0xA0b862F60edEf4452F25B4160F177db44DeB6Cf1',symbol:'GNO',   name:'Gnosis',               decimals:18,logoURI:L('662/small/logo_square_simple_300px.png')},
  // ─── Base 8453 ────────────────────────────────────────────────────────────
  {chainId:8453,address:'0x4200000000000000000000000000000000000006',symbol:'WETH',  name:'Wrapped Ether',        decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C',symbol:'USDM',  name:'Mountain Protocol USD',decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:8453,address:'0x96f6ef951840721adbf46ac996b59e0235cb985c',symbol:'USDY',  name:'Ondo US Dollar Yield', decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:8453,address:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',symbol:'USDC',  name:'USD Coin',             decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',symbol:'DAI',   name:'Dai Stablecoin',       decimals:18,logoURI:L('9956/small/Badge_Dai.png'),tags:['stablecoin']},
  {chainId:8453,address:'0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',symbol:'USDbC', name:'USD Base Coin',         decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',symbol:'cbETH', name:'Coinbase Staked ETH',  decimals:18,logoURI:L('27008/small/cbeth.png'),tags:['lst']},
  {chainId:8453,address:'0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',symbol:'cbBTC', name:'Coinbase Wrapped BTC', decimals:8, logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:8453,address:'0x940181a94A35A4569E4529A3CDfB74e38FD98631',symbol:'AERO',  name:'Aerodrome Finance',    decimals:18,logoURI:L('29270/small/aerodrome.png')},
  {chainId:8453,address:'0x532f27101965dd16442E59d40670FaF5eBB142E4',symbol:'BRETT', name:'Brett',                decimals:18,logoURI:L('36290/small/brett.png')},
  {chainId:8453,address:'0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',symbol:'DEGEN', name:'Degen',                decimals:18,logoURI:L('34515/small/android-chrome-512x512.png')},
  {chainId:8453,address:'0xfA980cEd6895AC314E7dE34Ef1bFAE90a5AdD21b',symbol:'PRIME', name:'Echelon Prime',        decimals:18,logoURI:L('29733/small/PRIME_logo.png')},
  {chainId:8453,address:'0xA88594D539CB22bef2C55A576e38B8cd02d25f3b',symbol:'WELL',  name:'Morpho WELL',          decimals:18,logoURI:L('13512/small/aave_round_red.png')},
  {chainId:8453,address:'0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe',symbol:'HIGHER',name:'Higher',               decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0xaCFAee9D1dBe79E0B775063b3D85cc4F1a2aFf7a',symbol:'VIRTUAL',name:'Virtuals Protocol',   decimals:18,logoURI:L('33808/small/image.png')},
  {chainId:8453,address:'0x9e1028F5F1D5eDE59748FFceE5532509976840E0',symbol:'TOSHI', name:'Toshi',                decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x6921B130D297cc43754afba22e5EAc0FBf8Db75b',symbol:'doginme',name:'Dog In Me',           decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x4158734D47Fc9b5E40f7D8B5EDF32B2b26b0014A',symbol:'BALD',  name:'Bald',                 decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x940181a94A35A4569E4529A3CDfB74e38FD98632',symbol:'EURC',  name:'Euro Coin',            decimals:6, logoURI:L('26697/small/eurc.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415',symbol:'CRV',   name:'Curve DAO',            decimals:18,logoURI:L('12124/small/Curve.png')},
  {chainId:8453,address:'0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3',symbol:'DOLA',  name:'Dola USD',             decimals:18,logoURI:L('14287/small/dola.png'),tags:['stablecoin']},
  {chainId:8453,address:'0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c',symbol:'rETH',  name:'Rocket Pool ETH',      decimals:18,logoURI:L('20764/small/reth.png'),tags:['lst']},
  {chainId:8453,address:'0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',symbol:'wstETH',name:'Wrapped stETH',        decimals:18,logoURI:L('18834/small/wstETH.png'),tags:['lst']},
  {chainId:8453,address:'0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',symbol:'EURC',  name:'Euro Coin (EURC)',     decimals:6, logoURI:L('26697/small/eurc.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x78a087d713Be963Bf307b18F2Ff8122EF9A63ae9',symbol:'BSWAP', name:'BaseSwap',             decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x9B8Df6E244526ab5F6e6400d331DB28C8fdDdb55',symbol:'SEAM',  name:'Seamless Protocol',    decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CB',symbol:'USDbc2',name:'USD Base Coin v2',     decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:8453,address:'0xEB466342C4d449BC9f53A865D5Cb90586f405215',symbol:'axlUSDC',name:'Axelar USDC',         decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',symbol:'STG',   name:'Stargate Finance',     decimals:18,logoURI:L('18143/small/stargate.png')},
  {chainId:8453,address:'0xDE59C8f7557Ae0202F3Ce5B5B5e1067F7F80e7C5',symbol:'MOG',   name:'Mog Coin',             decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x22e6966B799c4D5B13BE962E1D117b56327FDa66',symbol:'SNX',   name:'Synthetix',            decimals:18,logoURI:L('3406/small/SNX.png')},
  {chainId:8453,address:'0x4621b7A9c75199271F773Ebd9A499dbd165c3191',symbol:'DOLA2', name:'Dola Stablecoin',      decimals:18,logoURI:L('14287/small/dola.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85',symbol:'SEAM2', name:'Seamless',             decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x0000206329b97DB379d5E1Bf586BbDB969C63274',symbol:'USDA',  name:'Angle USD',            decimals:18,logoURI:L('279/small/ethereum.png'),tags:['stablecoin']},
  {chainId:8453,address:'0x4200000000000000000000000000000000000042',symbol:'OP',    name:'Optimism (Bridged)',   decimals:18,logoURI:L('25244/small/Optimism.png')},
  {chainId:8453,address:'0x2db9e5e894e29B3e12a34E6e003fe64eE67B61Ac',symbol:'WELL2', name:'Moonwell WELL',        decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0x58c7B2828Cd3d35Cc66Df0D8a0F4A0E7B7c6A3e2',symbol:'GRT',   name:'The Graph',            decimals:18,logoURI:L('13397/small/Graph_Token.png')},
  {chainId:8453,address:'0x3bB4445D30AC020a84c1b5A8A2C6248ebC9779D0',symbol:'MIM',   name:'Magic Internet Money',decimals:18,logoURI:L('11846/small/Mim.png'),tags:['stablecoin']},
  {chainId:8453,address:'0xd5046B976188EB40f6DE40fB527F89c05b323385',symbol:'BSX',   name:'BaseX',                decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:8453,address:'0xd403D1624DAEF243FbcBd6d00d1e7A60fc3b3A12',symbol:'LINK',  name:'Chainlink',            decimals:18,logoURI:L('877/small/chainlink-new-logo.png')},
  {chainId:8453,address:'0xc3De830EA07524a0761646a6a4e4be0e114a3C83',symbol:'UNI',   name:'Uniswap',              decimals:18,logoURI:L('12504/small/uniswap-uni.png')},
  {chainId:8453,address:'0x63706e401c06ac8513145b7687A14804d17f814b',symbol:'AAVE',  name:'Aave',                 decimals:18,logoURI:L('12645/small/AAVE.png')},
  // ─── Optimism 10 ──────────────────────────────────────────────────────────
  {chainId:10,address:'0x4200000000000000000000000000000000000006',symbol:'WETH',  name:'Wrapped Ether',        decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:10,address:'0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C',symbol:'USDM',  name:'Mountain Protocol USD',decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:10,address:'0x96f6ef951840721adbf46ac996b59e0235cb985c',symbol:'USDY',  name:'Ondo US Dollar Yield', decimals:18,logoURI:L('31212/small/PYUSD_Logo_%282%29.png'),tags:['stablecoin','rwa']},
  {chainId:10,address:'0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',symbol:'USDC',  name:'USD Coin',             decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:10,address:'0x7F5c764cBc14f9669B88837ca1490cCa17c31607',symbol:'USDC.e',name:'Bridged USDC',         decimals:6, logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:10,address:'0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',symbol:'USDT',  name:'Tether USD',           decimals:6, logoURI:L('325/small/Tether.png'),tags:['stablecoin']},
  {chainId:10,address:'0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',symbol:'DAI',   name:'Dai Stablecoin',       decimals:18,logoURI:L('9956/small/Badge_Dai.png'),tags:['stablecoin']},
  {chainId:10,address:'0x68f180fcCe6836688e9084f035309E29Bf0A2095',symbol:'WBTC',  name:'Wrapped Bitcoin',      decimals:8, logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:10,address:'0x4200000000000000000000000000000000000042',symbol:'OP',    name:'Optimism',             decimals:18,logoURI:L('25244/small/Optimism.png')},
  {chainId:10,address:'0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',symbol:'LINK',  name:'Chainlink',            decimals:18,logoURI:L('877/small/chainlink-new-logo.png')},
  {chainId:10,address:'0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',symbol:'SNX',   name:'Synthetix',            decimals:18,logoURI:L('3406/small/SNX.png')},
  {chainId:10,address:'0x76FB31fb4af56892A25e32cFC43De717950c9278',symbol:'AAVE',  name:'Aave',                 decimals:18,logoURI:L('12645/small/AAVE.png')},
  {chainId:10,address:'0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db',symbol:'VELO',  name:'Velodrome Finance',    decimals:18,logoURI:L('25783/small/velo.png')},
  {chainId:10,address:'0x2E3D870790dC77A83DD1d18184Acc7439A53f475',symbol:'FRAX',  name:'Frax',                 decimals:18,logoURI:L('13422/small/frax_share.png'),tags:['stablecoin']},
  {chainId:10,address:'0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9',symbol:'sUSD',  name:'Synthetix USD',        decimals:18,logoURI:L('5765/small/sUSD.png'),tags:['stablecoin']},
  {chainId:10,address:'0x9e1028F5F1D5eDE59748FFceE5532509976840E0',symbol:'PERP',  name:'Perpetual Protocol',   decimals:18,logoURI:L('12381/small/perp.png')},
  {chainId:10,address:'0x6fd9d7AD17242c41f7131d257212c54A0e816691',symbol:'UNI',   name:'Uniswap',              decimals:18,logoURI:L('12504/small/uniswap-uni.png')},
  {chainId:10,address:'0xadDb6A0412DE1BA0F936DCaeb8D29Ac8F30a79bD',symbol:'cbETH', name:'Coinbase Staked ETH',  decimals:18,logoURI:L('27008/small/cbeth.png'),tags:['lst']},
  {chainId:10,address:'0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',symbol:'wstETH',name:'Wrapped stETH',        decimals:18,logoURI:L('18834/small/wstETH.png'),tags:['lst']},
  {chainId:10,address:'0x9Bcef72be871e61ED4fBbc7630889beE758eb81D',symbol:'rETH',  name:'Rocket Pool ETH',      decimals:18,logoURI:L('20764/small/reth.png'),tags:['lst']},
  {chainId:10,address:'0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',symbol:'LYRA',  name:'Lyra Finance',         decimals:18,logoURI:L('17604/small/lyra.png')},
  {chainId:10,address:'0x0b2C639c533813f4Aa9D7837CAf62653d097Ff86',symbol:'LUSD',  name:'Liquity USD',          decimals:18,logoURI:L('14666/small/Group_3.png'),tags:['stablecoin']},
  {chainId:10,address:'0xFdb794692724153d1488CcdBE0C56c252596735',symbol:'LDO',   name:'Lido DAO',             decimals:18,logoURI:L('13573/small/Lido_DAO.png')},
  {chainId:10,address:'0x3eaEb77b03dBc0F6321AE1b72b2E9aDb0F60112B',symbol:'DOLA',  name:'Dola USD',             decimals:18,logoURI:L('14287/small/dola.png'),tags:['stablecoin']},
  {chainId:10,address:'0x296F55F8Fb28E498B858d0BcDA06D955B2Cb3f97',symbol:'STG',   name:'Stargate Finance',     decimals:18,logoURI:L('18143/small/stargate.png')},
  {chainId:10,address:'0x4200000000000000000000000000000000000043',symbol:'USDA',  name:'Angle USD',            decimals:18,logoURI:L('279/small/ethereum.png'),tags:['stablecoin']},
  {chainId:10,address:'0x920Cf626a271321C151D027030D5d08aF699456b',symbol:'KWENTA',name:'Kwenta',               decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:10,address:'0x3c8B650257cFb5f272f799F5e2b4e65093a11a05',symbol:'VELO2', name:'Velodrome v2',         decimals:18,logoURI:L('25783/small/velo.png')},
  {chainId:10,address:'0xB0B195aEFA3650A6908f15CdaC7D92F8a5791B0B',symbol:'BOB',   name:'BOB Stablecoin',       decimals:18,logoURI:L('279/small/ethereum.png'),tags:['stablecoin']},
  {chainId:10,address:'0xfA011FC56b173B879b3b62E0F3e09b0B73B69E17',symbol:'THALES',name:'Thales',               decimals:18,logoURI:L('18388/small/thales.png')},
  {chainId:10,address:'0x67CCEA5bb16181E7b4109c9c2143c24a1c2205Be',symbol:'FXS',   name:'Frax Share',           decimals:18,logoURI:L('13423/small/frax_share.png')},
  {chainId:10,address:'0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f2',symbol:'GRT',   name:'The Graph',            decimals:18,logoURI:L('13397/small/Graph_Token.png')},
  {chainId:10,address:'0x3Bb4445D30AC020a84c1b5A8A2C6248ebC9779D1',symbol:'CRV',   name:'Curve DAO',            decimals:18,logoURI:L('12124/small/Curve.png')},
  {chainId:10,address:'0xd0b53D9277642d899DF5C87A3966A349A798F224',symbol:'ANKR',  name:'Ankr',                 decimals:18,logoURI:L('8104/small/ANKR.png')},
  {chainId:10,address:'0x09E16dF4e7B028F6De97714c5a8FB9e4a2C2b25b',symbol:'INJ',   name:'Injective',            decimals:18,logoURI:L('12882/small/Secondary_Symbol.png')},
  {chainId:10,address:'0x1eba7a6a72c894026Cd654AC5CDCF83A46445B08',symbol:'MKR',   name:'Maker',                decimals:18,logoURI:L('1364/small/Mark_Maker.png')},
  {chainId:10,address:'0x7e7d4467112689329f7E06571eD0E8CbAd4910eE',symbol:'COMP',  name:'Compound',             decimals:18,logoURI:L('10775/small/COMP.png')},
  {chainId:10,address:'0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f',symbol:'1INCH', name:'1inch',                decimals:18,logoURI:L('13469/small/1inch-token.png')},
  {chainId:10,address:'0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921',symbol:'BAL',   name:'Balancer',             decimals:18,logoURI:L('11683/small/Balancer.png')},
  {chainId:10,address:'0xB82bb6Ce9A249076Ca8EFC4C6D2e2a006C48c3cF',symbol:'YFI',   name:'yearn.finance',        decimals:18,logoURI:L('11849/small/yfi-192x192.png')},
  {chainId:10,address:'0x6b3595068778DD592e39A122f4f5a5cF09C90fE2',symbol:'SUSHI', name:'SushiSwap',            decimals:18,logoURI:L('12271/small/512x512_Logo_no_chop.png')},
  // ─── BNB Chain 56 ─────────────────────────────────────────────────────────
  {chainId:56,address:'0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',symbol:'WBNB',  name:'Wrapped BNB',          decimals:18,logoURI:L('825/small/bnb-icon2_2x.png')},
  {chainId:56,address:'0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',symbol:'USDC',  name:'USD Coin',             decimals:18,logoURI:L('6319/small/USD_Coin_icon.png'),tags:['stablecoin']},
  {chainId:56,address:'0x55d398326f99059fF775485246999027B3197955',symbol:'USDT',  name:'Tether USD',           decimals:18,logoURI:L('325/small/Tether.png'),tags:['stablecoin']},
  {chainId:56,address:'0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',symbol:'BUSD',  name:'Binance USD',          decimals:18,logoURI:L('9576/small/BUSD.png'),tags:['stablecoin']},
  {chainId:56,address:'0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',symbol:'DAI',   name:'Dai Stablecoin',       decimals:18,logoURI:L('9956/small/Badge_Dai.png'),tags:['stablecoin']},
  {chainId:56,address:'0x2170Ed0880ac9A755fd29B2688956BD959F933F8',symbol:'ETH',   name:'Ethereum (BEP20)',     decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:56,address:'0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',symbol:'BTCB',  name:'Bitcoin (BEP20)',      decimals:18,logoURI:L('7598/small/wrapped_bitcoin_wbtc.png')},
  {chainId:56,address:'0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',symbol:'CAKE',  name:'PancakeSwap',          decimals:18,logoURI:L('12632/small/pancakeswap-cake-logo.png')},
  {chainId:56,address:'0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',symbol:'LINK',  name:'Chainlink (BEP20)',    decimals:18,logoURI:L('877/small/chainlink-new-logo.png')},
  {chainId:56,address:'0xBf5140A22578168FD562DCcF235E5D43A02ce9B1',symbol:'UNI',   name:'Uniswap (BEP20)',      decimals:18,logoURI:L('12504/small/uniswap-uni.png')},
  {chainId:56,address:'0xfb6115445Bff7b52FeB98650C87f44907E58f802',symbol:'AAVE',  name:'Aave (BEP20)',         decimals:18,logoURI:L('12645/small/AAVE.png')},
  {chainId:56,address:'0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',symbol:'DOT',   name:'Polkadot (BEP20)',     decimals:18,logoURI:L('12171/small/polkadot.png')},
  {chainId:56,address:'0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',symbol:'ADA',   name:'Cardano (BEP20)',      decimals:18,logoURI:L('975/small/cardano.png')},
  {chainId:56,address:'0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBe',symbol:'XRP',   name:'XRP (BEP20)',          decimals:18,logoURI:L('44/small/xrp-symbol-white-128.png')},
  {chainId:56,address:'0x715D400F88C167884bbCc41C5FeA407ed4D2f8A0',symbol:'AXS',   name:'Axie Infinity',        decimals:18,logoURI:L('13029/small/axie_infinity_logo.png')},
  {chainId:56,address:'0xCC42724C6683B7E57334c4E856f4c9965ED682bD',symbol:'MATIC', name:'Polygon (BEP20)',      decimals:18,logoURI:L('4713/small/matic-token-icon.png')},
  {chainId:56,address:'0x2859e4544C4bB03966803b044A93563Bd2D0DD4D',symbol:'SHIB',  name:'Shiba Inu (BEP20)',    decimals:18,logoURI:L('11939/small/shiba.png')},
  {chainId:56,address:'0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',symbol:'LTC',   name:'Litecoin (BEP20)',     decimals:18,logoURI:L('2/small/litecoin.png')},
  {chainId:56,address:'0x7979F6C54ebA05E18Ded44C4F986F49a3De9c1d',symbol:'DOGE',  name:'Dogecoin (BEP20)',     decimals:8, logoURI:L('5/small/dogecoin.png')},
  {chainId:56,address:'0x0Eb3a705fc54725037CC9e008bDede697f62F335',symbol:'ATOM',  name:'Cosmos (BEP20)',       decimals:18,logoURI:L('1481/small/cosmos_hub.png')},
  {chainId:56,address:'0xCa3F508B8e4Dd382eE878A314789373D80A5190A',symbol:'BIFI',  name:'Beefy Finance',        decimals:18,logoURI:L('12704/small/token.png')},
  {chainId:56,address:'0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F',symbol:'ALPACA',name:'Alpaca Finance',       decimals:18,logoURI:L('14165/small/alpaca.png')},
  {chainId:56,address:'0x67b725d7e342d7B611fa85e859Df9697D9378B2e',symbol:'SAND',  name:'The Sandbox (BEP20)', decimals:18,logoURI:L('12129/small/sandbox_logo.jpg')},
  {chainId:56,address:'0xA1faa113cbE53436Df28FF0aEe54275c13B40975',symbol:'ALPHA', name:'Alpha Finance',        decimals:18,logoURI:L('12738/small/AlphaToken_256x256.png')},
  {chainId:56,address:'0x5f84ce30dc3cf7909101c69086c50de191895883',symbol:'VRT',   name:'Venus Reward',         decimals:18,logoURI:L('279/small/ethereum.png')},
  {chainId:56,address:'0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63',symbol:'XVS',   name:'Venus',                decimals:18,logoURI:L('12677/small/venus_protocol_logo.jpg')},
  {chainId:56,address:'0x1CE0c2827e2eF14D5C4f29a091d735A204794041',symbol:'AVAX',  name:'Avalanche (BEP20)',    decimals:18,logoURI:L('12559/small/Avalanche_Circle_RedWhite_Trans.png')},
  {chainId:56,address:'0xBBbD1BbB4f9b936C3604906D7592A644071dE884',symbol:'POLS',  name:'Polkastarter',         decimals:18,logoURI:L('13780/small/Polkastarter.png')},
  {chainId:56,address:'0x4B0F1812e5Df2A09796481Ff14017e6005508003',symbol:'TWT',   name:'Trust Wallet',         decimals:18,logoURI:L('11085/small/Trust.png')},
  {chainId:56,address:'0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153',symbol:'FIL',   name:'Filecoin (BEP20)',     decimals:18,logoURI:L('2477/small/filecoin.png')},
  {chainId:56,address:'0xBf5140A22578168FD562DCcF235E5D43A02ce9B2',symbol:'INJ',   name:'Injective (BEP20)',    decimals:18,logoURI:L('12882/small/Secondary_Symbol.png')},
  {chainId:56,address:'0x8595F9dA7b868b1822194fAEd312235E43007b49',symbol:'BTT',   name:'BitTorrent',           decimals:18,logoURI:L('22457/small/btt_logo.png')},
  {chainId:56,address:'0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B',symbol:'TRX',   name:'TRON (BEP20)',         decimals:18,logoURI:L('1094/small/tron-logo.png')},
  {chainId:56,address:'0x6D8A3A5F144Ff57ba71fB5aB08ce1D59bC2dF2b3',symbol:'SOL',   name:'Solana (BEP20)',       decimals:18,logoURI:L('4128/small/solana.png')},
  {chainId:56,address:'0xfb5B838b6cfEEdC2873aB27866079AC55363D37A',symbol:'FLOKI', name:'Floki Inu',            decimals:9, logoURI:L('16746/small/FLOKI.png')},
  {chainId:56,address:'0x31471E0791fCdbE82fbF4C44943255e923F1b794',symbol:'PROM',  name:'Prometeus',            decimals:18,logoURI:L('10659/small/gJG9RH7.png')},
  {chainId:56,address:'0x5b17b4d5e4009B5C43e3e3d63A5229F794cBA389',symbol:'DODO',  name:'DODO',                 decimals:18,logoURI:L('12651/small/dodo_logo_new.png')},
  {chainId:56,address:'0x49BA0F6CF04dE83E2b508f9ac5F694e877B32d1D',symbol:'GRT',   name:'The Graph (BEP20)',    decimals:18,logoURI:L('13397/small/Graph_Token.png')},
  {chainId:56,address:'0x67EFeF66A55c4562144B9AcfCFbc62F9E4269b3e',symbol:'NEAR',  name:'NEAR (BEP20)',         decimals:18,logoURI:L('10365/small/near.png')},
  {chainId:56,address:'0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6',symbol:'EOS',   name:'EOS (BEP20)',          decimals:18,logoURI:L('738/small/eos-eos-logo.png')},
];

export function getTokensByChain(chainId: number): TokenInfo[] {
  return TOKENS.filter(t => t.chainId === chainId);
}
export function getToken(chainId: number, address: string): TokenInfo | undefined {
  return TOKENS.find(t => t.chainId === chainId && t.address.toLowerCase() === address.toLowerCase());
}
export function searchTokens(chainId: number, query: string): TokenInfo[] {
  const q = query.toLowerCase();
  return TOKENS.filter(t => t.chainId === chainId && (
    t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q
  ));
}
export function getTokensByTag(chainId: number, tag: string): TokenInfo[] {
  return TOKENS.filter(t => t.chainId === chainId && t.tags?.includes(tag));
}

const COINGECKO_IDS: Record<string,string> = {
  WETH:'ethereum',ETH:'ethereum',stETH:'staked-ether',wstETH:'wrapped-steth',
  rETH:'rocket-pool-eth',cbETH:'coinbase-wrapped-staked-eth',cbBTC:'coinbase-wrapped-btc',
  WBTC:'wrapped-bitcoin',BTCB:'wrapped-bitcoin',
  USDC:'usd-coin','USDC.e':'usd-coin',USDbC:'usd-coin',
  USDT:'tether',DAI:'dai',FRAX:'frax',LUSD:'liquity-usd',
  sUSD:'nusd',BUSD:'binance-usd',PYUSD:'paypal-usd',DOLA:'dola-usd',
  LINK:'chainlink',UNI:'uniswap',AAVE:'aave',CRV:'curve-dao-token',
  MKR:'maker',LDO:'lido-dao',COMP:'compound-governance-token',
  SNX:'havven',BAL:'balancer',CVX:'convex-finance',FXS:'frax-share',
  YFI:'yearn-finance',SUSHI:'sushi',GRT:'the-graph',IMX:'immutable-x',
  APE:'apecoin',ENS:'ethereum-name-service',PEPE:'pepe',SHIB:'shiba-inu',
  PENDLE:'pendle',RNDR:'render-token',INJ:'injective-protocol',
  '1INCH':'1inch',RPL:'rocket-pool',MATIC:'matic-network',WMATIC:'matic-network',
  stMATIC:'lido-staked-matic',MaticX:'stader-staked-matic',ARB:'arbitrum',OP:'optimism',
  GMX:'gmx',RDNT:'radiant-capital',GNS:'gains-network',MAGIC:'magic',STG:'stargate-finance',
  AERO:'aerodrome-finance',BRETT:'brett-base',DEGEN:'degen-base',
  PRIME:'echelon-prime',VELO:'velodrome-finance',PERP:'perpetual-protocol',
  QUICK:'quick',SAND:'the-sandbox',MANA:'decentraland',AXS:'axie-infinity',
  WBNB:'binancecoin',CAKE:'pancakeswap-token',DOT:'polkadot',ADA:'cardano',
  XRP:'ripple',LTC:'litecoin',DOGE:'dogecoin',ATOM:'cosmos',
  FIL:'filecoin',TRX:'tron',SOL:'solana',AVAX:'avalanche-2',
  NEAR:'near',FLOKI:'floki',XVS:'venus',TWT:'trust-wallet-token',
  TBILL:'backed-ib01-dollar',SPELL:'spell-token',WOO:'woo-network',
  GNO:'gnosis',GHST:'aavegotchi',BOB:'bob',KWENTA:'kwenta',LYRA:'lyra-finance',
};

let priceCache: Record<string,number> = {};
let priceCacheTime = 0;

export async function fetchLivePrices(): Promise<Record<string,number>> {
  if (Date.now() - priceCacheTime < 60_000) return priceCache;
  const ids = [...new Set(Object.values(COINGECKO_IDS))].join(',');
  
  const fallbackPrices = {
      WETH:3200,WBTC:65000,BTCB:65000,WBNB:600,
      USDC:1,USDT:1,DAI:1,FRAX:1,BUSD:1,LUSD:1,sUSD:1,DOLA:1,
      USDM:1,USDY:1,PHRS:0.5,WPHRS:0.5, // Added RWA and Pharos testnet fallbacks
      ARB:1.1,OP:2.1,MATIC:0.7,LINK:14,UNI:7,AAVE:90,CRV:0.4,
      MKR:2200,LDO:1.8,COMP:55,GMX:28,RDNT:0.08,PENDLE:3.5,
      AERO:1.3,CAKE:2.5,DOT:7,ADA:0.45,XRP:0.5,DOGE:0.15,LTC:80,
      SOL:165,AVAX:35,ATOM:8,NEAR:6,SHIB:0.000025,PEPE:0.000012,
  };

  // In development, route through the Vite proxy to bypass Coingecko's localhost CORS block.
  // In production, hit the public API directly.
  const baseUrl = import.meta.env.DEV ? '/api/coingecko' : 'https://api.coingecko.com/api/v3';

  try {
    const res = await fetch(
      `${baseUrl}/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error('CG error');
    const data = await res.json() as Record<string,{usd:number}>;
    const next: Record<string,number> = {};
    for (const [sym,id] of Object.entries(COINGECKO_IDS)) {
      next[sym] = data[id]?.usd ?? priceCache[sym] ?? fallbackPrices[sym as keyof typeof fallbackPrices] ?? 0;
    }
    // Also inject our manual RWA/Testnet prices since CG doesn't know them
    next['USDM'] = 1;
    next['USDY'] = 1;
    next['PHRS'] = 0.5;
    next['WPHRS'] = 0.5;

    priceCache = next; priceCacheTime = Date.now(); return next;
  } catch {
    return Object.keys(priceCache).length ? priceCache : fallbackPrices;
  }
}

export function formatUSD(amountRaw:string, decimals:number, symbol:string, prices:Record<string,number>): string {
  const price = prices[symbol] ?? 0;
  if (!price) return '';
  const value = (Number(BigInt(amountRaw)) / 10 ** decimals) * price;
  if (value === 0) return '';
  if (value < 0.01) return '< $0.01';
  return `≈ $${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
