import json
import time
from pathlib import Path

from .config import settings
from .pipeline import ai_analyze, build_pdf_report, extract_audio, transcribe_audio


def monitor_google_drive_forever() -> None:
    print("Starting Drive monitor loop...")
    work_dir = Path("/tmp/meeting_worker")
    work_dir.mkdir(parents=True, exist_ok=True)

    while True:
        # Placeholder implementation: in production, list Drive folder and detect new files.
        demo_webm = work_dir / "meeting_recording.webm"
        if demo_webm.exists():
            day_dir = work_dir / time.strftime("%Y-%m-%d")
            day_dir.mkdir(exist_ok=True)
            wav = day_dir / "audio.wav"
            transcript_path = day_dir / "transcript.json"

            extract_audio(demo_webm, wav)
            transcript = transcribe_audio(wav, transcript_path)
            results = ai_analyze(transcript, day_dir)
            report = build_pdf_report(day_dir, results["summary"], results["tasks"], results["decisions"])

            metadata = {
                "date": time.strftime("%Y-%m-%d"),
                "title": "Detected meeting",
                "duration": 0,
                "outputs": [str(transcript_path), str(report)],
            }
            (day_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
            demo_webm.unlink(missing_ok=True)
            print("Processed demo meeting file.")

        time.sleep(settings.worker_poll_interval_sec)


if __name__ == "__main__":
    monitor_google_drive_forever()
