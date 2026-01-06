import logging
from telegram import Update
from telegram.ext import Application, MessageHandler, filters
import whisper
import asyncio
from pydub import AudioSegment
import os
import tempfile

logging.basicConfig(level=logging.INFO)

# Load Whisper model (use 'base' for speed, 'large' for accuracy)
model = whisper.load_model("base")

async def transcribe_audio(file_path):
    # Load and convert to WAV if needed
    audio = AudioSegment.from_file(file_path)
    if audio.channels > 1:
        audio = audio.set_channels(1)
    wav_path = file_path.rsplit('.', 1)[0] + '.wav'
    audio.export(wav_path, format="wav")
    
    result = model.transcribe(wav_path, language="ru")  # Change language as needed
    os.remove(wav_path)
    return result["text"]

async def voice_handler(update: Update, context):
    voice = update.message.voice
    file = await context.bot.get_file(voice.file_id)
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        await file.download_to_drive(tmp.name)
        text = await transcribe_audio(tmp.name)
        os.unlink(tmp.name)
    
    await update.message.reply_text(f"📝 Transcription: {text}")

async def video_note_handler(update: Update, context):
    video_note = update.message.video_note
    file = await context.bot.get_file(video_note.file_id)
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        await file.download_to_drive(tmp.name)
        # Extract audio from video_note
        audio = AudioSegment.from_file(tmp.name, format="mp4")
        audio_path = tmp.name.rsplit('.', 1)[0] + '.ogg'
        audio.export(audio_path, format="ogg", codec="libopus")
        text = await transcribe_audio(audio_path)
        os.unlink(tmp.name)
        os.unlink(audio_path)
    
    await update.message.reply_text(f"🎥 Round video transcription: {text}")

def main():
    app = Application.builder().token("YOUR_BOT_TOKEN").build()
    app.add_handler(MessageHandler(filters.VOICE, voice_handler))
    app.add_handler(MessageHandler(filters.VIDEO_NOTE, video_note_handler))
    app.run_polling()

if __name__ == "__main__":
    main()
