import type { AgentIdentity, AgentRegistryEntry, AgentRole, ThreadRecord } from "../schema/types.js";

export function createOrchestratorIdentity(now: string): AgentIdentity {
  return createAgentIdentity("orchestrator", "orchestrator", now);
}

export function createAgentIdentity(id: string, role: AgentRole, now: string): AgentIdentity {
  return {
    id,
    role,
    status: "active",
    createdAt: now,
    lastSeenAt: now
  };
}

export function createAgentRegistryEntry(identity: AgentIdentity): AgentRegistryEntry {
  return {
    id: identity.id,
    role: identity.role,
    status: identity.status,
    createdAt: identity.createdAt,
    lastSeenAt: identity.lastSeenAt,
    currentThreadIds: []
  };
}

export function createThreadRecord(id: string, subject: string, participantIds: string[], now: string): ThreadRecord {
  return {
    id,
    subject,
    participantIds,
    status: "open",
    createdAt: now,
    updatedAt: now
  };
}

export function createRegistryDefaults() {
  return {
    agents: [createAgentRegistryEntry(createAgentIdentity("orchestrator", "orchestrator", ""))],
    threads: [],
    tasks: []
  };
}

export function createSharedDefaults() {
  return {
    repoProfile: {
      name: null,
      detectedStack: [],
      packageManager: null,
      commands: {
        build: null,
        test: null,
        lint: null,
        typecheck: null
      }
    },
    policies: {
      protectedPaths: [],
      generatedPaths: [],
      requiredChecks: []
    }
  };
}
