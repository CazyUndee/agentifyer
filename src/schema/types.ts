export type AgentRole = "orchestrator" | "researcher" | "implementer" | "reviewer" | "custom";
export type AgentStatus = "active" | "idle" | "archived";
export type MessageType = "task_assignment" | "status_update" | "question" | "response" | "note";
export type MessagePriority = "low" | "normal" | "high" | "urgent";
export type TaskStatus = "pending" | "todo_ready" | "in_progress" | "blocked" | "completed" | "cancelled";
export type SupportedAgent = "claude" | "aider" | "cursor" | "windsurf" | "roocode" | "opencode" | "cline" | "custom";

export interface MemoryNote {
  id: string;
  agentId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentIdentity {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  createdAt: string;
  lastSeenAt: string;
}

export interface WorkspaceMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  type: MessageType;
  priority: MessagePriority;
  createdAt: string;
  requiresResponse: boolean;
  body: Record<string, unknown>;
  attachments: string[];
}

export interface AgentRegistryEntry {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  createdAt: string;
  lastSeenAt: string;
  currentThreadIds: string[];
}

export interface ThreadRecord {
  id: string;
  subject: string;
  participantIds: string[];
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  body: string;
  status: TaskStatus;
  from: string;
  ownerId: string;
  priority: MessagePriority;
  threadId: string | null;
  assignmentMessageId: string | null;
  acceptanceCriteria: string[];
  attachments: string[];
  taskFilePath: string;
  todoFilePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  cli: SupportedAgent | SupportedAgent[];
  workspacePath: string;
  installedAt: string;
}
