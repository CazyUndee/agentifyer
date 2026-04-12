# Agentifyer

A file-backed workspace for orchestrating AI coding agents. Acts as a shared backend for Claude Code, Aider, Cursor, and other AI coding tools.

## Quick Start

```bash
# Install globally
npm install -g agentifyer

# Configure your AI coding tools
agentifyer setup

# Initialize a project
cd your-project
agentifyer init
```

## What It Does

Agentifyer provides:
- **Multi-agent messaging** - Send messages between agents
- **Task management** - Create tasks with todos and acceptance criteria
- **Memory** - Persistent notes per agent
- **Workspace state** - File-backed storage for all agent data
- **MCP integration** - Tools available to Claude Code via MCP server

## Usage

```bash
# Initialize workspace (creates .agentifyer/ and CLAUDE.md)
agentifyer init

# Spawn an agent
agentifyer spawn researcher researcher

# Send a task
agentifyer send --to researcher --subject "Research APIs" --body "Find best HTTP libraries"

# Check inbox
agentifyer inbox researcher

# Create a task
agentifyer task create --owner implementer --title "Build API" --body "Implement REST endpoints"

# Manage todos
agentifyer todo add --task task-id --item "Write tests"

# Workspace status
agentifyer status

# Start MCP server for Claude Code
agentifyer mcp
```

## MCP Server (Claude Code)

Add to `~/Library/Application Support/Claude/mcp_servers.json`:

```json
{
  "mcpServers": {
    "agentifyer": {
      "command": "node",
      "args": ["~/.agentifyer/bin/cli.js", "mcp"]
    }
  }
}
```

Available MCP tools:
- `agentifyer_init` - Initialize workspace
- `agentifyer_spawn` - Spawn agent
- `agentifyer_send` - Send message
- `agentifyer_reply` - Reply to message
- `agentifyer_inbox` - Check inbox
- `agentifyer_status` - Workspace status
- `agentifyer_task_create` - Create task
- `agentifyer_task_list` - List tasks
- `agentifyer_task_status` - Update task status
- `agentifyer_todo` - Manage todos
- `agentifyer_memory` - Agent memory notes
- `agentifyer_recover` - Recover state

## Supported Agent CLIs

- Claude Code (`claude`)
- Aider (`aider`)
- Cursor (`cursor`)
- Windsurf (`windsurf`)
- Roo Code (`roocode`)
- OpenCode (`opencode`)
- Cline (`cline`)

## File Structure

```
project/
├── .agentifyer/           # Workspace data
│   ├── orchestrator/      # Orchestrator agent
│   ├── agents/            # Spawned agents
│   └── shared/            # Shared config
├── CLAUDE.md              # Instructions (or AGENT.md)
└── agentifyer.md          # Fallback instructions
```

## License

MIT
