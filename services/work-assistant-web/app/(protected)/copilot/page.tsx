import { AssistantConsole } from "@/components/assistant-console";
import { MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CopilotPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Agent AI
        </h1>
        <p className="text-muted-foreground mt-1">
          Chat AI nad Twoją bazą wiedzy — maile, dokumenty, taski
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <AssistantConsole />
      </div>
    </div>
  );
}
