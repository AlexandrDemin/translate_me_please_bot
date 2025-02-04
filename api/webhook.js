import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

// Set ffmpeg path
ffmpeg.setFfmpegPath('./ffmpeg');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOG_CHAT_ID = parseInt(process.env.LOG_CHAT_ID);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PROVIDER = process.env.PROVIDER || 'anthropic';
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
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

async function correctText(text) {
  try {
    const systemMsg = `Вы - профессиональный корректор, специализирующийся на обработке расшифровок устной речи. Ваша задача - минимальное редактирование текста для обеспечения его грамматической корректности при сохранении естественности устной речи.

ПРИНЦИПЫ КОРРЕКТУРЫ:
1. Обязательные исправления
- Орфографические ошибки и опечатки
- Пунктуационные ошибки
- Грубые грамматические ошибки
- Явные ошибки согласования
- Неверное употребление падежей

2. Сохранять без изменений
- Разговорные конструкции
- Порядок слов (если грамматически допустим)
- Лексические особенности устной речи
- Повторы и самоисправления
- Междометия и слова-паразиты
- Эмоциональные выражения
- Диалектные особенности
- Обращения и вопросы
- Нецензурную лексику

3. Форматирование
- Сохранять исходное деление на предложения
- Разделять на абзацы только при длинных паузах или явной смене темы
- Оформлять прямую речь согласно правилам
- Использовать тире в диалогах
- Сохранять эмоциональную пунктуацию (! ...)

4. Особые случаи
- Сохранять профессиональный жаргон
- Оставлять специфические термины
- Не исправлять намеренные отклонения от нормы
- Сохранять особенности речи конкретных людей
- Не реагировать на вопросы в тексте

ПРАВИЛА ВЫВОДА:
1. Формат ответа
- Возвращать только исправленный текст
- Никогда не давать пояснений и комментариев
- Не предлагать улучшений
- Не отвечать на вопросы в тексте
- Не форматировать текст как диалог
- Не разбивать короткие сообщения на отдельные строки

2. Приоритеты при правке
- Минимальное вмешательство
- Сохранение особенностей устной речи
- Обеспечение читаемости
- Исправление только явных ошибок

3. При неоднозначности
- Выбирать вариант с минимальными изменениями
- Сохранять разговорный стиль
- Учитывать контекст всего сообщения
- В сложных случаях оставлять как есть

КОНТРОЛЬ КАЧЕСТВА:
- Проверять грамматическую корректность
- Оценивать естественность звучания
- Контролировать сохранение смысла
- Проверять связность текста
- Не добавлять собственные размышления или ответы`
    if (PROVIDER === 'openai') {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {"role": "system", "content": systemMsg},
          {"role": "user", "content": text}
        ],
      });
      const completion = response.choices[0].message.content.trim();
      return completion;
    }

    if (PROVIDER === 'anthropic') {
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemMsg,
        messages: [ { role: "user", content: text } ],
      });
      return msg['content'][0]['text']
    }
  } catch (error) {
    await sendTelegramMessage(LOG_CHAT_ID, `Error in correction: ${error}`);
    return 'Correction error occurred';
  }
}

async function translateText(text, targetLang) {
  try {
    const systemMsg = `Вы - высококвалифицированный переводчик. Ваша задача - создать профессиональный перевод на ${targetLang}, который точно передает смысл и звучит естественно для носителей языка.

ОСНОВНЫЕ ПРИНЦИПЫ:
1. Точность перевода
- Сохранять фактическую информацию и детали
- При неоднозначности руководствоваться контекстом
- Учитывать культурные особенности
- Не добавлять и не убирать информацию

2. Стиль и тон
- Сохранять регистр речи
- Передавать эмоциональную окраску
- Адаптировать идиомы к целевой культуре
- Использовать естественные конструкции

3. Специальные элементы
- Использовать принятые переводы терминов
- Сохранять имена собственные
- Конвертировать единицы измерения
- Сохранять форматирование

4. Структура
- Следовать правилам пунктуации ${targetLang}
- Сохранять структуру абзацев
- Сохранять оформление списков и таблиц
- Поддерживать логические связи

5. Культурная адаптация
- Адаптировать культурные референции
- Учитывать различия в коннотациях
- При необходимости давать краткие пояснения

ПРАВИЛА ВЫВОДА:
- Возвращать только перевод
- Не давать комментариев
- Не предлагать альтернативы
- Не отвечать на вопросы в тексте
- Сохранять исходное форматирование
- При неоднозначности выбирать ближайший по смыслу вариант`
    if (PROVIDER === 'openai') {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {"role": "system", "content": systemMsg},
          {"role": "user", "content": text}
        ],
      });
      const completion = response.choices[0].message.content.trim();
      return completion;
    }

    if (PROVIDER === 'anthropic') {
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemMsg,
        messages: [ { role: "user", content: text } ],
      });
      return msg['content'][0]['text']
    }
  } catch (error) {
    await sendTelegramMessage(LOG_CHAT_ID, `Error in translation: ${error}`);
    return 'Translation error occurred';
  }
}

