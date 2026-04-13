import { CerebroWorkbench } from "@/components/cerebro-workbench";
import { getCerebroMeetings } from "@/lib/cerebro";

export const dynamic = "force-dynamic";

export default async function CerebroPage() {
  const meetings = await getCerebroMeetings({ limit: 30 });

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Meeting intelligence</span>
            <h1 className="pageTitleCompact">Cerebro</h1>
          </div>
          <div className="sectionNote">{meetings.length} spotkań</div>
        </div>
        <p className="sectionBodyCopy">
          Backlog spotkań, action items, sync z Vikunja i AI plan pracy.
        </p>
      </section>
      <CerebroWorkbench initialMeetings={meetings} />
    </>
  );
}
