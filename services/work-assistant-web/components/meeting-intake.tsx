"use client";

import { useState } from "react";

export function MeetingIntake() {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !transcript.trim()) {
      setError("Tytul i analiza spotkania sa wymagane.");
      return;
    }

    setPending(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/meetings/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          project,
          meeting_date: meetingDate || undefined,
          source_url: sourceUrl || undefined,
          summary: summary || undefined,
          transcript,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setStatus("Analiza spotkania zostala dodana do bazy wiedzy.");
      setTitle("");
      setProject("");
      setMeetingDate("");
      setSourceUrl("");
      setSummary("");
      setTranscript("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ingest spotkania nie udal sie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="sectionCard">
      <div className="sectionHeader">
        <div>
          <span className="sectionEyebrow">Meeting intake</span>
          <h2 className="sectionTitle">Wczytaj analize spotkania do knowledge base</h2>
        </div>
      </div>

      <div className="formGrid">
        <label className="field">
          <span className="fieldLabel">Tytul spotkania</span>
          <input className="fieldInput" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="fieldLabel">Projekt / obszar</span>
          <input className="fieldInput" value={project} onChange={(e) => setProject(e.target.value)} />
        </label>
        <label className="field">
          <span className="fieldLabel">Dzien spotkania</span>
          <input
            className="fieldInput"
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="fieldLabel">URL zrodla</span>
          <input className="fieldInput" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span className="fieldLabel">Streszczenie</span>
        <textarea
          className="assistantInput"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Krotkie streszczenie spotkania i glowne decyzje"
        />
      </label>

      <label className="field">
        <span className="fieldLabel">Analiza / transkrypt</span>
        <textarea
          className="assistantInput"
          rows={14}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Wklej analize wygenerowana przez inna aplikacje"
        />
      </label>

      <div className="assistantActions">
        <button className="primaryButton" type="button" onClick={submit} disabled={pending}>
          {pending ? "Wczytuje..." : "Dodaj do bazy"}
        </button>
      </div>

      {error ? <p className="formError">{error}</p> : null}
      {status ? <div className="calloutCard"><strong>Status</strong><p>{status}</p></div> : null}
    </section>
  );
}
