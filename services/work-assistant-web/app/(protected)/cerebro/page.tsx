import { CerebroWorkbench } from "@/components/cerebro-workbench";
import { getCerebroMeetings } from "@/lib/cerebro";
<<<<<<< HEAD
=======
import { Brain } from "lucide-react";
>>>>>>> origin/main

export const dynamic = "force-dynamic";

export default async function CerebroPage() {
  const meetings = await getCerebroMeetings({ limit: 30 });

  return (
<<<<<<< HEAD
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
=======
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-accent" />
          Cerebro
        </h1>
        <p className="text-muted-foreground mt-1">
          Backlog spotkań, action items i sync z Vikunja · {meetings.length} spotkań
        </p>
      </div>
      <CerebroWorkbench initialMeetings={meetings} />
    </div>
>>>>>>> origin/main
  );
}
