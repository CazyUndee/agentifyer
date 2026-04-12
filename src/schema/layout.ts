export const WORKSPACE_ROOT = ".agentifyer" as const;
export const ORCHESTRATOR_ROOT = ".agentifyer/orchestrator" as const;
export const AGENTS_ROOT = ".agentifyer/agents" as const;
export const REGISTRY_ROOT = ".agentifyer/registry" as const;
export const SHARED_ROOT = ".agentifyer/shared" as const;
export const RUNTIME_ROOT = ".agentifyer/runtime" as const;

export const AGENT_WORKSPACE_SUBDIRECTORIES = ["inbox", "send", "outbox", "memory", "artifacts", "logs", "tasks"] as const;

export const WORKSPACE_DIRECTORIES = [
  ".agentifyer/orchestrator/inbox",
  ".agentifyer/orchestrator/send",
  ".agentifyer/orchestrator/outbox",
  ".agentifyer/orchestrator/memory",
  ".agentifyer/orchestrator/artifacts",
  ".agentifyer/orchestrator/logs",
  ".agentifyer/orchestrator/tasks",
  ".agentifyer/agents",
  ".agentifyer/registry",
  ".agentifyer/shared",
  ".agentifyer/runtime"
] as const;

export const REGISTRY_FILES = [
  ".agentifyer/registry/agents.json",
  ".agentifyer/registry/threads.json",
  ".agentifyer/registry/tasks.json"
] as const;

export const AGENTS_REGISTRY_FILE = ".agentifyer/registry/agents.json" as const;
export const THREADS_REGISTRY_FILE = ".agentifyer/registry/threads.json" as const;
export const TASKS_REGISTRY_FILE = ".agentifyer/registry/tasks.json" as const;

export const SHARED_FILES = [
  ".agentifyer/shared/repo-profile.json",
  ".agentifyer/shared/policies.json"
] as const;

export const REPO_PROFILE_FILE = ".agentifyer/shared/repo-profile.json" as const;
export const POLICIES_FILE = ".agentifyer/shared/policies.json" as const;

export const RUNTIME_FILES = [
  ".agentifyer/runtime/events.jsonl"
] as const;

export const EVENTS_FILE = ".agentifyer/runtime/events.jsonl" as const;
export const SUBAGENT_PROMPT_FILE_NAME = "agent-prompt.md" as const;
