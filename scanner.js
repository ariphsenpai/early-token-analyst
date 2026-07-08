const TelegramBot = require('node-telegram-bot-api');
const { MicinScanner } = require('./src/MicinScanner');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
const scanner = new MicinScanner();

console.log('🚀 Micin Analyst Bot started');
console.log('Mode: ANALYST — kirim token untuk evaluasi');

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Halo! Kirim contract address, nama token, atau link chart untuk evaluasi.\n\nContoh:\n• 0x1234...abcd\n• PEPE\n• https://dexscreener.com/solana/abc123');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip commands and non-text messages
  if (!text || text.startsWith('/')) return;
  if (msg.reply_to_message) return; // Skip replies
  
  try {
    // Send "typing" indicator
    bot.sendChatAction(chatId, 'typing');
    
    // Analyze the token
    const result = await scanner.analyzeToken(chatId, text);
    
    if (!result.success) {
      bot.sendMessage(chatId, `❌ ${result.error || 'Gagal menganalisis token. Coba lagi.'}`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    bot.sendMessage(chatId, '❌ Error: ' + err.message.substring(0, 200));
  }
});
