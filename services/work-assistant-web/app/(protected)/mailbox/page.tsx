import { MailWorkbench } from "@/components/mail-workbench";
import { queryDocuments } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MailboxPage() {
  const documents = await queryDocuments({
    artifact_type: "email",
    limit: 24,
  });

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Asystent e-mail</span>
            <h1 className="pageTitleCompact">Maile, projekty, taski i odpowiedzi AI</h1>
          </div>
          <div className="sectionNote">{documents.documents.length} ostatnich maili</div>
        </div>
        <p className="sectionBodyCopy">
          Tu czytasz pojedynczy mail, widzisz jego kategorie i powiazane taski, a potem generujesz
          szkic odpowiedzi na podstawie calej wiedzy z serwera.
        </p>
      </section>

      <MailWorkbench initialDocuments={documents.documents} />
    </>
  );
}
