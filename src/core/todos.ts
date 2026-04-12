import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getTask, updateTaskStatus } from "./tasks.js";

export interface TodoItem {
  text: string;
  completed: boolean;
}

function getTodoAbsolutePath(projectRoot: string, taskId: string): Promise<string> {
  return getTask(projectRoot, taskId).then((task) => join(projectRoot, task.todoFilePath));
}

function parseTodoItems(markdown: string): TodoItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => /^- \[( |x)\] (.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      completed: match[1] === "x",
      text: match[2]
    }));
}

function updateChecklistLine(markdown: string, item: string, completed: boolean): string {
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^- \\[(?: |x)\\] ${escaped}$`, "m");
  const replacement = `- [${completed ? "x" : " "}] ${item}`;

  if (!pattern.test(markdown)) {
    throw new Error(`Todo item '${item}' not found.`);
  }

  return markdown.replace(pattern, replacement);
}

function insertTodoItem(markdown: string, item: string): string {
  const todoLine = `- [ ] ${item}`;

  if (markdown.includes(todoLine)) {
    throw new Error(`Todo item '${item}' already exists.`);
  }

  const marker = "## Todos\n";
  if (markdown.includes(marker)) {
    return markdown.replace(marker, `${marker}${todoLine}\n`);
  }

  return `${markdown.trimEnd()}\n\n## Todos\n${todoLine}\n`;
}

export async function listTodoItems(projectRoot: string, taskId: string): Promise<TodoItem[]> {
  const todoPath = await getTodoAbsolutePath(projectRoot, taskId);
  const markdown = await readFile(todoPath, "utf8");
  return parseTodoItems(markdown);
}

export async function addTodoItem(projectRoot: string, taskId: string, item: string): Promise<TodoItem[]> {
  const todoPath = await getTodoAbsolutePath(projectRoot, taskId);
  const markdown = await readFile(todoPath, "utf8");
  const updated = insertTodoItem(markdown, item);
  await writeFile(todoPath, updated, "utf8");
  await updateTaskStatus(projectRoot, taskId, "todo_ready");
  return listTodoItems(projectRoot, taskId);
}

export async function setTodoItemCompletion(projectRoot: string, taskId: string, item: string, completed: boolean): Promise<TodoItem[]> {
  const todoPath = await getTodoAbsolutePath(projectRoot, taskId);
  const markdown = await readFile(todoPath, "utf8");
  const updated = updateChecklistLine(markdown, item, completed);
  await writeFile(todoPath, updated, "utf8");
  return listTodoItems(projectRoot, taskId);
}
