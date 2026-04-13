import { MeetingIntake } from "@/components/meeting-intake";
import { queryMeetings } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const meetings = await queryMeetings({ limit: 20 });

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Meetings</span>
            <h1 className="pageTitleCompact">Spotkania online jako kolejne zrodlo wiedzy</h1>
          </div>
          <div className="sectionNote">{meetings.meetings.length} ostatnich analiz</div>
        </div>
        <p className="sectionBodyCopy">
          Wklejasz analize wygenerowana przez inna aplikacje, a backend zapisuje ja w tej samej
          knowledge base co maile i dokumenty.
        </p>
      </section>

      <div className="doubleGrid">
        <MeetingIntake />

        <section className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Recent meeting analyses</span>
              <h2 className="sectionTitle">Ostatnio wgrane spotkania</h2>
            </div>
          </div>

          <div className="signalList">
            {meetings.meetings.length ? (
              meetings.meetings.map((meeting) => (
                <article className="listCard" key={meeting.document_id}>
                  <div className="listCardHeader">
                    <h3 className="listCardTitle">{meeting.title}</h3>
                    <span className="statusPill">{meeting.sync_status}</span>
                  </div>
                  <p className="listCardCopy">{meeting.summary ?? "Brak streszczenia."}</p>
                  <div className="listCardMeta">
                    {meeting.meeting_day ?? "bez daty"} / {meeting.category ?? "meeting"} / open tasks:{" "}
                    {meeting.open_tasks_count}
                  </div>
                </article>
              ))
            ) : (
              <div className="emptyState">Nie ma jeszcze analiz spotkan w bazie.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
