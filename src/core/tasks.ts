import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureAgentExists, getAgentRegistryEntry } from "./agents.js";
import { sendMessage } from "./mail.js";
import {
  appendEvent,
  ensureTextFile,
  ensureWorkspaceInitialized,
  getRegistryPath,
  getSubagentPromptPath,
  getTasksPath,
  listMarkdownFileNames,
  readJson,
  toWorkspaceRelativePath,
  writeJson,
  writeTextFile
} from "./io.js";
import type { MessagePriority, TaskRecord, TaskStatus } from "../schema/types.js";

export interface CreateTaskInput {
  from: string;
  ownerId: string;
  title: string;
  body: string;
  priority: MessagePriority;
  acceptanceCriteria: string[];
  attachments: string[];
  threadId?: string;
}

function createTaskId(): string {
  return `task_${randomUUID()}`;
}

function sanitizeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "task";
}

function createTaskPromptMarkdown(task: TaskRecord): string {
  const criteria = task.acceptanceCriteria.length > 0
    ? task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")
    : "- No explicit acceptance criteria were provided.";
  const attachments = task.attachments.length > 0
    ? task.attachments.map((item) => `- ${item}`).join("\n")
    : "- No attachments provided.";

  return `# Task: ${task.title}\n\n## Task metadata\n- Task ID: ${task.id}\n- From: ${task.from}\n- Owner: ${task.ownerId}\n- Priority: ${task.priority}\n- Status: ${task.status}\n- Thread ID: ${task.threadId ?? "none"}\n\n## Assignment\n${task.body}\n\n## Acceptance criteria\n${criteria}\n\n## Attachments\n${attachments}\n\n## Required working method\n1. Do not work directly from this task file.\n2. First create or update a Markdown todo file for this task.\n3. Break this task into concrete todos in that todo file.\n4. Work the todos one by one.\n5. Keep the todo file current as work progresses.\n6. Only treat the task as complete when the todo file shows the work is actually done.\n\n## Todo file\n- Expected path: ${task.todoFilePath}\n`;
}

function createTodoTemplateMarkdown(task: TaskRecord): string {
  return `# Todo plan for ${task.id}\n\nTask title: ${task.title}\nOwner: ${task.ownerId}\n\n## Instructions\n- Break the assigned task into concrete actionable todos.\n- Update statuses as work changes.\n- Work from the todos, not directly from the task description.\n\n## Todos\n- [ ] Review task details\n- [ ] Expand this list into real implementation steps\n`;
}

function createSubagentPrompt(task: TaskRecord): string {
  return `You are operating as subagent ${task.ownerId}.\n\nYou have been assigned task ${task.id}.\n\nImportant rule: do not work directly from the task file alone. Before doing the task, you must create and maintain a Markdown todo file and work from those todos.\n\nRequired files:\n- Task file: ${task.taskFilePath}\n- Todo file: ${task.todoFilePath}\n\nRequired behavior:\n1. Read the task file.\n2. Create or update the todo file.\n3. Break the assignment into concrete todos.\n4. Execute the todos in order.\n5. Keep the todo file updated while you work.\n6. When reporting progress, refer to the todo progress, not just the high-level task.\n`;
}

function createTaskAssignmentMailBody(task: TaskRecord): string {
  const acceptance = task.acceptanceCriteria.length > 0
    ? task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")
    : "- No explicit acceptance criteria were provided.";
  const attachments = task.attachments.length > 0
    ? task.attachments.map((item) => `- ${item}`).join("\n")
    : "- No additional attachments were provided.";

  return `You have been assigned task ${task.id}: ${task.title}\n\nTask file: ${task.taskFilePath}\nTodo file: ${task.todoFilePath}\n\nAssignment:\n${task.body}\n\nAcceptance criteria:\n${acceptance}\n\nAdditional attachments:\n${attachments}\n\nRequired working method:\n1. Read the task file.\n2. Create or update the Markdown todo file.\n3. Break the task into concrete todos.\n4. Work from the todos, not directly from the task description.\n5. Keep the todo file current while you work.\n`;
}

export async function listTasks(projectRoot: string): Promise<TaskRecord[]> {
  await ensureWorkspaceInitialized(projectRoot);
  return readJson<TaskRecord[]>(getRegistryPath(projectRoot, "tasks"));
}

export async function getTask(projectRoot: string, taskId: string): Promise<TaskRecord> {
  const tasks = await listTasks(projectRoot);
  const task = tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    throw new Error(`Task '${taskId}' not found.`);
  }

  return task;
}

