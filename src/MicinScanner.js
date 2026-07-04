/**
 * Micin Scanner v3 - New low-cap gem finder with anti-scam + JEPE potential
 * Chains: BSC, Ethereum, Base, Solana
 * Sources: DexScreener, PumpFun, DexTrending
 * Anti-scam: RugCheck, GoPlus, TokenSniffer
 * Filter: Only NEW tokens (<7 days), high JEPE potential
 */

const axios = require('axios');
const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');

class MicinScanner {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
    this.knownTokens = new Set();
    this.MAX_AGE_HOURS = 168; // 7 days
  }

  fmt(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  }

  escape(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');
  }

  // Check if token is new enough (<7 days)
  isNewToken(createdAt) {
    if (!createdAt) return true; // If unknown, allow (DexScreener profiles are new anyway)
    const ageMs = Date.now() - createdAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    return ageHours <= this.MAX_AGE_HOURS;
  }

  // Calculate JEPE potential score (0-100, higher = more potential)
  calculateJepeScore(token) {
    let score = 50;
    const mcap = token.mcap || 0;
    const liq = token.liquidity || 0;
    const vol24h = token.volume24h || 0;
    const vol6h = token.volume6h || 0;
    const txns = token.txns24h || 0;
    const priceChange = token.priceChange24h || 0;

    // Low market cap = higher jepe potential
    if (mcap < 5000) score += 20;
    else if (mcap < 15000) score += 15;
    else if (mcap < 30000) score += 10;
    else if (mcap < 50000) score += 5;
    else score -= 5;

    // Good liquidity ratio (liq/mcap > 0.3 = healthy)
    if (mcap > 0 && liq > 0) {
      const ratio = liq / mcap;
      if (ratio > 0.5) score += 15;
      else if (ratio > 0.3) score += 10;
      else if (ratio > 0.15) score += 5;
      else score -= 10;
    }

    // High volume = interest = jepe potential
    if (vol24h > 50000) score += 15;
    else if (vol24h > 20000) score += 10;
    else if (vol24h > 5000) score += 5;
    else if (vol24h < 500) score -= 10;

    // Volume vs market cap ratio (high turnover = active trading)
    if (mcap > 0 && vol24h > 0) {
      const volRatio = vol24h / mcap;
      if (volRatio > 2) score += 15;
      else if (volRatio > 1) score += 10;
      else if (volRatio > 0.3) score += 5;
    }

    // Price momentum (buying pressure)
    if (priceChange > 50) score += 10;
    else if (priceChange > 20) score += 5;
    else if (priceChange > 0) score += 2;
    else if (priceChange < -20) score -= 5;

    // Transaction count
    if (txns > 500) score += 10;
    else if (txns > 200) score += 5;
    else if (txns > 50) score += 2;
    else if (txns < 10) score -= 5;

    // 6h volume momentum (recent activity surge)
    if (vol6h > 0 && vol24h > 0) {
      const recentRatio = vol6h / vol24h;
      if (recentRatio > 0.5) score += 10; // More than half of 24h volume in last 6h = trending NOW
    }

    return Math.max(0, Math.min(100, score));
  }

  // === SOURCE 1: DexScreener — latest token profiles + boosted ===
  async fetchDexScreener() {
    const tokens = [];
    const endpoints = [
      { url: 'https://api.dexscreener.com/token-profiles/latest/v1', label: 'profiles' },
      { url: 'https://api.dexscreener.com/token-boosts/latest/v1', label: 'latest-boosts' },
    ];

    for (const ep of endpoints) {
      try {
        const res = await axios.get(ep.url, { headers: { Accept: 'application/json' }, timeout: 10000 });
        if (Array.isArray(res.data)) {
          // These are just profiles, need to get pair data
          for (const t of res.data.slice(0, 40)) {
            const chain = (t.chainId || '').toLowerCase();
            if (!['bsc', 'ethereum', 'base', 'solana'].includes(chain)) continue;
            try {
              const pairRes = await axios.get(`https://api.dexscreener.com/tokens/v1/${chain}/${t.tokenAddress}`, { timeout: 10000 });
              if (pairRes.data && Array.isArray(pairRes.data.pairs)) {
                for (const pair of pairRes.data.pairs.slice(0, 2)) {
                  const norm = this.normalizeDexScreenerPair(pair);
                  if (norm) {
                    norm.source = 'dexscreener-profiles';
                    tokens.push(norm);
                  }
                }
              }
            } catch (e) { /* skip */ }
            await new Promise(r => setTimeout(r, 200)); // Rate limit
          }
        }
      } catch (e) {
        console.warn(`[DexScreener ${ep.label}] Error:`, e.message);
      }
    }
    console.log(`[DexScreener] ${tokens.length} tokens`);
    return tokens;
  }

  // === SOURCE 2: DexScreener search per chain (trending + new) ===
  async fetchDexTrending() {
    const tokens = [];
    const chains = ['bsc', 'ethereum', 'base', 'solana'];
    for (const chain of chains) {
      try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=trending+${chain}`, { timeout: 10000 });
        if (res.data && Array.isArray(res.data.pairs)) {
          for (const pair of res.data.pairs) {
            const norm = this.normalizeDexScreenerPair(pair);
            if (norm) {
              norm.source = 'dexscreener-search';
              tokens.push(norm);
            }
          }
        }
      } catch (e) { /* skip */ }
    }
    // Also try ranked endpoints
    for (const chain of chains) {
      try {
        const res = await axios.get(`https://api.dexscreener.com/token-profiles/latest/v1`, { timeout: 10000 });
        // Already covered in profiles
        break;
      } catch (e) { break; }
    }
    console.log(`[DexTrending] ${tokens.length} tokens`);
    return tokens;
  }

  // === SOURCE 3: PumpFun — newly launched tokens on Solana ===
  async fetchPumpFun() {
    const tokens = [];
    try {
      // PumpFun: get newest coins
      const res = await axios.get('https://frontend-api-v3.pump.fun/coins?limit=50&offset=0&orderby=created_unix_time&dir=DESC', {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      if (Array.isArray(res.data)) {
        for (const t of res.data) {
          tokens.push({
            source: 'pumpfun',
            chain: 'solana',
            address: t.mint || '',
            name: t.name || 'Unknown',
            symbol: t.symbol || '',
            price: t.price_usd || 0,
            mcap: (t.price_usd || 0) * (t.supply || 0),
            liquidity: t.liquidity_usd || 0,
            volume24h: t.volume_24h || 0,
            volume6h: t.volume_6h || 0,
            txns24h: t.txns_24h || 0,
            priceChange24h: t.price_change_24h || 0,
            priceChange6h: 0,
            pairAddress: '',
            dexUrl: `https://pump.fun/${t.mint || ''}`,
            createdAt: t.created_unix_time ? t.created_unix_time * 1000 : null,
          });
        }
      }
      console.log(`[PumpFun] ${tokens.length} tokens`);
    } catch (e) {
      console.warn('[PumpFun] Error:', e.message);
      // Fallback: try old endpoint
      try {
        const res = await axios.get('https://pump.fun/api/coins?limit=50&orderby=created_unix_time&dir=DESC', { timeout: 10000 });
        if (Array.isArray(res.data)) {
          for (const t of res.data) {
            tokens.push({
              source: 'pumpfun',
              chain: 'solana',
              address: t.mint || '',
              name: t.name || 'Unknown',
              symbol: t.symbol || '',
              price: t.price_usd || 0,
              mcap: (t.price_usd || 0) * (t.supply || 0),
              liquidity: t.liquidity_usd || 0,
              volume24h: t.volume_24h || 0,
              volume6h: 0,
              txns24h: 0,
              priceChange24h: 0,
              priceChange6h: 0,
              pairAddress: '',
              dexUrl: `https://pump.fun/${t.mint || ''}`,
              createdAt: t.created_unix_time ? t.created_unix_time * 1000 : null,
            });
          }
          console.log(`[PumpFun-fallback] ${tokens.length} tokens`);
        }
      } catch (e2) {
        console.warn('[PumpFun] Fallback also failed:', e2.message);
      }
    }
    return tokens;
  }

  normalizeDexScreenerPair(pair) {
    if (!pair || !pair.baseToken) return null;
    const chain = (pair.chainId || '').toLowerCase();
    if (!['bsc', 'ethereum', 'base', 'solana'].includes(chain)) return null;

    return {
      source: 'dexscreener',
      chain,
      address: pair.baseToken.address || '',
      name: pair.baseToken.name || pair.baseToken.symbol || 'Unknown',
      symbol: pair.baseToken.symbol || '',
      price: parseFloat(pair.priceUsd || 0),
      mcap: pair.marketCap || pair.fdv || 0,
      liquidity: pair.liquidity?.usd || 0,
      volume24h: pair.volume?.h24 || 0,
      volume6h: pair.volume?.h6 || 0,
      txns24h: pair.txns?.h24 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      priceChange6h: pair.priceChange?.h6 || 0,
      pairAddress: pair.pairAddress || '',
      dexUrl: `https://dexscreener.com/${chain}/${pair.pairAddress || pair.baseToken.address}`,
      createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).getTime() : null,
    };
  }

  // === ANTI-SCAM: RugCheck (Solana) ===
  async rugCheck(address, chain) {
    if (chain !== 'solana') return null;
    try {
      const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${address}/report`, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      return res.data;
    } catch (e) { return null; }
  }

  // === ANTI-SCAM: GoPlus Security (EVM) ===
  async goPlusCheck(address, chain) {
    const chainIdMap = { bsc: 56, ethereum: 1, base: 8453 };
    const chainId = chainIdMap[chain];
    if (!chainId) return null;
    try {
      const res = await axios.get(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      const data = res.data?.result?.[address.toLowerCase()];
      if (!data) return null;
      return {
        isHoneypot: data.is_honeypot === '1',
        isOpenSource: data.is_open_source === '1',
        isMintable: data.is_mintable === '1',
        isProxy: data.is_proxy === '1',
        hiddenOwner: data.hidden_owner === '1',
        ownerCanChangeBalance: data.owner_change_balance === '1',
        canTakeBackOwnership: data.can_take_back_ownership === '1',
        buyTax: parseFloat(data.buy_tax || 0),
        sellTax: parseFloat(data.sell_tax || 0),
        holderCount: parseInt(data.holder_count || 0),
        topHolderPct: data.top_holder_pct ? parseFloat(data.top_holder_pct) : 0,
      };
    } catch (e) { return null; }
  }

  // === ANTI-SCAM: TokenSniffer (EVM) ===
  async tokenSnifferCheck(address, chain) {
    const chainMap = { bsc: 'binance', ethereum: 'ethereum', base: 'base' };
    const c = chainMap[chain];
    if (!c) return null;
    try {
      const res = await axios.get(`https://tokensniffer.com/api/v2/tokens/${c}/${address}`, {
        headers: { Accept: 'application/json' },
        timeout: 10000,
      });
      return res.data;
    } catch (e) { return null; }
  }

  // === Calculate safety score (0-100) ===
  calculateSafety(token, rugData, goPlusData, snifferData) {
    let score = 100;
    const issues = [];
    const warnings = [];

    // Solana (RugCheck)
    if (rugData) {
      if (rugData.mintAuthority) { score -= 25; issues.push('Mint authority enabled'); }
      if (rugData.freezeAuthority) { score -= 20; issues.push('Freeze authority enabled'); }
      if (rugData.lpTokens?.length > 0) {
        const burned = rugData.lpTokens.filter(lp => lp.burned).length;
        if (burned < rugData.lpTokens.length) { score -= 20; issues.push(`LP not fully burned (${burned}/${rugData.lpTokens.length})`); }
      }
      if (rugData.topHolders?.length > 0) {
        const topPct = rugData.topHolders[0].pct || 0;
        if (topPct > 20) { score -= 20; issues.push(`Top holder: ${topPct.toFixed(1)}%`); }
        else if (topPct > 10) { score -= 10; warnings.push(`Top holder: ${topPct.toFixed(1)}%`); }
      }
    }

    // EVM (GoPlus)
    if (goPlusData) {
      if (goPlusData.isHoneypot) { score = 0; issues.push('HONEYPOT'); return { score, issues, warnings, safe: false }; }
      if (goPlusData.isMintable) { score -= 25; issues.push('Mintable'); }
      if (goPlusData.isProxy) { score -= 20; issues.push('Proxy contract'); }
      if (goPlusData.hiddenOwner) { score -= 20; issues.push('Hidden owner'); }
      if (goPlusData.canTakeBackOwnership) { score -= 15; issues.push('Can take back ownership'); }
      if (goPlusData.ownerCanChangeBalance) { score -= 30; issues.push('Owner can change balance'); }
      if (goPlusData.buyTax > 10) { score -= 15; issues.push(`Buy tax: ${goPlusData.buyTax}%`); }
      if (goPlusData.sellTax > 10) { score -= 15; issues.push(`Sell tax: ${goPlusData.sellTax}%`); }
      if (goPlusData.buyTax > 25 || goPlusData.sellTax > 25) { score = 0; issues.push('Tax >25%'); return { score, issues, warnings, safe: false }; }
      if (goPlusData.topHolderPct > 20) { score -= 15; issues.push(`Top holder: ${goPlusData.topHolderPct}%`); }
      if (!goPlusData.isOpenSource) { score -= 15; warnings.push('Not open source'); }
    }

    // TokenSniffer
    if (snifferData?.issues) {
      for (const issue of snifferData.issues) {
        if (issue.severity === 'high') { score -= 20; issues.push(issue.title || 'High severity'); }
        else if (issue.severity === 'medium') { score -= 10; warnings.push(issue.title || 'Medium severity'); }
      }
    }

    // General
    const liq = token.liquidity || 0;
    const mcap = token.mcap || 0;
    if (liq < 1000) { score -= 10; warnings.push('Low liquidity'); }
    if (liq > 0 && mcap > 0 && liq / mcap < 0.1) { score -= 10; warnings.push('Low liq ratio'); }

    score = Math.max(0, Math.min(100, score));
    const safe = score >= 60 && issues.length === 0;
    return { score, issues, warnings, safe };
  }

  // === Filter & validate ===
  async filterAndValidate(tokens) {
    const valid = [];
    const seen = new Set();

    for (const token of tokens) {
      if (!token.address || !token.chain) continue;
      const key = `${token.chain}:${token.address}`;
      if (seen.has(key) || this.knownTokens.has(key)) continue;
      seen.add(key);

      if (!['bsc', 'ethereum', 'base', 'solana'].includes(token.chain)) continue;

      // === FILTER 1: Only NEW tokens (<7 days) ===
      if (!this.isNewToken(token.createdAt)) continue;

      // === FILTER 2: Low-cap ===
      if (token.mcap <= 0 || token.mcap > 100000) continue;
      if (token.liquidity < 1000 || token.liquidity > 50000) continue;

      // === FILTER 3: Anti-scam checks ===
      let rugData = null, goPlusData = null, snifferData = null;
      if (token.chain === 'solana') {
        rugData = await this.rugCheck(token.address, 'solana');
      } else {
        goPlusData = await this.goPlusCheck(token.address, token.chain);
        snifferData = await this.tokenSnifferCheck(token.address, token.chain);
      }
      const safety = this.calculateSafety(token, rugData, goPlusData, snifferData);
      if (!safety.safe) {
        console.log(`  SKIP ${token.symbol} (${token.chain}) safety=${safety.score} ${safety.issues[0] || ''}`);
        continue;
      }

      // === FILTER 4: JEPE potential ===
      token.jepeScore = this.calculateJepeScore(token);
      if (token.jepeScore < 50) {
        console.log(`  SKIP ${token.symbol} jepe=${token.jepeScore} (low potential)`);
        continue;
      }

      token.safety = safety;
      token.rugUrl = token.chain === 'solana'
        ? `https://rugcheck.xyz/tokens/${token.address}`
        : `https://gopluslabs.io/token-security/${token.chain === 'bsc' ? 56 : token.chain === 'base' ? 8453 : 1}/${token.address}`;

      valid.push(token);
      this.knownTokens.add(key);
      if (this.knownTokens.size > 500) {
        this.knownTokens = new Set([...this.knownTokens].slice(-250));
      }
    }

    // Sort by JEPE score (highest first)
    valid.sort((a, b) => (b.jepeScore || 0) - (a.jepeScore || 0));
    return valid;
  }

  // === Send Telegram alert ===
  async sendAlert(token) {
    const s = token.safety;
    const jp = token.jepeScore;
    const chainBadge = { bsc: '\u{1F7E1} BSC', ethereum: '\u{1F539} ETH', base: '\u{1F535} BASE', solana: '\u{1F7E3} SOL' }[token.chain] || token.chain;
    const changeEmoji = token.priceChange24h >= 0 ? '\u{1F4C8}' : '\u{1F4C9}';
    const changeStr = token.priceChange24h >= 0 ? `+${token.priceChange24h.toFixed(1)}%` : `${token.priceChange24h.toFixed(1)}%`;

    let jepeBars = '';
    const filled = Math.floor(jp / 10);
    for (let i = 0; i < 10; i++) jepeBars += i < filled ? '\u{2588}' : '\u{2591}';

    let msg = '';
    msg += '\u{1F6A8} <b>MICIN ALERT \u2014 NEW GEM</b>\n';
    msg += '\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n';
    msg += `\u{1F195} <b>${this.escape(token.name)}</b> <code>($${this.escape(token.symbol)})</code>\n`;
    msg += `${chainBadge} \u{2502} ${token.source}\n`;
    msg += `\u{1F4CD} <code>${token.address}</code>\n\n`;
    msg += `\u{1F4B0} MCap: <b>${this.fmt(token.mcap)}</b> \u{2502} \u{1F4A7} Liq: <b>${this.fmt(token.liquidity)}</b>\n`;
    msg += `\u{1F4CA} Vol 24h: <b>${this.fmt(token.volume24h)}</b> \u{2502} ${changeEmoji} ${changeStr}\n`;
    msg += `\u{1F50A} Txns 24h: <b>${token.txns24h || 'N/A'}</b>\n\n`;
    msg += `\u{1F680} JEPE Potential: <b>${jp}/100</b>\n  <code>${jepeBars}</code>\n\n`;
    msg += `\u{1F6E1}\u{FE0F} Safety: <b>${s.score}/100</b>`;
    if (s.warnings.length > 0) msg += `\n\u{26A0}\u{FE0F} ${this.escape(s.warnings.join(', '))}`;
    if (s.issues.length > 0) msg += `\n\u{274C} ${this.escape(s.issues.join(', '))}`;
    else msg += `\n\u{2705} No critical issues`;
    msg += '\n\n';
    msg += `<a href="${token.dexUrl}">\u{1F517} DexScreener</a>`;
    if (token.source === 'pumpfun') msg += ` \u{2502} <a href="https://pump.fun/${token.address}">\u{1F517} PumpFun</a>`;
    msg += ` \u{2502} <a href="${token.rugUrl}">\u{1F517} Security</a>`;
    msg += '\n\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}';

    try {
      await this.notifier.sendMessage(msg);
      console.log(`  SENT ${token.symbol} (${token.chain}) jepe=${jp} safety=${s.score}`);
    } catch (e) {
      console.error('Send error:', e.message);
    }
  }

  // === Main scan ===
  async scanOnce() {
    console.log(`\n\u{1F50D} [${new Date().toISOString()}] Scanning for NEW micin...`);

    const [dexTokens, pumpTokens, trendingTokens] = await Promise.allSettled([
      this.fetchDexScreener(),
      this.fetchPumpFun(),
      this.fetchDexTrending(),
    ]);

    const allTokens = [
      ...(dexTokens.status === 'fulfilled' ? dexTokens.value : []),
      ...(pumpTokens.status === 'fulfilled' ? pumpTokens.value : []),
      ...(trendingTokens.status === 'fulfilled' ? trendingTokens.value : []),
    ];

    console.log(`[Scanner] Raw: ${allTokens.length} tokens`);

    // Deduplicate
    const seen = new Set();
    const unique = allTokens.filter(t => {
      const k = `${t.chain}:${t.address}`;
      if (seen.has(k) || !t.address) return false;
      seen.add(k);
      return true;
    });

    console.log(`[Scanner] Unique: ${unique.length} tokens`);

    const valid = await this.filterAndValidate(unique);
    console.log(`[Scanner] Valid (new + safe + jepe >50): ${valid.length} tokens`);

    if (valid.length === 0) {
      console.log('\u{1F634} No new safe micin found this round');
      return 0;
    }

    // Send top 10 alerts (sorted by jepe score)
    for (const token of valid.slice(0, 10)) {
      await this.sendAlert(token);
      await new Promise(r => setTimeout(r, 800));
    }

    return valid.length;
  }

  start() {
    console.log('\u{1F680} Micin Scanner v3 started');
    console.log(`\u{1F4CA} Chains: BSC, Ethereum, Base, Solana`);
    console.log(`\u{1F50D} Sources: DexScreener + PumpFun + DexTrending`);
    console.log(`\u{1F6E1}\u{FE0F} Anti-scam: RugCheck + GoPlus + TokenSniffer`);
    console.log(`\u{1F920} Filter: NEW tokens (<7 days) + JEPE potential >50 + Safety >60`);
    console.log(`\u{23F0} Interval: every ${config.SCAN_INTERVAL / 60000} min\n`);

    const run = async () => {
      try { await this.scanOnce(); }
      catch (e) { console.error('Scan error:', e.message); }
      setTimeout(run, config.SCAN_INTERVAL);
    };

    run();
  }
}

module.exports = { MicinScanner };
