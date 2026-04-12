import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { writeJson } from "./io.js";
import { detectAvailableAgents } from "./io.js";
import { installIntegration } from "./integration.js";
import type { AgentConfig, SupportedAgent } from "../schema/types.js";

const AGENTIFYER_CONFIG_DIR = join(homedir(), ".agentifyer");
const AGENTIFYER_CONFIG_FILE = join(AGENTIFYER_CONFIG_DIR, "config.json");

const styles = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m"
};

function log(text: string): void {
  console.log(text);
}

function header(text: string): void {
  console.log(`${styles.bold}${styles.cyan}${text}${styles.reset}`);
}

function item(num: string, text: string, selected = false): void {
  const marker = selected ? `${styles.green}>` : " ";
  const style = selected ? styles.bold : styles.dim;
  console.log(`${marker} ${style}${text}${styles.reset}`);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${styles.yellow}?${styles.reset} ${question}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runSetup(): Promise<AgentConfig> {
  const availableAgents = detectAvailableAgents();

  console.log("");
  header("◇ agentifyer setup");
  console.log("");

  if (availableAgents.length === 0) {
    log(`${styles.red}No agent CLIs found in your PATH.${styles.reset}`);
    log(`${styles.dim}Supported: claude, aider, cursor, windsurf, roocode, opencode, cline${styles.reset}`);
    console.log("");
    log("Install one and run setup again.");
    return {
      cli: "custom" as SupportedAgent,
      workspacePath: process.cwd(),
      installedAt: new Date().toISOString()
    };
  }

  log(`${styles.bold}Detected agent CLIs:${styles.reset}`);
  for (let i = 0; i < availableAgents.length; i++) {
    log(`  ${styles.cyan}${i + 1}.${styles.reset} ${availableAgents[i]}`);
  }
  log(`  ${styles.yellow}a.${styles.reset} all of them`);
  log(`  ${styles.gray}c.${styles.reset} custom (manual config)`);
  console.log("");

  const answer = await prompt("Select (number, a, or c)");

  let selection: SupportedAgent | SupportedAgent[];
  if (answer.toLowerCase() === "a") {
    selection = availableAgents as SupportedAgent[];
  } else if (answer.toLowerCase() === "c") {
    selection = "custom";
  } else {
    const index = parseInt(answer, 10) - 1;
    if (index >= 0 && index < availableAgents.length) {
      selection = availableAgents[index] as SupportedAgent;
    } else {
      selection = availableAgents[0] as SupportedAgent;
    }
  }

  console.log("");
  log(`${styles.green}Selected:${styles.reset} ${Array.isArray(selection) ? selection.join(", ") : selection}`);
  console.log("");

  const config: AgentConfig = {
    cli: selection,
    workspacePath: process.cwd(),
    installedAt: new Date().toISOString()
  };

  await mkdir(AGENTIFYER_CONFIG_DIR, { recursive: true });
  await writeJson(AGENTIFYER_CONFIG_FILE, config);

  console.log("");
  await installIntegration();

  return config;
}