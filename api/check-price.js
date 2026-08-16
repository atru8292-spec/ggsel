// Проверяет цену на странице товара и шлёт уведомление в Telegram, если цена <= порога.
// Дергается по расписанию через vercel.json (crons).

const PRICE_THRESHOLD = 10000; // рублей
const PRODUCT_URL =
  'https://ggsel.net/catalog/product/avto-claude-ai-fable-5-0-max-5x-podpiska-ai-1-mesiac-102501788';

export default async function handler(req, res) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы в env' });
  }

  try {
    const response = await fetch(PRODUCT_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://ggsel.net/',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Site': 'same-origin',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      await sendTelegram(
        BOT_TOKEN,
        CHAT_ID,
        `⚠️ Не смогла открыть страницу товара (код ${response.status}). Возможно сайт блокирует запросы с сервера — нужно смотреть headers/прокси.\n${PRODUCT_URL}`
      );
      return res.status(200).json({ ok: false, reason: `http ${response.status}` });
    }

    const html = await response.text();
    const price = extractPrice(html);

    if (price === null) {
      await sendTelegram(
        BOT_TOKEN,
        CHAT_ID,
        `⚠️ Открыла страницу, но не нашла цену в HTML. Вёрстка сайта могла измениться — нужно поправить regex в extractPrice().\n${PRODUCT_URL}`
      );
      return res.status(200).json({ ok: false, reason: 'price not found' });
    }

    if (price <= PRICE_THRESHOLD) {
      await sendTelegram(
        BOT_TOKEN,
        CHAT_ID,
        `🔥 Цена упала до ${price} ₽ (порог ${PRICE_THRESHOLD} ₽)\n${PRODUCT_URL}`
      );
    }

    return res.status(200).json({ ok: true, price });
  } catch (err) {
    await sendTelegram(BOT_TOKEN, CHAT_ID, `❌ Ошибка при проверке цены: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// Пробуем несколько паттернов — на случай если цена лежит в JSON-LD, meta-теге
// или просто текстом на странице.
function extractPrice(html) {
  const patterns = [
    /"price"\s*:\s*"?(\d+(?:[.,]\d+)?)/i,
    /itemprop=["']price["']\s+content=["'](\d+(?:[.,]\d+)?)/i,
    /(\d[\d\s]{2,})\s*₽/,
    /(\d[\d\s]{2,})\s*руб/i,
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (match) {
      const num = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

async function sendTelegram(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
