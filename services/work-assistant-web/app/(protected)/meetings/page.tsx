import { MeetingIntake } from "@/components/meeting-intake";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { queryMeetings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";


export default async function MeetingsPage() {
  const meetings = await queryMeetings({ limit: 20 });

  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-accent" />
          Spotkania
        </h1>
        <p className="text-muted-foreground mt-1">
          Analizy spotkań jako źródło wiedzy · {meetings.meetings.length} ostatnich
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MeetingIntake />

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Ostatnio wgrane spotkania</CardTitle>
          </CardHeader>
          <CardContent>
            {meetings.meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nie ma jeszcze analiz spotkań w bazie
              </p>
            ) : (
              <div className="space-y-3">
                {meetings.meetings.map((meeting) => (
                  <div
                    key={meeting.document_id}
                    className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium truncate">{meeting.title}</p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {meeting.sync_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {meeting.summary ?? "Brak streszczenia"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {meeting.meeting_day ?? "bez daty"} · {meeting.category ?? "meeting"} · open tasks: {meeting.open_tasks_count}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
