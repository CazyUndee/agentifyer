import { copyFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureAgentExists, getAgentRegistryEntry, attachThreadToAgents } from "./agents.js";
import { createThreadRecord } from "./defaults.js";
import {
  appendEvent,
  ensureWorkspaceInitialized,
  getMailboxPath,
  getRegistryPath,
  listJsonFileNames,
  readJson,
  writeJson
} from "./io.js";
import type { AgentRole, MessagePriority, MessageType, ThreadRecord, WorkspaceMessage } from "../schema/types.js";

export interface SendMessageInput {
  from: string;
  to: string;
  subject: string;
  body: string;
  type: MessageType;
  priority: MessagePriority;
  requiresResponse: boolean;
  threadId?: string;
  targetRole?: AgentRole;
  attachments?: string[];
}

function createThreadId(): string {
  return `thread_${randomUUID()}`;
}

function createMessageId(): string {
  return `msg_${randomUUID()}`;
}

function createMessageFileName(message: WorkspaceMessage): string {
  return `${message.createdAt.replace(/[:.]/g, "-")}_${message.id}.json`;
}

export async function sendMessage(projectRoot: string, input: SendMessageInput): Promise<WorkspaceMessage> {
  await ensureWorkspaceInitialized(projectRoot);

  const sender = await getAgentRegistryEntry(projectRoot, input.from);
  if (input.from !== "orchestrator" && !sender) {
    throw new Error(`Unknown sender '${input.from}'.`);
  }

  await ensureAgentExists(projectRoot, input.to, input.targetRole ?? "custom");

  const now = new Date().toISOString();
  const threadsPath = getRegistryPath(projectRoot, "threads");
  const threads = await readJson<ThreadRecord[]>(threadsPath);

  let thread = input.threadId ? threads.find((candidate) => candidate.id === input.threadId) : undefined;
  if (!thread) {
    thread = createThreadRecord(createThreadId(), input.subject, [input.from, input.to], now);
    threads.push(thread);
  } else {
    const updatedThread: ThreadRecord = {
      ...thread,
      subject: input.subject,
      updatedAt: now,
      participantIds: Array.from(new Set([...thread.participantIds, input.from, input.to]))
    };

    const threadIndex = threads.findIndex((candidate) => candidate.id === updatedThread.id);
    threads[threadIndex] = updatedThread;
    thread = updatedThread;
  }

  const activeThread = thread;
  if (!activeThread) {
    throw new Error("Failed to create or load thread for message delivery.");
  }

  await writeJson(threadsPath, threads);

  const message: WorkspaceMessage = {
    id: createMessageId(),
    threadId: activeThread.id,
    from: input.from,
    to: input.to,
    subject: input.subject,
    type: input.type,
    priority: input.priority,
    createdAt: now,
    requiresResponse: input.requiresResponse,
    body: {
      text: input.body
    },
    attachments: input.attachments ?? []
  };

  const fileName = createMessageFileName(message);
  const sendPath = join(getMailboxPath(projectRoot, input.from, "send"), fileName);
  const inboxPath = join(getMailboxPath(projectRoot, input.to, "inbox"), fileName);
  const outboxPath = join(getMailboxPath(projectRoot, input.from, "outbox"), fileName);

  await writeJson(sendPath, message);
  await copyFile(sendPath, inboxPath);
  await copyFile(sendPath, outboxPath);
  await unlink(sendPath);

  await attachThreadToAgents(projectRoot, [input.from, input.to], activeThread.id, now);
  await appendEvent(projectRoot, {
    type: "message_delivered",
    messageId: message.id,
    threadId: activeThread.id,
    from: input.from,
    to: input.to,
    createdAt: now
  });

  return message;
}

export async function getInboxMessage(projectRoot: string, agentId: string, messageId: string): Promise<WorkspaceMessage> {
  const messages = await listInboxMessages(projectRoot, agentId);
  const message = messages.find((candidate) => candidate.id === messageId);

  if (!message) {
    throw new Error(`Message '${messageId}' not found in inbox for '${agentId}'.`);
  }

  return message;
}

export interface ReplyMessageInput {
  from: string;
  messageId: string;
  body: string;
  subject?: string;
  type?: MessageType;
  priority?: MessagePriority;
  requiresResponse?: boolean;
}

export async function replyToMessage(projectRoot: string, input: ReplyMessageInput): Promise<WorkspaceMessage> {
  const sourceMessage = await getInboxMessage(projectRoot, input.from, input.messageId);

  return sendMessage(projectRoot, {
    from: input.from,
    to: sourceMessage.from,
    subject: input.subject ?? `Re: ${sourceMessage.subject}`,
    body: input.body,
    type: input.type ?? "response",
    priority: input.priority ?? sourceMessage.priority,
    requiresResponse: input.requiresResponse ?? false,
    threadId: sourceMessage.threadId
  });
}

export async function listInboxMessages(projectRoot: string, agentId: string): Promise<WorkspaceMessage[]> {
  await ensureWorkspaceInitialized(projectRoot);

  if (agentId !== "orchestrator") {
    const agent = await getAgentRegistryEntry(projectRoot, agentId);
    if (!agent) {
      throw new Error(`Unknown agent '${agentId}'.`);
    }
  }

  const inboxPath = getMailboxPath(projectRoot, agentId, "inbox");
  const fileNames = await listJsonFileNames(inboxPath);
  const messages = await Promise.all(fileNames.map((fileName) => readJson<WorkspaceMessage>(join(inboxPath, fileName))));

  return messages.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
