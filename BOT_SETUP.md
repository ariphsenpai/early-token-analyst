# Micin Analyst Bot v5 — On-Chain Token Evaluator

## Apa Itu Micin Analyst Bot?

Bot analis on-chain untuk **evaluasi token secara manual** sebelum dibeli. Berbeda dengan scanner biasa, bot ini:

- ❌ TIDAK auto-alert token baru
- ✅ EVALUASI token yang kamu input (contract / nama / link chart)
- ✅ Cek sistematis: liquidity lock, ownership, tax, sniper, holder distribution
- ✅ Output terstruktur: Skor Risiko + Red Flags + Green Flags + Kesimpulan

---

## 1. Buat Bot Telegram Baru

1. Buka Telegram, cari **@BotFather**
2. `/newbot` → ikuti instruksi
3. Simpan **BOT_TOKEN** yang dikirim BotFather

---

## 2. Setup Chat ID

1. Kirim `/start` ke bot baru
2. Cek chat ID:
   - Buka: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Ganti `<TOKEN>` dengan token botmu
   - Cari `"chat":{"id":123456789}` — itulah chat ID

---

## 3. Install & Konfigurasi

```bash
cd /root/micin-scanner-analyst

# Install deps
npm install

# Setup env
export BOT_TOKEN="123456789:ABCdef..."
export TELEGRAM_USER_ID="5375775335"

# Jalankan
node scanner.js
```

---

## 4. Cara Menggunakan

Bot akan **menunggu input token** via Telegram DM.

### Format Input yang Diterima:
- Contract address (contoh: `0x123...abc`)
- Nama token (contoh: `Pepe`)
- Link chart (contoh: `https://dexscreener.com/bsc/0x...`)
- Link gmgn.ai (contoh: `https://gmgn.ai/sol/token/So11...`)

Bot akan:
1. Parse input → dapatkan address + chain
2. Fetch data dari DexScreener + gmgn.ai + RugCheck + GoPlus
3. Evaluasi sesuai checklist 7 poin
4. Kirim output terstruktur ke Telegram

---

## 5. Output Format

```
🚨 MICIN ANALYST — TOKEN REVIEW
────────────────────────────────
INPUT: [contract / nama / link]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ LIQUIDITY LOCK
   - LP di-lock? YES/NO
   - Platform: Unicrypt / Team.Finance / None
   - Lock duration: 365 days
   - % LP locked: 95.2%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ OWNERSHIP & CONTRACT
   - Ownership renounced? YES
   - Hidden mint/func? NO
   - Contract verified? YES (BSCScan)
   - Hidden fees? NO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ TAX & TRADING RULES
   - Buy tax: 2% (fixed)
   - Sell tax: 5% (fixed)
   - Tax can be changed? NO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ HOLDER DISTRIBUTION
   - Top 10: 32.1%
   - Deployer still holds: 5.2%
   - Wallet clusters detected? NO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SNIPER & BOT DETECTION
   - Sniper bots in first 3 blocks? NO
   - Early SNIPER alert? NO
   - Max TX manipulation? NO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ DEPLOYER HISTORY
   - Deployer wallet: 0x...1a2b
   - History: 3 tokens (1 rug)
   - Fresh wallet? NO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SOCIAL & NARASI
   - Team: ANONIM
   - Docs/website: YES
   - Socials: Twitter, Telegram (active)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SKOR RISIKO: [SEDANG]
   ✅ Green Flags (4):
      - LP locked 365 days via Unicrypt
      - Ownership renounced
      - Tax fixed, no owner override
      - Verified contract

   ❌ Red Flags (1):
      - Top 10 holder > 30%

────────────────────────────────
🎯 KESIMPULAN:
   Token layak dipantau, tapi waspada atas konsentrasi holder.

⚠️ DISCLAIMER:
   Ini BUKAN rekomendasi finansial. Investasi tetap berisiko.
   Lakukan DYOR lebih lanjut sebelum membeli.
```

---

## 6. Aturan Ketat (Embedded in Bot)

- ✅ **JANGAN pernah bilang "pasti aman"** — selalu ada DYOR reminder
- ✅ **Jika data LP lock/ownership tidak bisa diverifikasi → HIGH RISK**
- ✅ **Jika sniper masif di block 0-2 → warning eksplisit di bagian atas**
- ✅ **Tidak memberikan sinyal "beli sekarang" — hanya data objektif**
- ✅ **Source utama: gmgn.ai + DexScreener + RugCheck + GoPlus**

---

## 7. Maintenance

```bash
# Restart bot
pm2 restart micin-analyst

# Lihat logs
pm2 logs micin-analyst

# Update code (git pull dari repo)
cd /root/micin-scanner-analyst && git pull origin main
```

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot tidak respons | `pm2 logs micin-analyst` — cek error |
| Input tidak di-parse | Kirim contract address lengkap (0x...) |
| API error (rate limit) | Tunggu 1 menit, coba lagi |
| Token tidak ditemukan | Pastikan chain benar (BSC/ETH/Base/Solana) |

---

**⚠️ PENTING: Bot ini bukan saran finansial. Gunakan untuk DYOR saja.**