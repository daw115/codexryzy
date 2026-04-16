import { CerebroWorkbench } from "@/components/cerebro-workbench";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getCerebroMeetings } from "@/lib/cerebro";
import { Brain } from "lucide-react";


export default async function CerebroPage() {
  const meetings = await getCerebroMeetings({ limit: 30 });

  return (
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
  );
}
