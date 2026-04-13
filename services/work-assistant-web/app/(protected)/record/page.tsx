import { RecordingConsole } from "@/components/recording-console";

export const dynamic = "force-dynamic";

export default function RecordPage() {
  return (
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
  );
}
