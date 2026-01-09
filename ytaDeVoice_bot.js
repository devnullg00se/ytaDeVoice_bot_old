require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const TELEGRAM_TOKEN = process.env.TOKEN_TG_BOT;
const TOKEN_OPENAI_API = process.env.TOKEN_OPENAI_API;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ---- helper: transcribe wav/ogg/mp3 file via OpenAI Whisper ----
async function transcribeAudio(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('model', 'whisper-1');
  form.append('language', 'ru');   // change as needed

  const res = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    form,
    {
      headers: {
        Authorization: `Bearer ${TOKEN_OPENAI_API}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
    }
  );

  return res.data.text;
}

// ---- helper: download telegram file to temp path ----
async function downloadTelegramFile(fileId, ext) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
  const tmpPath = path.join('/tmp', `${fileId}${ext}`);
  const writer = fs.createWriteStream(tmpPath);

  const response = await axios.get(url, { responseType: 'stream' });
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return tmpPath;
}

// ---- voice handler (ogg -> wav -> whisper) ----
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const voice = msg.voice;

  try {
    const oggPath = await downloadTelegramFile(voice.file_id, '.ogg');
    const wavPath = oggPath.replace('.ogg', '.wav');

    await new Promise((resolve, reject) => {
      ffmpeg(oggPath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .format('wav')
        .on('end', resolve)
        .on('error', reject)
        .save(wavPath);
    });

    const text = await transcribeAudio(wavPath);

    fs.unlinkSync(oggPath);
    fs.unlinkSync(wavPath);

    await bot.sendMessage(chatId, `📝 Transcription: ${text}`);
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, '⚠️ Error while transcribing voice message');
  }
});

// ---- round video handler (mp4 -> ogg/wav -> whisper) ----
bot.on('video_note', async (msg) => {
  const chatId = msg.chat.id;
  const videoNote = msg.video_note;

  try {
    const mp4Path = await downloadTelegramFile(videoNote.file_id, '.mp4');
    const wavPath = mp4Path.replace('.mp4', '.wav');

    await new Promise((resolve, reject) => {
      ffmpeg(mp4Path)
        .noVideo()
        .audioChannels(1)
        .audioCodec('pcm_s16le')
        .format('wav')
        .on('end', resolve)
        .on('error', reject)
        .save(wavPath);
    });

    const text = await transcribeAudio(wavPath);

    fs.unlinkSync(mp4Path);
    fs.unlinkSync(wavPath);

    await bot.sendMessage(chatId, `🎥 Transcription: ${text}`);
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, '⚠️ Error while transcribing video note');
  }
});

console.log('Bot started…');
