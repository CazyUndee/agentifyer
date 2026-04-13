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

const c = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;

const styles = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  text: c(240, 237, 232),
  muted: c(150, 148, 145),
  accent: c(201, 122, 122),
  accentDark: c(107, 35, 35),
  accentHover: c(125, 42, 42),
  success: c(107, 196, 122),
  successDark: c(30, 80, 40),
  warning: c(196, 164, 58),
  warningDark: c(80, 60, 20),
  error: c(196, 107, 107),
  errorDark: c(80, 20, 20),
  info: c(107, 168, 196),
  infoDark: c(20, 53, 80),
  surface: c(17, 17, 17),
  surface2: c(26, 26, 26),
  surface3: c(34, 34, 34),
};

function log(text: string): void {
  console.log(text);
}

function header(text: string): void {
  console.log(`${styles.bold}${styles.accent}${text}${styles.reset}`);
}

function item(num: string, text: string, selected = false): void {
  const marker = selected ? `${styles.accent}>` : " ";
  const style = selected ? styles.bold : styles.muted;
  console.log(`${marker} ${style}${text}${styles.reset}`);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${styles.warning}?${styles.reset} ${question}`, (answer) => {
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
    log(`${styles.error}No agent CLIs found in your PATH.${styles.reset}`);
    log(`${styles.muted}Supported: claude, aider, cursor, windsurf, roocode, opencode, cline${styles.reset}`);
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
    log(`  ${styles.accent}${i + 1}.${styles.reset} ${availableAgents[i]}`);
  }
  log(`  ${styles.warning}a.${styles.reset} all of them`);
  log(`  ${styles.muted}c.${styles.reset} custom (manual config)`);
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
  log(`${styles.success}Selected:${styles.reset} ${Array.isArray(selection) ? selection.join(", ") : selection}`);
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