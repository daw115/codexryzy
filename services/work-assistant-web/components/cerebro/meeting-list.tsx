"use client";

import type { MeetingQueryItem } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  meetings: MeetingQueryItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const SYNC_BADGE: Record<string, string> = {
  synced: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  partial: "bg-info/10 text-info border-info/20",
  no_actions: "bg-muted text-muted-foreground",
};

export function CerebroMeetingList({ meetings, selectedId, onSelect }: Props) {
  if (meetings.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Brak spotkań pasujących do filtra</p>;
  }

  return (
    <div className="space-y-2">
      {meetings.map((meeting) => (
        <Card
          key={meeting.document_id}
          className={cn(
            "cursor-pointer transition-colors hover:border-primary/30",
            selectedId === meeting.document_id ? "border-primary bg-primary/5" : "bg-card",
          )}
          onClick={() => onSelect(meeting.document_id)}
        >
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium truncate">{meeting.title}</p>
              <Badge
                variant="outline"
                className={`text-xs shrink-0 ${SYNC_BADGE[meeting.sync_status] ?? ""}`}
              >
                {meeting.sync_status}
              </Badge>
            </div>
            {meeting.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{meeting.summary}</p>
            )}
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>{meeting.meeting_day ?? formatDate(meeting.updated_at)}</span>
              <span>{meeting.action_items_count} akcji</span>
              <span>{meeting.open_tasks_count} otwartych</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
