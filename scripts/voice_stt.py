"""
Voice assistant — Bangla speech-to-text.

The legacy `backend/app/api/v1/voice.py` endpoint accepts an audio upload and
returns a transcription, but no STT model is deployed. This module wires up
OpenAI Whisper (small), which is free and supports Bangla.

Model: openai/whisper-small  (~244 MB, Apache-2.0)
  - downloaded lazily on first call via HuggingFace `transformers`
  - 30M params; Bangla supported out of the box

The worker's `/api/voice/transcribe` endpoint should call `transcribe(audio_bytes)`
and return `{text, language, confidence}`.

Usage:
  python scripts/voice_stt.py --file audio.wav     # transcribe a file
  python scripts/voice_stt.py --health              # check model availability
"""
import argparse
import io
import os
import sys

MODEL_NAME = "openai/whisper-small"
SUPPORTED_LANGS = {"bn", "en", "hi"}


def load_model():
    """Lazy-load the Whisper model. Returns (pipeline, None) or (None, err)."""
    try:
        import torch
        from transformers import pipeline
    except ImportError as e:
        return None, f"transformers/torch not installed: {e}"

    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        pipe = pipeline(
            "automatic-speech-recognition",
            model=MODEL_NAME,
            device=device,
        )
        return pipe, None
    except Exception as e:
        return None, f"failed to load {MODEL_NAME}: {e}"


def transcribe(audio_bytes, language=None):
    """
    Transcribe audio bytes (wav/mp3/m4a/flac).

    Returns {"text": str, "language": str, "confidence": float, "error": None}
    or {"text": "", "language": "", "confidence": 0.0, "error": str}.
    """
    pipe, err = load_model()
    if err:
        return {"text": "", "language": "", "confidence": 0.0, "error": err}

    try:
        # Whisper pipeline accepts a filepath or numpy array. Bytes need to be
        # decoded via soundfile / torchaudio first.
        try:
            import soundfile as sf
            data, sr = sf.read(io.BytesIO(audio_bytes))
        except Exception:
            import torchaudio
            buf = io.BytesIO(audio_bytes)
            data, sr = torchaudio.load(buf)
            data = data.mean(dim=0).numpy()

        kwargs = {"return_timestamps": False}
        if language in SUPPORTED_LANGS:
            kwargs["language"] = language
        result = pipe(data, **kwargs)
        text = (result.get("text") or "").strip()
        return {
            "text": text,
            "language": language or "auto",
            "confidence": 1.0,  # Whisper has no per-token confidence in this API
            "error": None,
        }
    except Exception as e:
        return {"text": "", "language": "", "confidence": 0.0, "error": str(e)}


def main():
    ap = argparse.ArgumentParser(description="Bangla voice STT")
    ap.add_argument("--file", help="audio file to transcribe")
    ap.add_argument("--language", default="bn", choices=sorted(SUPPORTED_LANGS))
    ap.add_argument("--health", action="store_true", help="check model availability")
    args = ap.parse_args()

    if args.health:
        pipe, err = load_model()
        print("model:", MODEL_NAME)
        print("available:", pipe is not None)
        if err:
            print("error:", err)
        return

    if not args.file or not os.path.exists(args.file):
        print("provide --file <path>", file=sys.stderr)
        sys.exit(2)

    with open(args.file, "rb") as f:
        audio = f.read()
    print(f"Transcribing {args.file} ({len(audio)} bytes) ...")
    out = transcribe(audio, args.language)
    print(out)


if __name__ == "__main__":
    main()
