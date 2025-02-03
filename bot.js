// api/webhook.js
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOG_CHAT_ID = process.env.LOG_CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PROVIDER = process.env.PROVIDER || 'anthropic';
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-opus-20240229";
const START_MESSAGE = process.env.START_MESSAGE || `Здравствуйте 👋 Готов помочь с переводом. Просто отправьте мне текст или голосовое сообщение, которое нужно перевести.`;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});

// Helper functions
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const maxLength = 4096;
  
  if (text.length <= maxLength) {
    await axios.post(url, {
      chat_id: chatId,
      text: text
    });
    
    if (chatId !== LOG_CHAT_ID) {
      await axios.post(url, {
        chat_id: LOG_CHAT_ID,
        text: `ChatId: ${chatId}\nMessage: ${text}`
      });
    }
  } else {
    const parts = text.match(new RegExp('.{1,' + maxLength + '}', 'g'));
    for (const part of parts) {
      await axios.post(url, {
        chat_id: chatId,
        text: part
      });
      
      if (chatId !== LOG_CHAT_ID) {
        await axios.post(url, {
          chat_id: LOG_CHAT_ID,
          text: `ChatId: ${chatId}\nMessage: ${part}`
        });
      }
    }
  }
}

async function sendChatAction(chatId, action) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;
  await axios.post(url, {
    chat_id: chatId,
    action: action
  });
}

// Your existing helper functions (correctText, translateText, isRussian, etc.)
// [Copy all the helper functions from your original code here, removing fs-specific operations]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { body } = req;
    
    if (!body.message) {
      res.status(200).json({ ok: true });
      return;
    }

    const msg = body.message;
    const chatId = msg.chat.id;
    let text = msg.text;

    await sendChatAction(chatId, 'typing');
    await sendTelegramMessage(LOG_CHAT_ID, `User: ${JSON.stringify(msg.from,null,2)}`);
    await sendTelegramMessage(LOG_CHAT_ID, `ChatId: ${chatId}`);
    
    if (text) {
      if (text === '/start') {
        await sendTelegramMessage(chatId, START_MESSAGE);
        res.status(200).json({ ok: true });
        return;
      }

      let directMessageChatId = null;
      let directMessage = null;

      if (chatId === LOG_CHAT_ID && text[0] === '/') {
        let splittedText = text.split(' ');
        directMessageChatId = parseInt(splittedText[0].replace('/', ''));
        directMessage = splittedText.slice(1).join(' ');
      }

      if (!directMessageChatId) {
        if (isRussian(text)) {
          const englishTranslation = await translateText(text, "английский");
          await sendTelegramMessage(chatId, `Перевод на английский:`);
          await sendTelegramMessage(chatId, englishTranslation);
          
          const indonesianTranslation = await translateText(text, "индонезийский");
          await sendTelegramMessage(chatId, `Перевод на индонезийский:`);
          await sendTelegramMessage(chatId, indonesianTranslation);
        } else {
          const russianTranslation = await translateText(text, "русский");
          await sendTelegramMessage(chatId, russianTranslation);
        }
      } else {
        await sendTelegramMessage(directMessageChatId, directMessage);
      }
    } else {
      await sendTelegramMessage(chatId, 'Извините, пока я понимаю только текстовые сообщения');
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    await sendTelegramMessage(LOG_CHAT_ID, `Error in webhook handler: ${error.message}`);
    res.status(200).json({ ok: true });
  }
}