import { join } from "node:path";
import { listAgents } from "./agents.js";
import {
  getEventsFilePath,
  getMailboxPath,
  getMemoryPath,
  getRegistryPath,
  listJsonFileNames,
  readJson,
  readJsonLines
} from "./io.js";
import { listTodoItems } from "./todos.js";
import type { AgentRegistryEntry, MemoryNote, TaskRecord, ThreadRecord, WorkspaceMessage } from "../schema/types.js";

export interface RecoverAgentSnapshot {
  agent: AgentRegistryEntry;
  inboxCount: number;
  latestInboxMessage: WorkspaceMessage | null;
  memoryCount: number;
  latestMemoryNote: MemoryNote | null;
  taskCount: number;
  taskSummaries: Array<{
    id: string;
    status: TaskRecord["status"];
    todoCompletedCount: number;
    todoTotalCount: number;
  }>;
}

export interface RecoverSummary {
  generatedAt: string;
  agentCount: number;
  openThreadCount: number;
  closedThreadCount: number;
  taskCount: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  completedTaskCount: number;
  pendingResponseMessageCount: number;
  recentEventCount: number;
  recentEvents: Record<string, unknown>[];
  agents: RecoverAgentSnapshot[];
}

async function readJsonFiles<T>(directoryPath: string): Promise<T[]> {
  const fileNames = await listJsonFileNames(directoryPath);
  return Promise.all(fileNames.map((fileName) => readJson<T>(join(directoryPath, fileName))));
}

async function readLatestJsonFile<T>(directoryPath: string): Promise<T | null> {
  const fileNames = await listJsonFileNames(directoryPath);
  const latestFile = fileNames.at(-1);

  if (!latestFile) {
    return null;
  }

  return readJson<T>(join(directoryPath, latestFile));
}

async function readTaskSummaries(projectRoot: string, agentId: string, tasks: TaskRecord[]): Promise<RecoverAgentSnapshot["taskSummaries"]> {
  const ownedTasks = tasks.filter((task) => task.ownerId === agentId);

  return Promise.all(
    ownedTasks.map(async (task) => {
      const todoItems = await listTodoItems(projectRoot, task.id);
      const todoCompletedCount = todoItems.filter((item) => item.completed).length;

      return {
        id: task.id,
        status: task.status,
        todoCompletedCount,
        todoTotalCount: todoItems.length
      };
    })
  );
}

async function getAgentRecoverSnapshot(projectRoot: string, agent: AgentRegistryEntry, tasks: TaskRecord[]): Promise<RecoverAgentSnapshot> {
  const inboxPath = getMailboxPath(projectRoot, agent.id, "inbox");
  const memoryPath = getMemoryPath(projectRoot, agent.id);

  const [inboxMessages, memoryFiles, latestMemoryNote, taskSummaries] = await Promise.all([
    readJsonFiles<WorkspaceMessage>(inboxPath),
    listJsonFileNames(memoryPath),
    readLatestJsonFile<MemoryNote>(memoryPath),
    readTaskSummaries(projectRoot, agent.id, tasks)
  ]);

  const latestInboxMessage = inboxMessages
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

  return {
    agent,
    inboxCount: inboxMessages.length,
    latestInboxMessage,
    memoryCount: memoryFiles.length,
    latestMemoryNote,
    taskCount: taskSummaries.length,
    taskSummaries
  };
}

export async function recoverWorkspace(projectRoot: string): Promise<RecoverSummary> {
  const [agents, threads, tasks, events] = await Promise.all([
    listAgents(projectRoot),
    readJson<ThreadRecord[]>(getRegistryPath(projectRoot, "threads")),
    readJson<TaskRecord[]>(getRegistryPath(projectRoot, "tasks")),
    readJsonLines<Record<string, unknown>>(getEventsFilePath(projectRoot))
  ]);

  const agentSnapshots = await Promise.all(
    agents.map((agent) => getAgentRecoverSnapshot(projectRoot, agent, tasks))
  );

  const recentEvents = events.slice(-10).reverse();
  const pendingResponseMessageCount = agentSnapshots.reduce((total, snapshot) => {
    const responseCount = snapshot.latestInboxMessage?.requiresResponse ? 1 : 0;
    return total + responseCount;
  }, 0);

  return {
    generatedAt: new Date().toISOString(),
    agentCount: agents.length,
    openThreadCount: threads.filter((thread) => thread.status === "open").length,
    closedThreadCount: threads.filter((thread) => thread.status === "closed").length,
    taskCount: tasks.length,
    activeTaskCount: tasks.filter((task) => task.status === "in_progress" || task.status === "todo_ready").length,
    blockedTaskCount: tasks.filter((task) => task.status === "blocked").length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    pendingResponseMessageCount,
    recentEventCount: events.length,
    recentEvents,
    agents: agentSnapshots.sort((left, right) => left.agent.id.localeCompare(right.agent.id))
  };
}
