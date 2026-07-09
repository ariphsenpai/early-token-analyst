const axios = require('axios');
const { TelegramNotifier } = require('./TelegramNotifier');
const config = require('../config');

class MicinScannerV2 {
  constructor() {
    this.notifier = new TelegramNotifier(config.BOT_TOKEN, config.TELEGRAM_USER_ID);
  }

  parsePair(pair) {
    if (!pair) return null;
    return {
      name: pair.baseToken.name || 'Unknown',
      symbol: pair.baseToken.symbol || 'UNK',
      chain: pair.chainId.toLowerCase(),
      address: pair.baseToken.address,
      price: parseFloat(pair.priceUsd) || 0,
      mcap: pair.marketCap || 0,
      liquidity: pair.liquidity?.usd || 0,
      volume24h: pair.volume?.h24 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      buyTax: 0, sellTax: 0, verified: true,
      hasHiddenFunc: false, hasHiddenFee: false,
      ownershipRenounced: 'unknown', lpLocked: 'unknown',
      lpLockPlatform: 'Unknown', lpLockDuration: 'Unknown',
      lpLockedPercent: 0, top10Percent: 0,
      deployerAddress: pair.baseToken.address,
      deployerStillHolds: false, deployerHoldPercent: 0,
      hasWalletClusters: false, sniperAlert: false,
      sniperDetails: '', maxTxManipulation: false,
      taxCanChange: false, hasAntiBot: false,
      isFreshWallet: false, deployerHistory: 'N/A',
      teamInfo: 'ANONIM', hasWebsite: false,
      socials: 'N/A',
      dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pair.baseToken.address}`,
      source: 'dexscreener-auto',
    };
  }

  evaluateToken(token) {
    const a = { riskScore: 100, riskLevel: 'LOW', redFlags: [], greenFlags: [], conclusion: '' };

    // 1. LIQUIDITY LOCK
    if (token.lpLocked === 'unknown') {
      a.redFlags.push('🔒 LP Lock: TIDAK BISA VERIFIKASI (butuh gmgn.ai)');
      a.riskScore -= 30;
    } else if (token.lpLocked === true) {
      a.greenFlags.push(`✅ LP di-lock ${token.lpLockDuration} via ${token.lpLockPlatform}`);
    } else {
      a.redFlags.push('❌ LP TIDAK di-lock');
      a.riskScore -= 40;
    }

    // 2. OWNERSHIP & CONTRACT
    if (token.ownershipRenounced === 'unknown') {
      a.redFlags.push('👤 Ownership: TIDAK BISA VERIFIKASI');
      a.riskScore -= 20;
    } else if (token.ownershipRenounced === true) {
      a.greenFlags.push('✅ Ownership renounced');
    } else {
      a.redFlags.push('❌ Ownership BELUM renounced');
      a.riskScore -= 25;
    }
    if (token.hasHiddenFunc) { a.redFlags.push('⚠️ Fungsi tersembunyi (mint/blacklist/pause)'); a.riskScore -= 35; }
    if (token.hasHiddenFee) { a.redFlags.push('⚠️ Hidden fee detected'); a.riskScore -= 30; }
    if (token.verified) { a.greenFlags.push('✅ Contract verified'); }
    else { a.redFlags.push('⚠️ Contract BELUM verified'); a.riskScore -= 10; }
    if (token.maxTxManipulation) { a.redFlags.push('⚠️ Max TX manipulation possible'); a.riskScore -= 25; }

    // 3. TAX
    if (token.buyTax > 10 || token.sellTax > 10) {
      a.redFlags.push(`⚠️ Tax tinggi: Buy ${token.buyTax}% / Sell ${token.sellTax}%`);
      a.riskScore -= 15;
    } else if (token.buyTax > 0 || token.sellTax > 0) {
      a.greenFlags.push(`✅ Tax wajar: Buy ${token.buyTax}% / Sell ${token.sellTax}%`);
    } else {
      a.redFlags.push('💰 Tax: TIDAK BISA VERIFIKASI');
      a.riskScore -= 10;
    }
    if (token.taxCanChange) { a.redFlags.push('⚠️ Tax bisa diubah owner kapan saja'); a.riskScore -= 20; }

    // 4. HOLDER DISTRIBUTION
    if (token.top10Percent > 0) {
      if (token.top10Percent > 50) { a.redFlags.push(`⚠️ Top 10: ${token.top10Percent.toFixed(1)}% (sangat konsentrasi)`); a.riskScore -= 20; }
      else if (token.top10Percent > 30) { a.redFlags.push(`⚠️ Top 10: ${token.top10Percent.toFixed(1)}% (cukup konsentrasi)`); a.riskScore -= 10; }
      else { a.greenFlags.push(`✅ Distribusi bagus: Top 10 ${token.top10Percent.toFixed(1)}%`); }
    } else { a.redFlags.push('📊 Holder distribution: TIDAK BISA VERIFIKASI'); a.riskScore -= 15; }
    if (token.hasWalletClusters) { a.redFlags.push('⚠️ Wallet cluster terdeteksi'); a.riskScore -= 15; }

    // 5. SNIPER
    if (token.sniperAlert) {
      a.redFlags.push(`🔫 SNIPER ALERT: ${token.sniperDetails || 'Sniper di block awal'}`);
      a.riskScore -= 25;
    } else { a.greenFlags.push('✅ Tidak ada sniper masif'); }

    // 6. DEPLOYER
    if (token.isFreshWallet) { a.redFlags.push('⚠️ Deployer wallet FRESH'); a.riskScore -= 15; }
    else { a.greenFlags.push('✅ Deployer punya history'); }

    // 7. SOSIAL
    if (token.hasWebsite) { a.greenFlags.push('✅ Ada website/docs'); }
    else { a.redFlags.push('⚠️ Tidak ada website/docs'); a.riskScore -= 5; }
    if (token.socials && token.socials !== 'N/A') { a.greenFlags.push(`✅ Sosial aktif: ${token.socials}`); }
    else { a.redFlags.push('⚠️ Sosial tidak ditemukan'); a.riskScore -= 5; }

    // Final calculation
    a.riskScore = Math.max(0, Math.min(100, a.riskScore));

    if (a.riskScore >= 75) { a.riskLevel = 'LOW'; a.conclusion = 'Relatif aman. Tetap DYOR.'; }
    else if (a.riskScore >= 50) { a.riskLevel = 'MEDIUM'; a.conclusion = 'Ada potensi tapi ada red flags.'; }
    else if (a.riskScore >= 25) { a.riskLevel = 'HIGH'; a.conclusion = 'Banyak red flag. DYOR ekstra.'; }
    else { a.riskLevel = 'EXTREME'; a.conclusion = 'Sangat berisiko. Kemungkinan rug pull/scam.'; }

    if (token.sniperAlert && a.riskLevel !== 'EXTREME') {
      a.riskLevel = 'EXTREME';
      a.conclusion = '🔫 SNIPER MASSIF! Indikasi rug pull / pump & dump.';
      a.redFlags.unshift('🔴 SNIPER MASSIF DI BLOCK AWAL');
    }
    if (token.lpLocked === false || token.lpLocked === 'unknown') {
      if (a.riskLevel === 'LOW') a.riskLevel = 'HIGH';
    }

    return a;
  }

  fmt(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  }

  async sendAlert(token, analysis) {
    const { chain, address, name, symbol, price, mcap, liquidity, buyTax, sellTax, volume24h, priceChange24h } = token;
    const { riskScore, riskLevel, redFlags, greenFlags, conclusion } = analysis;
    const emoji = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', EXTREME: '🔴' }[riskLevel] || '⚪';

    let msg = '';
    msg += `${emoji} <b>MICIN ALERT — NEW SCAN</b>\n`;
    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += `<b>Token:</b> ${name} (<code>${symbol}</code>)\n`;
    msg += `<b>Chain:</b> ${chain.toUpperCase()} │ <code>${address}</code>\n\n`;
    msg += `<b>💰 Price:</b> $${price?.toFixed(8) || 'N/A'} │ <b>MCap:</b> ${this.fmt(mcap)} │ <b>Liq:</b> ${this.fmt(liquidity)}\n`;
    msg += `<b>📊 Vol 24h:</b> ${this.fmt(volume24h)} │ <b>Change:</b> ${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(1)}%\n\n`;

    if (token.sniperAlert) {
      msg += '🔴 <b>⚠️ SNIPER MASSIF DI BLOCK AWAL!</b>\n';
      msg += `   ${token.sniperDetails || 'Sniper detected'}\n\n`;
    }

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '🔒 <b>LIQUIDITY LOCK</b>\n';
    if (token.lpLocked === true) {
      msg += `   ✔️ <b>Di-lock?</b> YES\n`;
      msg += `   📍 Platform: ${token.lpLockPlatform}\n`;
      msg += `   ⏱️ Duration: ${token.lpLockDuration || 'N/A'}\n`;
      msg += `   📊 Locked: ${token.lpLockedPercent ? token.lpLockedPercent.toFixed(1) : 'N/A'}%\n`;
    } else if (token.lpLocked === 'unknown') {
      msg += `   ❌ <b>Di-lock?</b> UNKNOWN\n`;
      msg += `   ⚠️ TIDAK BISA VERIFIKASI (gmgn.ai blocked)\n`;
    } else {
      msg += `   ❌ <b>Di-lock?</b> NO\n`;
    }
    msg += '\n';

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '👤 <b>OWNERSHIP & CONTRACT</b>\n';
    msg += `   📋 Ownership renounced? ${token.ownershipRenounced === true ? 'YES ✅' : token.ownershipRenounced === 'unknown' ? 'UNKNOWN ⚠️' : 'NO ❌'}\n`;
    msg += `   🔧 Hidden func/mint/blacklist? ${token.hasHiddenFunc ? 'YES ❌' : 'NO ✅'}\n`;
    msg += `   ✔️ Contract verified? ${token.verified ? 'YES' : 'NO ❌'}\n`;
    msg += `   💰 Hidden fee? ${token.hasHiddenFee ? 'YES ❌' : 'NO ✅'}\n`;
    msg += `   ⚡ Max TX manipulation? ${token.maxTxManipulation ? 'YES ❌' : 'NO ✅'}\n`;
    msg += '\n';

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '💰 <b>TAX & TRADING RULES</b>\n';
    if (buyTax > 0 || sellTax > 0) {
      msg += `   📊 Buy tax: ${buyTax}% │ Sell tax: ${sellTax}%\n`;
      msg += `   🔄 Tax bisa diubah owner? ${token.taxCanChange ? 'YES ❌' : 'NO ✅'}\n`;
    } else {
      msg += `   ❓ Tax: TIDAK BISA VERIFIKASI\n`;
    }
    msg += '\n';

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '📊 <b>HOLDER DISTRIBUTION</b>\n';
    if (token.top10Percent > 0) {
      msg += `   📈 Top 10 holder: ${token.top10Percent.toFixed(1)}%\n`;
      msg += `   👛 Deployer masih hold? ${token.deployerStillHolds ? (token.deployerHoldPercent ? token.deployerHoldPercent.toFixed(1) + '%' : 'YES') : 'NO'}\n`;
      msg += `   🔗 Wallet clusters? ${token.hasWalletClusters ? 'YES ⚠️' : 'NO ✅'}\n`;
    } else {
      msg += `   ❓ Data: TIDAK BISA VERIFIKASI\n`;
    }
    msg += '\n';

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '👷 <b>DEPLOYER HISTORY</b>\n';
    msg += `   📍 Address: <code>${address}</code>\n`;
    msg += `   📜 History: ${token.deployerHistory}\n`;
    msg += `   🆕 Fresh wallet? ${token.isFreshWallet ? 'YES ⚠️' : 'NO ✅'}\n`;
    msg += '\n';

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '🌐 <b>SOCIAL & NARRASI</b>\n';
    msg += `   👥 Team: ${token.teamInfo || 'ANONIM'}\n`;
    msg += `   🌍 Website/docs: ${token.hasWebsite ? 'YES' : 'NO ❌'}\n`;
    msg += `   📢 Sosial: ${token.socials || 'N/A'}\n\n`;

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += `${emoji} <b>SKOR RISIKO: ${riskLevel}</b> (${riskScore}/100)\n\n`;

    if (greenFlags.length > 0) {
      msg += '✅ <b>Green Flags:</b>\n';
      for (const flag of greenFlags) msg += `   • ${flag}\n`;
      msg += '\n';
    }

    if (redFlags.length > 0) {
      msg += '❌ <b>Red Flags:</b>\n';
      for (const flag of redFlags) msg += `   • ${flag}\n`;
      msg += '\n';
    }

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += '<b>🎯 KESIMPULAN:</b>\n';
    msg += `${conclusion}\n\n`;
    msg += '<b>⚠️ DISCLAIMER:</b>\n';
    msg += 'Ini BUKAN rekomendasi finansial. Investasi tetap berisiko.\n';
    msg += 'Hanya data analitis objektif. DYOR sebelum action!\n\n';
    msg += `🔗 <a href="${token.dexUrl}">Lihat Chart</a>`;
    if (chain === 'solana') { msg += ` │ <a href="https://pump.fun/${address}">PumpFun</a>`; }
    msg += '\n━━━━━━━━━━━━━━━━━━━━━━━━';

    try {
      await this.notifier.sendMessage(msg);
      return true;
    } catch (err) {
      console.error('[MicinScanner] Send error:', err.message);
      return false;
    }
  }
}

module.exports = { MicinScannerV2 };