export async function createTask(projectRoot: string, input: CreateTaskInput): Promise<TaskRecord> {
  await ensureWorkspaceInitialized(projectRoot);

  if (input.from !== "orchestrator") {
    const sender = await getAgentRegistryEntry(projectRoot, input.from);
    if (!sender) {
      throw new Error(`Unknown task creator '${input.from}'.`);
    }
  }

  await ensureAgentExists(projectRoot, input.ownerId);

  const now = new Date().toISOString();
  const id = createTaskId();
  const filePrefix = `${now.replace(/[:.]/g, "-")}_${sanitizeFileSegment(input.title)}`;
  const tasksPath = getTasksPath(projectRoot, input.ownerId);
  const taskFileAbsolutePath = join(tasksPath, `${filePrefix}_${id}.md`);
  const todoFileAbsolutePath = join(tasksPath, `${filePrefix}_${id}.todo.md`);

  const draftTaskRecord: TaskRecord = {
    id,
    title: input.title,
    body: input.body,
    status: "pending",
    from: input.from,
    ownerId: input.ownerId,
    priority: input.priority,
    threadId: input.threadId ?? null,
    assignmentMessageId: null,
    acceptanceCriteria: input.acceptanceCriteria,
    attachments: input.attachments,
    taskFilePath: toWorkspaceRelativePath(projectRoot, taskFileAbsolutePath),
    todoFilePath: toWorkspaceRelativePath(projectRoot, todoFileAbsolutePath),
    createdAt: now,
    updatedAt: now
  };

  await ensureTextFile(taskFileAbsolutePath, createTaskPromptMarkdown(draftTaskRecord));
  await ensureTextFile(todoFileAbsolutePath, createTodoTemplateMarkdown(draftTaskRecord));

  const assignmentMessage = await sendMessage(projectRoot, {
    from: input.from,
    to: input.ownerId,
    subject: `Task assigned: ${input.title}`,
    body: createTaskAssignmentMailBody(draftTaskRecord),
    type: "task_assignment",
    priority: input.priority,
    requiresResponse: true,
    threadId: input.threadId,
    attachments: [draftTaskRecord.taskFilePath, draftTaskRecord.todoFilePath, ...draftTaskRecord.attachments]
  });

  const taskRecord: TaskRecord = {
    ...draftTaskRecord,
    threadId: assignmentMessage.threadId,
    assignmentMessageId: assignmentMessage.id,
    updatedAt: assignmentMessage.createdAt
  };

  await writeTextFile(taskFileAbsolutePath, createTaskPromptMarkdown(taskRecord));

  if (input.ownerId !== "orchestrator") {
    await writeTextFile(getSubagentPromptPath(projectRoot, input.ownerId), createSubagentPrompt(taskRecord));
  }

  const registryPath = getRegistryPath(projectRoot, "tasks");
  const tasks = await readJson<TaskRecord[]>(registryPath);
  tasks.push(taskRecord);
  await writeJson(registryPath, tasks);

  await appendEvent(projectRoot, {
    type: "task_created",
    taskId: taskRecord.id,
    ownerId: taskRecord.ownerId,
    from: taskRecord.from,
    threadId: taskRecord.threadId,
    assignmentMessageId: taskRecord.assignmentMessageId,
    createdAt: now
  });

  return taskRecord;
}

export async function updateTaskStatus(projectRoot: string, taskId: string, status: TaskStatus): Promise<TaskRecord> {
  const registryPath = getRegistryPath(projectRoot, "tasks");
  const tasks = await readJson<TaskRecord[]>(registryPath);
  const taskIndex = tasks.findIndex((candidate) => candidate.id === taskId);

  if (taskIndex === -1) {
    throw new Error(`Task '${taskId}' not found.`);
  }

  const now = new Date().toISOString();
  const updatedTask: TaskRecord = {
    ...tasks[taskIndex],
    status,
    updatedAt: now
  };

  tasks[taskIndex] = updatedTask;
  await writeJson(registryPath, tasks);
  await appendEvent(projectRoot, {
    type: "task_status_updated",
    taskId: updatedTask.id,
    status,
    updatedAt: now
  });

  return updatedTask;
}

export async function listTaskMarkdownFiles(projectRoot: string, agentId: string): Promise<string[]> {
  await ensureAgentExists(projectRoot, agentId);
  const taskDirectory = getTasksPath(projectRoot, agentId);
  return listMarkdownFileNames(taskDirectory);
}
