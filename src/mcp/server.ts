import { cwd } from "node:process";
import { createServer } from "node:http";
import { listInboxMessages, sendMessage, replyToMessage } from "../core/mail.js";
import { writeMemoryNote, listMemoryNotes, readMemoryNote } from "../core/memory.js";
import { getWorkspaceStatus } from "../core/status.js";
import { recoverWorkspace } from "../core/recover.js";
import { createTask, listTasks, updateTaskStatus } from "../core/tasks.js";
import { addTodoItem, listTodoItems, setTodoItemCompletion } from "../core/todos.js";
import { spawnAgent } from "../core/agents.js";
import { initializeWorkspace } from "../core/workspace.js";
import type { AgentRole, MessagePriority, MessageType, TaskStatus } from "../schema/types.js";

const MCP_SERVER_VERSION = "1.0.0";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const tools: MCPTool[] = [
  {
    name: "agentifyer_init",
    description: "Initialize a workspace for agent orchestration",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "agentifyer_spawn",
    description: "Spawn a new agent with a specific role",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Unique ID for the agent" },
        role: { type: "string", description: "Role: orchestrator, researcher, implementer, reviewer, custom" }
      },
      required: ["agentId"]
    }
  },
  {
    name: "agentifyer_send",
    description: "Send a message to an agent",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Target agent ID" },
        subject: { type: "string", description: "Message subject" },
        body: { type: "string", description: "Message body" },
        from: { type: "string", description: "Sender (default: orchestrator)" },
        priority: { type: "string", description: "Priority: low, normal, high, urgent" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "agentifyer_reply",
    description: "Reply to a message thread",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Your agent ID" },
        messageId: { type: "string", description: "Message ID to reply to" },
        body: { type: "string", description: "Reply body" }
      },
      required: ["from", "messageId", "body"]
    }
  },
  {
    name: "agentifyer_inbox",
    description: "Check inbox messages for an agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID to check" }
      },
      required: ["agentId"]
    }
  },
  {
    name: "agentifyer_status",
    description: "Get workspace status overview",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "agentifyer_task_create",
    description: "Create a task for an agent",
    inputSchema: {
      type: "object",
      properties: {
        ownerId: { type: "string", description: "Agent who should do the task" },
        title: { type: "string", description: "Task title" },
        body: { type: "string", description: "Task description" },
        priority: { type: "string", description: "Priority: low, normal, high, urgent" }
      },
      required: ["ownerId", "title", "body"]
    }
  },
  {
    name: "agentifyer_task_list",
    description: "List all tasks or filter by owner",
    inputSchema: {
      type: "object",
      properties: {
        ownerId: { type: "string", description: "Filter by owner agent ID" }
      }
    }
  },
  {
    name: "agentifyer_task_status",
    description: "Update task status",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
        status: { type: "string", description: "Status: pending, todo_ready, in_progress, blocked, completed, cancelled" }
      },
      required: ["taskId", "status"]
    }
  },
  {
    name: "agentifyer_todo",
    description: "Manage task todos",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: list, add, check, uncheck" },
        taskId: { type: "string", description: "Task ID" },
        item: { type: "string", description: "Todo item text" }
      },
      required: ["action", "taskId"]
    }
  },
  {
    name: "agentifyer_memory",
    description: "Manage agent memory notes",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: list, read, write" },
        agentId: { type: "string", description: "Agent ID" },
        noteId: { type: "string", description: "Note ID (for read)" },
        title: { type: "string", description: "Note title (for write)" },
        body: { type: "string", description: "Note body (for write)" }
      },
      required: ["action", "agentId"]
    }
  },
  {
    name: "agentifyer_recover",
    description: "Recover workspace state after crash",
    inputSchema: { type: "object", properties: {} }
  }
];

function buildToolsResponse(): object {
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  };
}

function str(arg: unknown, fallback = ""): string {
  return typeof arg === "string" ? arg : fallback;
}

function coerceRole(arg: unknown): AgentRole {
  return (arg as AgentRole) || "custom";
}

function coercePriority(arg: unknown): MessagePriority {
  return (arg as MessagePriority) || "normal";
}

