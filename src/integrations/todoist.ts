/**
 * Todoist REST API v2 integration.
 * Fetches tasks due today for morning brief.
 */

const BASE_URL = "https://api.todoist.com/rest/v2";
const TIMEOUT_MS = 10_000;

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  priority: number;        // 1 (normal) to 4 (urgent)
  due?: { date: string; datetime?: string };
  projectId?: string;
  labels: string[];
  isCompleted: boolean;
}

let apiKey: string | null = null;

export function setTodoistApiKey(key: string): void {
  apiKey = key;
}

async function todoistFetch<T>(path: string): Promise<T> {
  if (!apiKey) throw new Error("Todoist API key not configured");

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Todoist API ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

interface RawTask {
  id?: string;
  content?: string;
  description?: string;
  priority?: number;
  due?: { date?: string; datetime?: string } | null;
  project_id?: string;
  labels?: string[];
  is_completed?: boolean;
}

function mapTask(raw: RawTask): TodoistTask {
  return {
    id: raw.id ?? "",
    content: raw.content ?? "",
    description: raw.description ?? "",
    priority: raw.priority ?? 1,
    due: raw.due ? { date: raw.due.date ?? "", datetime: raw.due.datetime } : undefined,
    projectId: raw.project_id,
    labels: raw.labels ?? [],
    isCompleted: raw.is_completed ?? false,
  };
}

/**
 * Fetch tasks due today (or overdue).
 */
export async function listTodayTasks(): Promise<TodoistTask[]> {
  const raw = await todoistFetch<RawTask[]>("/tasks?filter=today|overdue");
  return raw.map(mapTask);
}

/**
 * Fetch all active tasks.
 */
export async function listActiveTasks(): Promise<TodoistTask[]> {
  const raw = await todoistFetch<RawTask[]>("/tasks");
  return raw.map(mapTask);
}
