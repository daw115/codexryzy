import { RecordingConsole } from "@/components/recording-console";
<<<<<<< HEAD
=======
import { Video } from "lucide-react";
>>>>>>> origin/main

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
<<<<<<< HEAD
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Meeting recorder</span>
            <h1 className="pageTitleCompact">Nagrywaj spotkanie Teams</h1>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Przechwytuje slajdy i transkrypt na żywo z okna Teams. Po zakończeniu AI generuje
          podsumowanie, action items i decyzje — automatycznie trafiają do Cerebro.
        </p>
      </section>
      <RecordingConsole />
    </>
=======
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
>>>>>>> origin/main
  );
}
