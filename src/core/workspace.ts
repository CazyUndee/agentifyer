import { homedir } from "node:os";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AGENTS_REGISTRY_FILE,
  EVENTS_FILE,
  POLICIES_FILE,
  REPO_PROFILE_FILE,
  TASKS_REGISTRY_FILE,
  THREADS_REGISTRY_FILE,
  WORKSPACE_DIRECTORIES,
  WORKSPACE_ROOT
} from "../schema/layout.js";
import { createOrchestratorIdentity, createRegistryDefaults, createSharedDefaults } from "./defaults.js";
import { ensureTextFile, writeTextFile, writeJson, pathExists } from "./io.js";

async function ensureDirectories(projectRoot: string): Promise<void> {
  await Promise.all(
    WORKSPACE_DIRECTORIES.map((directory) => mkdir(join(projectRoot, directory), { recursive: true }))
  );
}

export async function initializeWorkspace(projectRoot: string): Promise<string> {
  const now = new Date().toISOString();
  const workspaceRoot = join(projectRoot, WORKSPACE_ROOT);

  await ensureDirectories(projectRoot);

  const orchestratorIdentityPath = join(workspaceRoot, "orchestrator", "identity.json");
  const orchestratorIdentity = createOrchestratorIdentity(now);
  await writeJson(orchestratorIdentityPath, orchestratorIdentity);

  const registryDefaults = createRegistryDefaults();
  registryDefaults.agents[0].createdAt = now;
  registryDefaults.agents[0].lastSeenAt = now;

  await writeJson(join(projectRoot, AGENTS_REGISTRY_FILE), registryDefaults.agents);
  await writeJson(join(projectRoot, THREADS_REGISTRY_FILE), registryDefaults.threads);
  await writeJson(join(projectRoot, TASKS_REGISTRY_FILE), registryDefaults.tasks);

  const sharedDefaults = createSharedDefaults();
  await writeJson(join(projectRoot, REPO_PROFILE_FILE), sharedDefaults.repoProfile);
  await writeJson(join(projectRoot, POLICIES_FILE), sharedDefaults.policies);

  await ensureTextFile(join(projectRoot, EVENTS_FILE));

  const instructions = `# Agentifyer

This workspace uses agentifyer for multi-agent orchestration.

## Quick Start

1. Run \`agentifyer setup\` to configure
2. Add to PATH: set PATH=%USERPROFILE%\\.agentifyer\\bin;%PATH%
3. Now use: agentifyer init, agentifyer spawn, agentifyer send, etc.

## MCP Server (Claude Code)

Run the MCP server:
\`\`\`bash
node ~/.agentifyer/bin/cli.js mcp
\`\`\`

Then add to ~/Library/Application Support/Claude/mcp_servers.json:
\`\`\`json
{
  "mcpServers": {
    "agentifyer": {
      "command": "node",
      "args": ["${join(homedir(), ".agentifyer", "bin", "cli.js").replace(/\\/g, "\\\\")}", "mcp"]
    }
  }
}
\`\`\`

## Tools (MCP)

- \`agentifyer_init\` - Initialize
- \`agentifyer_spawn\` - Spawn agent
- \`agentifyer_send\` - Send message
- \`agentifyer_reply\` - Reply to message
- \`agentifyer_inbox\` - Check inbox
- \`agentifyer_status\` - Workspace status
- \`agentifyer_task_create\` - Create task
- \`agentifyer_task_list\` - List tasks
- \`agentifyer_task_status\` - Update task
- \`agentifyer_todo\` - Manage todos
- \`agentifyer_memory\` - Memory notes
- \`agentifyer_recover\` - Recover state

## Shell Commands

\`\`\`bash
af-init      # Initialize workspace
af-spawn    # Spawn new agent
af-send     # Send message
af-reply    # Reply to message
af-inbox    # Check inbox
af-status   # Workspace status
af-task     # Task management
af-todo     # Todo management
af-memory   # Memory notes
af-recover   # Recover state
\`\`\`
`;

  const claudeMdPath = join(projectRoot, "CLAUDE.md");
  const agentMdPath = join(projectRoot, "AGENT.md");
  const agentifyerMdPath = join(projectRoot, "agentifyer.md");

  const existingMdPath = await pathExists(claudeMdPath)
    ? claudeMdPath
    : await pathExists(agentMdPath)
      ? agentMdPath
      : null;

  if (existingMdPath) {
    const existing = await readFile(existingMdPath, "utf8");
    if (!existing.includes("agentifyer")) {
      const appendSection = `\n\n---\n\n${instructions}`;
      await writeTextFile(existingMdPath, existing + appendSection);
    }
  } else {
    await writeTextFile(agentifyerMdPath, instructions);
  }

  return workspaceRoot;
}
