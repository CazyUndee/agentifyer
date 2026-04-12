import { listAgents } from "./agents.js";
import { getTasksPath, getMailboxPath, getMemoryPath, getRegistryPath, listJsonFileNames, listMarkdownFileNames, readJson } from "./io.js";
import type { AgentRegistryEntry, ThreadRecord, TaskRecord } from "../schema/types.js";

export interface AgentStatusSummary {
  agent: AgentRegistryEntry;
  inboxCount: number;
  outboxCount: number;
  memoryCount: number;
  taskFileCount: number;
}

export interface WorkspaceStatusSnapshot {
  agents: AgentStatusSummary[];
  openThreadCount: number;
  closedThreadCount: number;
  taskCount: number;
  activeTaskCount: number;
}

export async function getWorkspaceStatus(projectRoot: string): Promise<WorkspaceStatusSnapshot> {
  const agents = await listAgents(projectRoot);
  const threads = await readJson<ThreadRecord[]>(getRegistryPath(projectRoot, "threads"));
  const tasks = await readJson<TaskRecord[]>(getRegistryPath(projectRoot, "tasks"));

  const agentSummaries = await Promise.all(
    agents.map(async (agent) => {
      const [inboxFiles, outboxFiles, memoryFiles, taskFiles] = await Promise.all([
        listJsonFileNames(getMailboxPath(projectRoot, agent.id, "inbox")),
        listJsonFileNames(getMailboxPath(projectRoot, agent.id, "outbox")),
        listJsonFileNames(getMemoryPath(projectRoot, agent.id)),
        listMarkdownFileNames(getTasksPath(projectRoot, agent.id))
      ]);

      return {
        agent,
        inboxCount: inboxFiles.length,
        outboxCount: outboxFiles.length,
        memoryCount: memoryFiles.length,
        taskFileCount: taskFiles.length
      };
    })
  );

  return {
    agents: agentSummaries.sort((left, right) => left.agent.id.localeCompare(right.agent.id)),
    openThreadCount: threads.filter((thread) => thread.status === "open").length,
    closedThreadCount: threads.filter((thread) => thread.status === "closed").length,
    taskCount: tasks.length,
    activeTaskCount: tasks.filter((task) => task.status === "in_progress").length
  };
}