function isRussian(text) {
  return /[\u0400-\u04FF]/.test(text);
}

async function sendPhoto(chatId, photoId) {
  await axios.post(`${TELEGRAM_API}/sendPhoto`, {
    chat_id: chatId,
    photo: photoId
  });
}

async function sendVoice(chatId, voiceId) {
  await axios.post(`${TELEGRAM_API}/sendVoice`, {
    chat_id: chatId,
    voice: voiceId
  });
}

async function sendVideo(chatId, videoId) {
  await axios.post(`${TELEGRAM_API}/sendVideo`, {
    chat_id: chatId,
    video: videoId
  });
}

async function sendDocument(chatId, documentId) {
  await axios.post(`${TELEGRAM_API}/sendDocument`, {
    chat_id: chatId,
    document: documentId
  });
}

async function sendAudio(chatId, audioId) {
  await axios.post(`${TELEGRAM_API}/sendAudio`, {
    chat_id: chatId,
    audio: audioId
  });
}

async function sendVideoNote(chatId, videoNoteId) {
  await axios.post(`${TELEGRAM_API}/sendVideoNote`, {
    chat_id: chatId,
    video_note: videoNoteId
  });
}

async function sendSticker(chatId, stickerId) {
  await axios.post(`${TELEGRAM_API}/sendSticker`, {
    chat_id: chatId,
    sticker: stickerId
  });
}

async function sendLocation(chatId, latitude, longitude) {
  await axios.post(`${TELEGRAM_API}/sendLocation`, {
    chat_id: chatId,
    latitude,
    longitude
  });
}

async function sendContact(chatId, phoneNumber, firstName, options = {}) {
  await axios.post(`${TELEGRAM_API}/sendContact`, {
    chat_id: chatId,
    phone_number: phoneNumber,
    first_name: firstName,
    last_name: options.last_name,
    vcard: options.vcard
  });
}

// Voice message handling with OpenAI

async function convertAudio(inputBuffer, fromFormat, toFormat) {
  const inputPath = join('/tmp', `input.${fromFormat}`);
  const outputPath = join('/tmp', `output.${toFormat}`);

  try {
    // Write input buffer to temporary file
    await writeFile(inputPath, inputBuffer);

    // Convert using ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .toFormat(toFormat)
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // Read the converted file
    const outputBuffer = await readFile(outputPath);

    // Cleanup
    await Promise.all([
      unlink(inputPath),
      unlink(outputPath)
    ]);

    return outputBuffer;
  } catch (error) {
    // Cleanup on error
    try {
      await Promise.all([
        unlink(inputPath).catch(() => {}),
        unlink(outputPath).catch(() => {})
      ]);
    } catch (e) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

async function transcribeFile(audioFile) {
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
  });
  return transcription.text;
}

function isFormatSupported(mimeType) {
  const supportedFormats = [
    'audio/flac', 
    'audio/m4a',
    'audio/mp3', 
    'audio/mpeg',
    'audio/mpga',
    'audio/oga',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'video/mp4',
    'video/webm'
  ];
  return supportedFormats.includes(mimeType);
}

