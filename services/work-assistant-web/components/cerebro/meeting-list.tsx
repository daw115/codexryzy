"use client";

import type { MeetingQueryItem } from "@/lib/types";
import { formatDate } from "@/lib/format";

type Props = {
  meetings: MeetingQueryItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const SYNC_LABEL: Record<string, string> = {
  pending: "pending",
  partial: "partial",
  synced: "synced",
  no_actions: "brak akcji",
};

export function CerebroMeetingList({ meetings, selectedId, onSelect }: Props) {
  if (meetings.length === 0) {
    return <div className="emptyState">Brak spotkań pasujących do filtra.</div>;
  }

  return (
    <div className="signalList">
      {meetings.map((meeting) => (
        <button
          key={meeting.document_id}
          className={`mailListItem${selectedId === meeting.document_id ? " mailListItemActive" : ""}`}
          type="button"
          onClick={() => onSelect(meeting.document_id)}
        >
          <div className="listCardHeader">
            <h3 className="listCardTitle">{meeting.title}</h3>
            <span className="statusPill">{SYNC_LABEL[meeting.sync_status] ?? meeting.sync_status}</span>
          </div>
          {meeting.summary && <p className="listCardCopy">{meeting.summary}</p>}
          <div className="timelineMeta">
            <span>{meeting.meeting_day ?? formatDate(meeting.updated_at)}</span>
            <span>{meeting.action_items_count} akcji</span>
            <span>{meeting.open_tasks_count} otwartych</span>
          </div>
        </button>
      ))}
    </div>
  );
}
