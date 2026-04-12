import { access, appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import {
  AGENTS_REGISTRY_FILE,
  EVENTS_FILE,
  SUBAGENT_PROMPT_FILE_NAME,
  TASKS_REGISTRY_FILE,
  THREADS_REGISTRY_FILE,
  WORKSPACE_ROOT
} from "../schema/layout.js";

export type RegistryKind = "agents" | "threads" | "tasks";
export type MailboxKind = "inbox" | "send" | "outbox";
export type AgentWorkspaceArea = MailboxKind | "memory" | "artifacts" | "logs" | "tasks";

export function getWorkspaceRoot(projectRoot: string): string {
  return join(projectRoot, WORKSPACE_ROOT);
}

export function getOrchestratorRoot(projectRoot: string): string {
  return join(getWorkspaceRoot(projectRoot), "orchestrator");
}

export function getAgentRoot(projectRoot: string, agentId: string): string {
  return agentId === "orchestrator"
    ? getOrchestratorRoot(projectRoot)
    : join(getWorkspaceRoot(projectRoot), "agents", agentId);
}

export function getAgentAreaPath(projectRoot: string, agentId: string, area: AgentWorkspaceArea): string {
  return join(getAgentRoot(projectRoot, agentId), area);
}

export function getAgentIdentityPath(projectRoot: string, agentId: string): string {
  return join(getAgentRoot(projectRoot, agentId), "identity.json");
}

export function getMailboxPath(projectRoot: string, agentId: string, mailbox: MailboxKind): string {
  return getAgentAreaPath(projectRoot, agentId, mailbox);
}

export function getMemoryPath(projectRoot: string, agentId: string): string {
  return getAgentAreaPath(projectRoot, agentId, "memory");
}

export function getTasksPath(projectRoot: string, agentId: string): string {
  return getAgentAreaPath(projectRoot, agentId, "tasks");
}

export function getSubagentPromptPath(projectRoot: string, agentId: string): string {
  return join(getAgentRoot(projectRoot, agentId), SUBAGENT_PROMPT_FILE_NAME);
}

export function toWorkspaceRelativePath(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).replaceAll("\\", "/");
}

export function getRegistryPath(projectRoot: string, kind: RegistryKind): string {
  if (kind === "agents") {
    return join(projectRoot, AGENTS_REGISTRY_FILE);
  }

  if (kind === "threads") {
    return join(projectRoot, THREADS_REGISTRY_FILE);
  }

  return join(projectRoot, TASKS_REGISTRY_FILE);
}

export function getEventsFilePath(projectRoot: string): string {
  return join(projectRoot, EVENTS_FILE);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

export async function ensureWorkspaceInitialized(projectRoot: string): Promise<void> {
  const workspaceRoot = getWorkspaceRoot(projectRoot);

  if (!(await pathExists(workspaceRoot))) {
    throw new Error(`Workspace not initialized at ${workspaceRoot}. Run 'agentifyer init' first.`);
  }
}

export async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, "utf8");
}

export async function ensureJsonFile(filePath: string, value: unknown): Promise<void> {
  if (!(await pathExists(filePath))) {
    await writeJson(filePath, value);
  }
}

export async function ensureTextFile(filePath: string, initialContent = ""): Promise<void> {
  if (!(await pathExists(filePath))) {
    await writeFile(filePath, initialContent, "utf8");
  }
}

export async function appendEvent(projectRoot: string, event: Record<string, unknown>): Promise<void> {
  await appendFile(getEventsFilePath(projectRoot), JSON.stringify(event) + "\n", "utf8");
}

export async function listJsonFileNames(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
}

export async function listMarkdownFileNames(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

function isCommandAvailable(command: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function detectAvailableAgents(): string[] {
  const available: string[] = [];
  const commands = ["claude", "aider", "cursor", "windsurf", "roocode", "opencode", "cline"];

  for (const cmd of commands) {
    if (isCommandAvailable(cmd)) {
      available.push(cmd);
    }
  }

  return available;
}
