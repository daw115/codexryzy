import { RecordingConsole } from "@/components/recording-console";
import { Video } from "lucide-react";

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Video className="h-6 w-6 text-primary" />
          Nagrywaj
        </h1>
        <p className="text-muted-foreground mt-1">
          Przechwytuj slajdy i transkrypt ze spotkania Teams na żywo
        </p>
      </div>
      <RecordingConsole />
    </div>
  );
}
