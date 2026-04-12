import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getAgentRegistryEntry } from "./agents.js";
import { appendEvent, ensureWorkspaceInitialized, getMemoryPath, listJsonFileNames, readJson, writeJson } from "./io.js";
import type { MemoryNote } from "../schema/types.js";

export interface WriteMemoryNoteInput {
  agentId: string;
  title: string;
  body: string;
  tags: string[];
}

function createMemoryNoteId(): string {
  return `mem_${randomUUID()}`;
}

function createMemoryFileName(note: MemoryNote): string {
  return `${note.createdAt.replace(/[:.]/g, "-")}_${note.id}.json`;
}

async function ensureAgentCanUseMemory(projectRoot: string, agentId: string): Promise<void> {
  await ensureWorkspaceInitialized(projectRoot);

  if (agentId === "orchestrator") {
    return;
  }

  const agent = await getAgentRegistryEntry(projectRoot, agentId);
  if (!agent) {
    throw new Error(`Unknown agent '${agentId}'.`);
  }
}

export async function writeMemoryNote(projectRoot: string, input: WriteMemoryNoteInput): Promise<MemoryNote> {
  await ensureAgentCanUseMemory(projectRoot, input.agentId);

  const now = new Date().toISOString();
  const note: MemoryNote = {
    id: createMemoryNoteId(),
    agentId: input.agentId,
    title: input.title,
    body: input.body,
    tags: input.tags,
    createdAt: now,
    updatedAt: now
  };

  const filePath = join(getMemoryPath(projectRoot, input.agentId), createMemoryFileName(note));
  await writeJson(filePath, note);
  await appendEvent(projectRoot, {
    type: "memory_written",
    agentId: input.agentId,
    memoryId: note.id,
    createdAt: now
  });

  return note;
}

export async function listMemoryNotes(projectRoot: string, agentId: string): Promise<MemoryNote[]> {
  await ensureAgentCanUseMemory(projectRoot, agentId);

  const memoryPath = getMemoryPath(projectRoot, agentId);
  const fileNames = await listJsonFileNames(memoryPath);
  const notes = await Promise.all(fileNames.map((fileName) => readJson<MemoryNote>(join(memoryPath, fileName))));

  return notes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readMemoryNote(projectRoot: string, agentId: string, memoryId: string): Promise<MemoryNote> {
  const notes = await listMemoryNotes(projectRoot, agentId);
  const note = notes.find((candidate) => candidate.id === memoryId);

  if (!note) {
    throw new Error(`Memory note '${memoryId}' not found for agent '${agentId}'.`);
  }

  return note;
}
