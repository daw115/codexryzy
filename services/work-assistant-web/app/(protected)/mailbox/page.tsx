import { MailWorkbench } from "@/components/mail-workbench";
import { queryDocuments } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MailboxPage() {
  const documents = await queryDocuments({
    artifact_type: "email",
    limit: 24,
  });

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            E-mail
          </h1>
          <p className="text-muted-foreground mt-1">
            Analiza AI Twoich maili · {documents.documents.length} ostatnich
          </p>
        </div>
      </div>
      <MailWorkbench initialDocuments={documents.documents} />
    </div>
  );
}