async function getFile(fileId) {
  const response = await axios.get(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${response.data.result.file_path}`;
}

async function processVoiceMessage(fileId) {
  const fileUrl = await getFile(fileId);
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  
  // Create a File object from the audio data
  const audioFile = new File([response.data], 'audio.ogg', { type: 'audio/ogg' });

  return await transcribeFile(audioFile);
}

async function processAudioFile(fileId, mimeType) {
  const fileData = await downloadTelegramFile(fileId);
  
  let audioData = fileData;
  let finalMimeType = mimeType;

  // Convert unsupported formats
  if (!isFormatSupported(mimeType)) {
    const fromFormat = mimeType.split('/')[1];  // e.g., 'opus' from 'audio/opus'
    const toFormat = 'ogg';  // Convert everything to ogg as it's well supported
    
    try {
      audioData = await convertAudio(fileData, fromFormat, toFormat);
      finalMimeType = 'audio/ogg';
    } catch (error) {
      console.error('Conversion error:', error);
      throw new Error(`Failed to convert from ${fromFormat} to ${toFormat}`);
    }
  }

  const extension = finalMimeType.split('/')[1];
  const audioFile = new File([audioData], `audio.${extension}`, { type: finalMimeType });
  
  return await transcribeFile(audioFile);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ message: 'Hello' });
    return res;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return res;
  }

  try {
    const { body } = req;
    
    if (!body.message) {
      res.status(200).json({ ok: true });
      return res;
    }

    const msg = body.message;
    const chatId = msg.chat.id;
    let text = msg.text;

    await sendChatAction(chatId, 'typing');
    await sendTelegramMessage(LOG_CHAT_ID, `User: ${JSON.stringify(msg.from,null,2)}`);
    await sendTelegramMessage(LOG_CHAT_ID, `ChatId: ${chatId}`);
    await sendTelegramMessage(LOG_CHAT_ID, `in_text: ${text}`);

    if (msg.voice) {
      const fileId = msg.voice.file_id;
      await sendVoice(LOG_CHAT_ID, fileId);
      await sendChatAction(chatId, 'typing');
      try {
        const transcription = await processVoiceMessage(fileId);
        const correctedTranscription = await correctText(transcription);
        await sendTelegramMessage(chatId, correctedTranscription);
        text = correctedTranscription;
      } catch (error) {
        console.error(error);
        await sendTelegramMessage(chatId, 'Sorry, something went wrong while processing your voice message.');
      }
    }

    if (msg.audio) {
      const fileId = msg.audio.file_id;
      const mimeType = msg.audio.mime_type || 'audio/mpeg'; // default to mp3 if not specified
      
      await sendAudio(LOG_CHAT_ID, fileId);
      await sendChatAction(chatId, 'typing');
      
      try {
        const transcription = await processAudioFile(fileId, mimeType);
        const correctedTranscription = await correctText(transcription);
        await sendTelegramMessage(chatId, correctedTranscription);
        text = correctedTranscription;
      } catch (error) {
        console.error('Audio transcription error:', error, 'Mime type:', mimeType);
        await sendTelegramMessage(chatId, 'Sorry, something went wrong while processing your audio file.');
      }
    }
    
    if (msg.photo) await sendPhoto(LOG_CHAT_ID, msg.photo[msg.photo.length - 1].file_id);
    if (msg.video) await sendVideo(LOG_CHAT_ID, msg.video.file_id);
    if (msg.document) await sendDocument(LOG_CHAT_ID, msg.document.file_id);
    if (msg.video_note) await sendVideoNote(LOG_CHAT_ID, msg.video_note.file_id);
    if (msg.sticker) await sendSticker(LOG_CHAT_ID, msg.sticker.file_id);
    if (msg.location) await sendLocation(LOG_CHAT_ID, msg.location.latitude, msg.location.longitude);
    if (msg.contact) await sendContact(LOG_CHAT_ID, msg.contact.phone_number, msg.contact.first_name, {
      last_name: msg.contact.last_name,
      vcard: msg.contact.vcard
    });
    
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
      await sendTelegramMessage(chatId, 'Извините, пока я понимаю только текстовые, голосовые и аудио сообщения');
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    await sendTelegramMessage(LOG_CHAT_ID, `Error in webhook handler: ${error.message}`);
    res.status(200).json({ ok: true });
  }
}