import { listEvents, type CalendarEvent } from "../integrations/google/calendar.js";
import { listMessages, getMessage, type GmailMessage } from "../integrations/google/gmail.js";
import { readMemory } from "../memory/store.js";

export interface MorningBriefData {
  date: string;
  events: CalendarEvent[];
  emails: GmailMessage[];
  memoryHighlights: string;
}

export async function collectMorningBriefData(): Promise<MorningBriefData> {
  const today = new Date();
  const date = today.toISOString().split("T")[0]!;
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const [events, messageStubs, memory] = await Promise.all([
    listEvents("primary", startOfDay, endOfDay, 20).catch(() => [] as CalendarEvent[]),
    listMessages("is:unread", 10).catch(() => [] as Array<{ id: string; threadId: string }>),
    readMemory().catch(() => ""),
  ]);

  // Fetch full message details for each stub
  const emails = await Promise.all(
    messageStubs.map((stub) =>
      getMessage(stub.id).catch(
        (): GmailMessage => ({
          id: stub.id,
          threadId: stub.threadId,
          subject: "",
          from: "",
          to: "",
          date: "",
          snippet: "",
          labelIds: [],
        }),
      ),
    ),
  );

  // Extract last 500 chars of memory as highlights
  const memoryHighlights = memory.length > 500 ? memory.slice(-500) : memory;

  return { date, events, emails, memoryHighlights };
}

export async function collectUpcomingEvents(withinMinutes: number): Promise<CalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + withinMinutes * 60_000);
  try {
    return await listEvents("primary", now.toISOString(), future.toISOString(), 10);
  } catch {
    return [];
  }
}

export async function collectNewEmails(
  vipSenders: string[],
  keywords: string[],
): Promise<GmailMessage[]> {
  try {
    const parts: string[] = ["is:unread"];
    if (vipSenders.length > 0) {
      parts.push(`from:(${vipSenders.join(" OR ")})`);
    }
    if (keywords.length > 0) {
      parts.push(`{${keywords.join(" ")}}`);
    }
    const stubs = await listMessages(parts.join(" "), 10);
    // Fetch full body for each
    const full = await Promise.all(stubs.map((s) => getMessage(s.id).catch(
      (): GmailMessage => ({
        id: s.id,
        threadId: s.threadId,
        subject: "",
        from: "",
        to: "",
        date: "",
        snippet: "",
        labelIds: [],
      }),
    )));
    return full;
  } catch {
    return [];
  }
}
