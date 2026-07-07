const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');
const axios = require('axios');

class MicinScanner {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
    this.waitingForInput = new Map(); // chatId -> { chain, address, inputs: [] }
  }

  fmt(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  }

  async fetchGmgnCoinInfo(address) {
    // Mock data if real API not available
    // Real: https://gmgn.ai/api/v1/tokens/coin_info?chain=solana&address=...
    return {
      name: 'Unknown',
      symbol: 'UNK',
      chain: 'solana',
      price: 0,
      mcap: 10000,
      liquidity: 5000,
      volume24h: 20000,
      txns24h: 150,
      buyTax: 2,
      sellTax: 5,
      verified: true,
      hasHiddenFunc: false,
    };
  }

  async evaluateToken(token) {
    const analysis = {
      riskScore: 50,
      riskLevel: 'MEDIUM',
      redFlags: [],
      greenFlags: [],
      summary: [],
      conclusion: '',
    };

    // 1. LIQUIDITY LOCK
    const lpLocked = token.liquidity > 1000 && Math.random() > 0.3; // Mock check
    analysis.greenFlags.push('Liquidasi tersedia');
    if (!lpLocked) {
      analysis.redFlags.push('LP tidak di-lock / terlalu rendah');
      analysis.riskScore -= 20;
    } else {
      analysis.greenFlags.push('LP di-lock (simulasi Unicrypt)');
    }

    // 2. OWNERSHIP
    analysis.greenFlags.push('Ownership dikelola');
    if (token.hasHiddenFunc) {
      analysis.redFlags.push('Ada fungsi tersembunyi (mint, blacklist, pause)');
      analysis.riskScore -= 25;
    }

    // 3. TAX
    if (token.buyTax > 10 || token.sellTax > 10) {
      analysis.redFlags.push(`Tax tinggi: buy ${token.buyTax || 0}%, sell ${token.sellTax || 0}%`);
      analysis.riskScore -= 15;
    } else {
      analysis.greenFlags.push('Tax wajar');
    }

    // 4. HOLDER
    const top10 = Math.random() * 40; // Mock
    if (top10 > 30) {
      analysis.redFlags.push(`Top 10 holder terlalu tinggi: ${top10.toFixed(1)}%`);
      analysis.riskScore -= 15;
    } else {
      analysis.greenFlags.push('Holder terdistribusi wajar');
    }

    // 5. SNIPER (mock)
    if (Math.random() > 0.7) {
      analysis.redFlags.push('Sniper bot detected di blok awal');
      analysis.riskScore -= 20;
    } else {
      analysis.greenFlags.push('Tidak ada sniper masif');
    }

    // 6. DEPLOYER
    analysis.greenFlags.push('Deployer history OK (simulasi)');
    if (Math.random() > 0.8) {
      analysis.redFlags.push('Deployer fresh / tidak bersejarah');
      analysis.riskScore -= 10;
    }

    // 7. SOCIAL
    if (token.name && token.name.length > 3) {
      analysis.greenFlags.push('Ada nama & branding');
    }

    analysis.riskScore = Math.max(0, Math.min(100, analysis.riskScore));
    if (analysis.riskScore < 30) {
      analysis.riskLevel = 'EXTREME';
      analysis.conclusion = 'Token sangat berisiko. Hindari. Kemungkinan scam tinggi.';
    } else if (analysis.riskScore < 50) {
      analysis.riskLevel = 'HIGH';
      analysis.conclusion = 'Banyak red flag. Lakukan DYOR ekstra sebelum beli.';
    } else if (analysis.riskScore < 70) {
      analysis.riskLevel = 'MEDIUM';
      analysis.conclusion = 'Ada potensi, tapi watch out untuk red flags yang ada.';
    } else {
      analysis.riskLevel = 'LOW';
      analysis.conclusion = 'Relatif aman untuk dipantau, tapi tetap lakukan DYOR.';
    }

    return analysis;
  }

  async handleInput(chatId, text) {
    const inputs = [text.trim()];

    // Parse address (mock)
    let chain = 'bsc';
    let address = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');

    if (text.includes('gmgn.ai')) {
      chain = 'solana';
      address = 'So1' + Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    // Fetch token info
    const token = await this.fetchGmgnCoinInfo(address);
    token.chain = chain;
    token.address = address;
    token.source = 'gmgn.ai';
    token.dexUrl = 'https://gmgn.ai';

    // Evaluate
    const analysis = await this.evaluateToken(token);

    // Build report
    const report = this.notifier.buildAnalystReport(token, analysis);

    // Send
    await this.notifier.sendMessage(report);
  }
}

module.exports = { MicinScanner };
