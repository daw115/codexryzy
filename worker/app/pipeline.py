import json
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def extract_audio(input_webm: Path, output_wav: Path) -> None:
    import subprocess

    subprocess.run([
        "ffmpeg", "-y", "-i", str(input_webm), "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(output_wav)
    ], check=True)


def transcribe_audio(output_wav: Path, transcript_json: Path) -> list[dict]:
    # Production path: whisper.load_model(...).transcribe(...)
    transcript = [
        {"timestamp": "00:00:05", "speaker": "unknown", "text": "Meeting started and agenda reviewed."},
        {"timestamp": "00:02:15", "speaker": "unknown", "text": "We need to finish the transformer analysis before Friday."},
    ]
    transcript_json.write_text(json.dumps(transcript, indent=2), encoding="utf-8")
    return transcript


def ai_analyze(transcript: list[dict], out_dir: Path) -> dict:
    joined = "\n".join(f"{r['timestamp']} {r['text']}" for r in transcript)
    summary = f"# Meeting Summary\n\n## Highlights\n- Discussed transformer analysis timeline.\n\n## Notes\n{joined}\n"
    tasks = [{"task": "Prepare transformer model update", "owner": "Dawid", "deadline": "Friday"}]
    decisions = [{"decision": "Finalize analysis before Friday", "rationale": "Project deadline"}]
    topics = [{"topic": "Transformer parameters", "confidence": 0.91}]

    (out_dir / "meeting_summary.md").write_text(summary, encoding="utf-8")
    (out_dir / "action_items.json").write_text(json.dumps(tasks, indent=2), encoding="utf-8")
    (out_dir / "decisions.json").write_text(json.dumps(decisions, indent=2), encoding="utf-8")
    (out_dir / "topics.json").write_text(json.dumps(topics, indent=2), encoding="utf-8")

    return {"summary": summary, "tasks": tasks, "decisions": decisions, "topics": topics}


def build_pdf_report(out_dir: Path, summary_md: str, tasks: list[dict], decisions: list[dict]) -> Path:
    report_path = out_dir / "report.pdf"
    c = canvas.Canvas(str(report_path), pagesize=letter)
    c.drawString(50, 760, "AI Meeting Brain - Report")
    c.drawString(50, 740, "Summary:")
    c.drawString(50, 725, summary_md[:120])
    c.drawString(50, 700, f"Tasks: {tasks}")
    c.drawString(50, 675, f"Decisions: {decisions}")
    c.save()
    return report_path
