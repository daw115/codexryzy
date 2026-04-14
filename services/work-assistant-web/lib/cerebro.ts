import "server-only";

import { queryMeetings } from "@/lib/api";
import type { MeetingQueryItem } from "@/lib/types";

export type CerebroQueryParams = {
  limit?: number;
  date_from?: string;
  date_to?: string;
  category?: string;
  project?: string;
  sync_status?: "pending" | "partial" | "synced" | "no_actions";
  search_text?: string;
};

export async function getCerebroMeetings(params: CerebroQueryParams): Promise<MeetingQueryItem[]> {
  const result = await queryMeetings(params);
  return result.meetings;
}
