#!/usr/bin/env node
import { cwd } from "node:process";
import { listInboxMessages, replyToMessage, sendMessage } from "./core/mail.js";
import { writeMemoryNote, listMemoryNotes, readMemoryNote } from "./core/memory.js";
import { recoverWorkspace } from "./core/recover.js";
import { getWorkspaceStatus } from "./core/status.js";
import { createTask, getTask, listTaskMarkdownFiles, listTasks, updateTaskStatus } from "./core/tasks.js";
import { addTodoItem, listTodoItems, setTodoItemCompletion } from "./core/todos.js";
import { spawnAgent } from "./core/agents.js";
import { initializeWorkspace } from "./core/workspace.js";
import { runSetup } from "./core/setup.js";
import type { AgentRole, AgentConfig, MemoryNote, MessagePriority, MessageType, TaskRecord, TaskStatus } from "./schema/types.js";

interface ParsedArgs {
  positionals: string[];
  options: Map<string, string | boolean>;
}

function printHelp(): void {
  console.log(`agentifyer

Usage:
  agentifyer init
  agentifyer setup
  agentifyer spawn <agent-id> [role]
  agentifyer send --to <agent-id> --subject <text> --body <text> [--from <agent-id>] [--type <kind>] [--priority <level>] [--thread <thread-id>] [--role <agent-role>] [--requires-response]
  agentifyer reply --from <agent-id> --message <message-id> --body <text> [--subject <text>] [--type <kind>] [--priority <level>] [--requires-response]
  agentifyer inbox <agent-id>
  agentifyer status
  agentifyer recover
  agentifyer task create --owner <agent-id> --title <text> --body <text> [--from <agent-id>] [--priority <level>] [--thread <thread-id>] [--acceptance <item1|item2>] [--attachments <path1,path2>]
  agentifyer task list [--owner <agent-id>]
  agentifyer task read --id <task-id>
  agentifyer task files --agent <agent-id>
  agentifyer task status --id <task-id> --value <status>
  agentifyer todo list --task <task-id>
  agentifyer todo add --task <task-id> --item <text>
  agentifyer todo check --task <task-id> --item <text>
  agentifyer todo uncheck --task <task-id> --item <text>
  agentifyer memory write --agent <agent-id> --title <text> --body <text> [--tags <comma-separated>]
  agentifyer memory list --agent <agent-id>
  agentifyer memory read --agent <agent-id> --id <memory-id>
  agentifyer help

Global flags:
  --json  Output JSON instead of human-readable text`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      options.set(key, true);
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  return { positionals, options };
}

function getRequiredStringOption(options: Map<string, string | boolean>, key: string): string {
  const value = options.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required option --${key}.`);
  }

  return value;
}

function getOptionalStringOption(options: Map<string, string | boolean>, key: string): string | undefined {
  const value = options.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function getBooleanOption(options: Map<string, string | boolean>, key: string): boolean {
  return options.get(key) === true;
}

function getTagsOption(options: Map<string, string | boolean>, key: string): string[] {
  const value = getOptionalStringOption(options, key);
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function getPipeSeparatedOption(options: Map<string, string | boolean>, key: string): string[] {
  const value = getOptionalStringOption(options, key);
  if (!value) {
    return [];
  }

  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function printInbox(agentId: string, messages: Awaited<ReturnType<typeof listInboxMessages>>): void {
  if (messages.length === 0) {
    console.log(`Inbox for ${agentId} is empty.`);
    return;
  }

  console.log(`Inbox for ${agentId}:`);
  for (const message of messages) {
    const text = typeof message.body.text === "string" ? message.body.text : "";
    console.log(`- ${message.id}`);
    console.log(`  from: ${message.from}`);
    console.log(`  subject: ${message.subject}`);
    console.log(`  thread: ${message.threadId}`);
    console.log(`  priority: ${message.priority}`);
    console.log(`  created: ${message.createdAt}`);
    console.log(`  body: ${text}`);
  }
}

function printStatus(snapshot: Awaited<ReturnType<typeof getWorkspaceStatus>>): void {
  console.log("Workspace status:");
  console.log(`- open threads: ${snapshot.openThreadCount}`);
  console.log(`- closed threads: ${snapshot.closedThreadCount}`);
  console.log(`- tasks: ${snapshot.taskCount}`);
  console.log(`- active tasks: ${snapshot.activeTaskCount}`);
  console.log("- agents:");

  for (const summary of snapshot.agents) {
    console.log(`  - ${summary.agent.id} (${summary.agent.role}, ${summary.agent.status})`);
    console.log(`    inbox: ${summary.inboxCount}`);
    console.log(`    outbox: ${summary.outboxCount}`);
    console.log(`    memory: ${summary.memoryCount}`);
    console.log(`    task files: ${summary.taskFileCount}`);
    console.log(`    threads: ${summary.agent.currentThreadIds.length}`);
  }
}

function printMemoryList(agentId: string, notes: MemoryNote[]): void {
  if (notes.length === 0) {
    console.log(`No memory notes for ${agentId}.`);
    return;
  }

  console.log(`Memory for ${agentId}:`);
  for (const note of notes) {
    const tags = note.tags.length > 0 ? note.tags.join(", ") : "none";
    console.log(`- ${note.id}`);
    console.log(`  title: ${note.title}`);
    console.log(`  tags: ${tags}`);
    console.log(`  updated: ${note.updatedAt}`);
  }
}

function printMemoryNote(note: MemoryNote): void {
  const tags = note.tags.length > 0 ? note.tags.join(", ") : "none";
  console.log(`Memory note ${note.id}:`);
  console.log(`- agent: ${note.agentId}`);
  console.log(`- title: ${note.title}`);
  console.log(`- tags: ${tags}`);
  console.log(`- updated: ${note.updatedAt}`);
  console.log(`- body: ${note.body}`);
}

function printTask(task: TaskRecord): void {
  const acceptance = task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.join(" | ") : "none";
  const attachments = task.attachments.length > 0 ? task.attachments.join(", ") : "none";
  console.log(`Task ${task.id}:`);
  console.log(`- title: ${task.title}`);
  console.log(`- from: ${task.from}`);
  console.log(`- owner: ${task.ownerId}`);
  console.log(`- status: ${task.status}`);
  console.log(`- priority: ${task.priority}`);
  console.log(`- thread: ${task.threadId ?? "none"}`);
  console.log(`- assignment message: ${task.assignmentMessageId ?? "none"}`);
  console.log(`- task file: ${task.taskFilePath}`);
  console.log(`- todo file: ${task.todoFilePath}`);
  console.log(`- acceptance: ${acceptance}`);
  console.log(`- attachments: ${attachments}`);
  console.log(`- body: ${task.body}`);
}

function printTaskList(tasks: TaskRecord[]): void {
  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  for (const task of tasks) {
    console.log(`- ${task.id} | ${task.ownerId} | ${task.status} | ${task.title}`);
  }
}

function printTaskFiles(agentId: string, fileNames: string[]): void {
  if (fileNames.length === 0) {
    console.log(`No task files for ${agentId}.`);
    return;
  }

  console.log(`Task files for ${agentId}:`);
  for (const fileName of fileNames) {
    console.log(`- ${fileName}`);
  }
}

function printTodoItems(taskId: string, items: Awaited<ReturnType<typeof listTodoItems>>): void {
  if (items.length === 0) {
    console.log(`No todo items for ${taskId}.`);
    return;
  }

  console.log(`Todos for ${taskId}:`);
  for (const item of items) {
    console.log(`- [${item.completed ? "x" : " "}] ${item.text}`);
  }
}

function printRecoverSummary(summary: Awaited<ReturnType<typeof recoverWorkspace>>): void {
  console.log("Recovered workspace state:");
  console.log(`- generated: ${summary.generatedAt}`);
  console.log(`- agents: ${summary.agentCount}`);
  console.log(`- open threads: ${summary.openThreadCount}`);
  console.log(`- closed threads: ${summary.closedThreadCount}`);
  console.log(`- tasks: ${summary.taskCount}`);
  console.log(`- active tasks: ${summary.activeTaskCount}`);
  console.log(`- blocked tasks: ${summary.blockedTaskCount}`);
  console.log(`- completed tasks: ${summary.completedTaskCount}`);
  console.log(`- pending response messages: ${summary.pendingResponseMessageCount}`);
  console.log(`- events logged: ${summary.recentEventCount}`);
  console.log("- recent events:");

  if (summary.recentEvents.length === 0) {
    console.log("  - none");
  } else {
    for (const event of summary.recentEvents) {
      console.log(`  - ${JSON.stringify(event)}`);
    }
  }

  console.log("- agents:");
  for (const snapshot of summary.agents) {
    console.log(`  - ${snapshot.agent.id} (${snapshot.agent.role}, ${snapshot.agent.status})`);
    console.log(`    inbox: ${snapshot.inboxCount}`);
    console.log(`    memory: ${snapshot.memoryCount}`);
    console.log(`    tasks: ${snapshot.taskCount}`);

    if (snapshot.latestInboxMessage) {
      console.log(`    latest inbox message: ${snapshot.latestInboxMessage.id} from ${snapshot.latestInboxMessage.from}`);
    }

    if (snapshot.latestMemoryNote) {
      console.log(`    latest memory note: ${snapshot.latestMemoryNote.id} ${snapshot.latestMemoryNote.title}`);
    }

    for (const task of snapshot.taskSummaries) {
      console.log(`    task ${task.id}: ${task.status} (${task.todoCompletedCount}/${task.todoTotalCount} todos complete)`);
    }
  }
}

const jsonMode = process.argv.includes("--json");

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  const parsedArgs = parseArgs(process.argv.slice(3));

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "setup") {
    const config = await runSetup();
    if (jsonMode) {
      console.log(JSON.stringify(config));
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
    return;
  }

  if (command === "mcp") {
    const { runMCPServer } = await import("./mcp/server.js");
    await runMCPServer();
    return;
  }

  if (command === "init") {
    const workspaceRoot = await initializeWorkspace(cwd());

    if (jsonMode) {
      console.log(JSON.stringify({ workspaceRoot }));
    } else {
      console.log(`Initialized workspace at ${workspaceRoot}`);
      console.log("");
      await runSetup();
    }

    console.log("");
    console.log("Next steps:");
    console.log("  agentifyer mcp      # Start MCP server (optional)");
    console.log("  agentifyer status   # Check workspace");

    return;
  }

  if (command === "spawn") {
    const agentId = parsedArgs.positionals[0];
    const role = (parsedArgs.positionals[1] ?? "custom") as AgentRole;

    if (!agentId) {
      throw new Error("Missing required agent id for spawn.");
    }

    const identity = await spawnAgent(cwd(), agentId, role);
    if (jsonMode) {
      console.log(JSON.stringify(identity));
    } else {
      console.log(`Spawned agent ${identity.id} with role ${identity.role}`);
    }
    return;
  }

  if (command === "send") {
    const from = getOptionalStringOption(parsedArgs.options, "from") ?? "orchestrator";
    const to = getRequiredStringOption(parsedArgs.options, "to");
    const subject = getRequiredStringOption(parsedArgs.options, "subject");
    const body = getRequiredStringOption(parsedArgs.options, "body");
    const type = (getOptionalStringOption(parsedArgs.options, "type") ?? "task_assignment") as MessageType;
    const priority = (getOptionalStringOption(parsedArgs.options, "priority") ?? "normal") as MessagePriority;
    const threadId = getOptionalStringOption(parsedArgs.options, "thread");
    const targetRole = getOptionalStringOption(parsedArgs.options, "role") as AgentRole | undefined;
    const requiresResponse = getBooleanOption(parsedArgs.options, "requires-response");

    const message = await sendMessage(cwd(), {
      from,
      to,
      subject,
      body,
      type,
      priority,
      requiresResponse,
      threadId,
      targetRole
    });

    const output = jsonMode ? message : { id: message.id, to: message.to, threadId: message.threadId };
    if (jsonMode) {
      console.log(JSON.stringify(message));
    } else {
      console.log(`Delivered message ${message.id} to ${message.to} in thread ${message.threadId}`);
    }
    return;
  }

  if (command === "reply") {
    const from = getRequiredStringOption(parsedArgs.options, "from");
    const messageId = getRequiredStringOption(parsedArgs.options, "message");
    const body = getRequiredStringOption(parsedArgs.options, "body");
    const subject = getOptionalStringOption(parsedArgs.options, "subject");
    const type = getOptionalStringOption(parsedArgs.options, "type") as MessageType | undefined;
    const priority = getOptionalStringOption(parsedArgs.options, "priority") as MessagePriority | undefined;
    const requiresResponse = getBooleanOption(parsedArgs.options, "requires-response");

    const message = await replyToMessage(cwd(), {
      from,
      messageId,
      body,
      subject,
      type,
      priority,
      requiresResponse
    });

    if (jsonMode) {
      console.log(JSON.stringify(message));
    } else {
      console.log(`Replied with message ${message.id} to ${message.to} in thread ${message.threadId}`);
    }
    return;
  }

  if (command === "inbox") {
    const agentId = parsedArgs.positionals[0];
    if (!agentId) {
      throw new Error("Missing required agent id for inbox.");
    }

    const messages = await listInboxMessages(cwd(), agentId);
    if (jsonMode) {
      console.log(JSON.stringify(messages));
    } else {
      printInbox(agentId, messages);
    }
    return;
  }

  if (command === "status") {
    const snapshot = await getWorkspaceStatus(cwd());
    if (jsonMode) {
      console.log(JSON.stringify(snapshot));
    } else {
      printStatus(snapshot);
    }
    return;
  }

  if (command === "recover") {
    const summary = await recoverWorkspace(cwd());
    if (jsonMode) {
      console.log(JSON.stringify(summary));
    } else {
      printRecoverSummary(summary);
    }
    return;
  }

  if (command === "task") {
    const subcommand = parsedArgs.positionals[0];

    if (subcommand === "create") {
      const ownerId = getRequiredStringOption(parsedArgs.options, "owner");
      const title = getRequiredStringOption(parsedArgs.options, "title");
      const body = getRequiredStringOption(parsedArgs.options, "body");
      const from = getOptionalStringOption(parsedArgs.options, "from") ?? "orchestrator";
      const priority = (getOptionalStringOption(parsedArgs.options, "priority") ?? "normal") as MessagePriority;
      const threadId = getOptionalStringOption(parsedArgs.options, "thread");
      const acceptanceCriteria = getPipeSeparatedOption(parsedArgs.options, "acceptance");
      const attachments = getTagsOption(parsedArgs.options, "attachments");

      const task = await createTask(cwd(), {
        from,
        ownerId,
        title,
        body,
        priority,
        threadId,
        acceptanceCriteria,
        attachments
      });

      if (jsonMode) {
        console.log(JSON.stringify(task));
      } else {
        console.log(`Created task ${task.id} for ${task.ownerId}`);
      }
      return;
    }

    if (subcommand === "list") {
      const ownerId = getOptionalStringOption(parsedArgs.options, "owner");
      const tasks = await listTasks(cwd());
      const filteredTasks = ownerId ? tasks.filter((task) => task.ownerId === ownerId) : tasks;
      if (jsonMode) {
        console.log(JSON.stringify(filteredTasks));
      } else {
        printTaskList(filteredTasks);
      }
      return;
    }

    if (subcommand === "read") {
      const taskId = getRequiredStringOption(parsedArgs.options, "id");
      const task = await getTask(cwd(), taskId);
      if (jsonMode) {
        console.log(JSON.stringify(task));
      } else {
        printTask(task);
      }
      return;
    }

    if (subcommand === "files") {
      const agentId = getRequiredStringOption(parsedArgs.options, "agent");
      const fileNames = await listTaskMarkdownFiles(cwd(), agentId);
      if (jsonMode) {
        console.log(JSON.stringify(fileNames));
      } else {
        printTaskFiles(agentId, fileNames);
      }
      return;
    }

    if (subcommand === "status") {
      const taskId = getRequiredStringOption(parsedArgs.options, "id");
      const value = getRequiredStringOption(parsedArgs.options, "value") as TaskStatus;
      const task = await updateTaskStatus(cwd(), taskId, value);
      if (jsonMode) {
        console.log(JSON.stringify(task));
      } else {
        console.log(`Updated task ${task.id} to ${task.status}`);
      }
      return;
    }

    throw new Error("Unknown task subcommand.");
  }

  if (command === "todo") {
    const subcommand = parsedArgs.positionals[0];
    const taskId = getRequiredStringOption(parsedArgs.options, "task");

    if (subcommand === "list") {
      const items = await listTodoItems(cwd(), taskId);
      if (jsonMode) {
        console.log(JSON.stringify(items));
      } else {
        printTodoItems(taskId, items);
      }
      return;
    }

    if (subcommand === "add") {
      const item = getRequiredStringOption(parsedArgs.options, "item");
      const items = await addTodoItem(cwd(), taskId, item);
      if (jsonMode) {
        console.log(JSON.stringify(items));
      } else {
        printTodoItems(taskId, items);
      }
      return;
    }

    if (subcommand === "check") {
      const item = getRequiredStringOption(parsedArgs.options, "item");
      const items = await setTodoItemCompletion(cwd(), taskId, item, true);
      if (jsonMode) {
        console.log(JSON.stringify(items));
      } else {
        printTodoItems(taskId, items);
      }
      return;
    }

    if (subcommand === "uncheck") {
      const item = getRequiredStringOption(parsedArgs.options, "item");
      const items = await setTodoItemCompletion(cwd(), taskId, item, false);
      if (jsonMode) {
        console.log(JSON.stringify(items));
      } else {
        printTodoItems(taskId, items);
      }
      return;
    }

    throw new Error("Unknown todo subcommand.");
  }

  if (command === "memory") {
    const subcommand = parsedArgs.positionals[0];

    if (subcommand === "write") {
      const agentId = getRequiredStringOption(parsedArgs.options, "agent");
      const title = getRequiredStringOption(parsedArgs.options, "title");
      const body = getRequiredStringOption(parsedArgs.options, "body");
      const tags = getTagsOption(parsedArgs.options, "tags");

      const note = await writeMemoryNote(cwd(), {
        agentId,
        title,
        body,
        tags
      });

      if (jsonMode) {
        console.log(JSON.stringify(note));
      } else {
        console.log(`Saved memory note ${note.id} for ${note.agentId}`);
      }
      return;
    }

    if (subcommand === "list") {
      const agentId = getRequiredStringOption(parsedArgs.options, "agent");
      const notes = await listMemoryNotes(cwd(), agentId);
      if (jsonMode) {
        console.log(JSON.stringify(notes));
      } else {
        printMemoryList(agentId, notes);
      }
      return;
    }

    if (subcommand === "read") {
      const agentId = getRequiredStringOption(parsedArgs.options, "agent");
      const memoryId = getRequiredStringOption(parsedArgs.options, "id");
      const note = await readMemoryNote(cwd(), agentId, memoryId);
      if (jsonMode) {
        console.log(JSON.stringify(note));
      } else {
        printMemoryNote(note);
      }
      return;
    }

    throw new Error("Unknown memory subcommand. Use write, list, or read.");
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentifyer failed: ${message}`);
  process.exitCode = 1;
});
