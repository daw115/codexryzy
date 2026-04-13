import { AssistantConsole } from "@/components/assistant-console";

export const dynamic = "force-dynamic";

export default function CopilotPage() {
  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">AI Copilot</span>
            <h1 className="pageTitleCompact">Chat AI nad Twoja baza wiedzy</h1>
          </div>
        </div>
        <p className="sectionBodyCopy">
          To jest warstwa pytan i odpowiedzi. Copilot ma korzystac z maili, dokumentow, taskow i
          ich relacji, a nie odpowiadac z pamieci modelu.
        </p>
      </section>

      <AssistantConsole />
    </>
  );
}