function coerceMessageType(arg: unknown): MessageType {
  return (arg as MessageType) || "task_assignment";
}

function coerceTaskStatus(arg: unknown): TaskStatus {
  return (arg as TaskStatus) || "pending";
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const projectRoot = cwd();

  switch (name) {
    case "agentifyer_init": {
      return await initializeWorkspace(projectRoot);
    }
    case "agentifyer_spawn": {
      return await spawnAgent(projectRoot, str(args.agentId), coerceRole(args.role));
    }
    case "agentifyer_send": {
      return await sendMessage(projectRoot, {
        from: str(args.from) || "orchestrator",
        to: str(args.to),
        subject: str(args.subject),
        body: str(args.body),
        type: coerceMessageType(args.type),
        priority: coercePriority(args.priority),
        requiresResponse: false
      });
    }
    case "agentifyer_reply": {
      return await replyToMessage(projectRoot, {
        from: str(args.from),
        messageId: str(args.messageId),
        body: str(args.body)
      });
    }
    case "agentifyer_inbox": {
      return await listInboxMessages(projectRoot, str(args.agentId));
    }
    case "agentifyer_status": {
      return await getWorkspaceStatus(projectRoot);
    }
    case "agentifyer_task_create": {
      return await createTask(projectRoot, {
        from: str(args.from) || "orchestrator",
        ownerId: str(args.ownerId),
        title: str(args.title),
        body: str(args.body),
        priority: coercePriority(args.priority),
        acceptanceCriteria: [],
        attachments: []
      });
    }
    case "agentifyer_task_list": {
      const tasks = await listTasks(projectRoot);
      return str(args.ownerId) ? tasks.filter(t => t.ownerId === str(args.ownerId)) : tasks;
    }
    case "agentifyer_task_status": {
      return await updateTaskStatus(projectRoot, str(args.taskId), coerceTaskStatus(args.status));
    }
    case "agentifyer_todo": {
      if (str(args.action) === "list") return await listTodoItems(projectRoot, str(args.taskId));
      if (str(args.action) === "add") return await addTodoItem(projectRoot, str(args.taskId), str(args.item));
      if (str(args.action) === "check") return await setTodoItemCompletion(projectRoot, str(args.taskId), str(args.item), true);
      if (str(args.action) === "uncheck") return await setTodoItemCompletion(projectRoot, str(args.taskId), str(args.item), false);
      return { error: "Unknown todo action" };
    }
    case "agentifyer_memory": {
      const action = str(args.action);
      if (action === "list") return await listMemoryNotes(projectRoot, str(args.agentId));
      if (action === "read") return await readMemoryNote(projectRoot, str(args.agentId), str(args.noteId));
      if (action === "write") return await writeMemoryNote(projectRoot, { agentId: str(args.agentId), title: str(args.title), body: str(args.body), tags: [] });
      return { error: "Unknown memory action" };
    }
    case "agentifyer_recover": {
      return await recoverWorkspace(projectRoot);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function handleRequest(body: string): Promise<string> {
  let request: { method: string; id?: string; params?: { name: string; arguments?: Record<string, unknown> } };
  
  try {
    request = JSON.parse(body);
  } catch {
    return JSON.stringify({ error: "Invalid JSON" });
  }

  const { method, id, params } = request;

  if (method === "tools/list") {
    return JSON.stringify({ id, result: buildToolsResponse() });
  }

  if (method === "tools/call" && params?.name) {
    const result = await handleToolCall(params.name, params.arguments || {});
    return JSON.stringify({ id, result });
  }

  return JSON.stringify({ id, error: `Unknown method: ${method}` });
}

const server = createServer(async (req, res) => {
  if (req.url === "/mcp" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    const response = await handleRequest(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(response);
    return;
  }

  if (req.url === "/mcp/manifest" && req.method === "GET") {
    const manifest = {
      name: "agentifyer",
      description: "Agent orchestration workspace - manage agents, tasks, messages, and memory",
      version: MCP_SERVER_VERSION,
      tools: tools.map((t) => t.name)
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(manifest));
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = process.env.MCP_PORT || 3000;

export async function runMCPServer(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`Agentifyer MCP server running on http://localhost:${PORT}/mcp`);
      resolve();
    });
  });
}