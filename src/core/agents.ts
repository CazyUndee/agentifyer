import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createAgentIdentity, createAgentRegistryEntry } from "./defaults.js";
import {
  appendEvent,
  ensureTextFile,
  ensureWorkspaceInitialized,
  getAgentIdentityPath,
  getAgentRoot,
  getRegistryPath,
  getSubagentPromptPath,
  readJson,
  writeJson
} from "./io.js";
import { AGENT_WORKSPACE_SUBDIRECTORIES } from "../schema/layout.js";
import type { AgentIdentity, AgentRegistryEntry, AgentRole } from "../schema/types.js";

function createSubagentOperatingPrompt(agentId: string): string {
  return `You are operating as subagent ${agentId}.

Your workspace contains durable task files and todo files.

Required working method:
1. Read assigned task files from the tasks directory.
2. For each task, create or update the matching Markdown todo file.
3. Break the task into concrete todos.
4. Work on the todos, not directly on the task description.
5. Keep the todo Markdown file current while you work.
6. Use the todo progress when reporting status back to the orchestrator.
`;
}

export async function listAgents(projectRoot: string): Promise<AgentRegistryEntry[]> {
  await ensureWorkspaceInitialized(projectRoot);
  return readJson<AgentRegistryEntry[]>(getRegistryPath(projectRoot, "agents"));
}

export async function getAgentRegistryEntry(projectRoot: string, agentId: string): Promise<AgentRegistryEntry | undefined> {
  const agents = await listAgents(projectRoot);
  return agents.find((agent) => agent.id === agentId);
}

export async function spawnAgent(projectRoot: string, agentId: string, role: AgentRole): Promise<AgentIdentity> {
  await ensureWorkspaceInitialized(projectRoot);

  if (agentId === "orchestrator") {
    throw new Error("The orchestrator workspace already exists.");
  }

  const existingAgent = await getAgentRegistryEntry(projectRoot, agentId);
  if (existingAgent) {
    throw new Error(`Agent '${agentId}' already exists.`);
  }

  const now = new Date().toISOString();
  const agentRoot = getAgentRoot(projectRoot, agentId);
  await Promise.all(
    AGENT_WORKSPACE_SUBDIRECTORIES.map((directory) => mkdir(join(agentRoot, directory), { recursive: true }))
  );

  const identity = createAgentIdentity(agentId, role, now);
  await writeJson(getAgentIdentityPath(projectRoot, agentId), identity);
  await ensureTextFile(getSubagentPromptPath(projectRoot, agentId), createSubagentOperatingPrompt(agentId));

  const registryPath = getRegistryPath(projectRoot, "agents");
  const agents = await readJson<AgentRegistryEntry[]>(registryPath);
  agents.push(createAgentRegistryEntry(identity));
  await writeJson(registryPath, agents);

  await appendEvent(projectRoot, {
    type: "agent_spawned",
    agentId,
    role,
    createdAt: now
  });

  return identity;
}

export async function ensureAgentExists(projectRoot: string, agentId: string, role: AgentRole = "custom"): Promise<void> {
  if (agentId === "orchestrator") {
    await ensureWorkspaceInitialized(projectRoot);
    return;
  }

  const existingAgent = await getAgentRegistryEntry(projectRoot, agentId);
  if (!existingAgent) {
    await spawnAgent(projectRoot, agentId, role);
  }
}

export async function attachThreadToAgents(projectRoot: string, agentIds: string[], threadId: string, now: string): Promise<void> {
  const registryPath = getRegistryPath(projectRoot, "agents");
  const agents = await readJson<AgentRegistryEntry[]>(registryPath);
  const uniqueAgentIds = new Set(agentIds);

  const updatedAgents = agents.map((agent) => {
    if (!uniqueAgentIds.has(agent.id)) {
      return agent;
    }

    const currentThreadIds = agent.currentThreadIds.includes(threadId)
      ? agent.currentThreadIds
      : [...agent.currentThreadIds, threadId];

    return {
      ...agent,
      lastSeenAt: now,
      currentThreadIds
    };
  });

  await writeJson(registryPath, updatedAgents);
}
