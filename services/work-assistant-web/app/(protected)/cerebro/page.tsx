import { CerebroWorkbench } from "@/components/cerebro-workbench";
import { getCerebroMeetingDigests } from "@/lib/cerebro";

export const dynamic = "force-dynamic";

export default async function CerebroPage() {
  const details = await getCerebroMeetingDigests({ limit: 30 });

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Ryzusiowe Lenistwo module</span>
            <h1 className="pageTitleCompact">Cerebro: spotkania, action items, AI plan</h1>
          </div>
          <div className="sectionNote">{details.length} spotkań w module</div>
        </div>
        <p className="sectionBodyCopy">
          Ten moduł przenosi rdzeń z `ryzusiowelenistwo`: backlog spotkań, wyszukiwanie, action
          items i chat AI, ale działa na Twojej obecnej bazie wiedzy i Quatarly.
        </p>
      </section>
      <CerebroWorkbench meetings={details} />
    </>
  );
}
