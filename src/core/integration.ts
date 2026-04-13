import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, writeFile, chmod, readFile, cp, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { detectAvailableAgents } from "./io.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTIFYER_CONFIG_DIR = join(homedir(), ".agentifyer");
const AGENTIFYER_BIN_DIR = join(AGENTIFYER_CONFIG_DIR, "bin");

const c = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const styles = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  text: c(240, 237, 232),
  muted: c(150, 148, 145),
  accent: c(201, 122, 122),
  success: c(107, 196, 122),
  dim: c(100, 98, 95),
};

export async function installIntegration(): Promise<void> {
  const sourceDir = join(__dirname, "..", "..", "dist");

  await mkdir(AGENTIFYER_BIN_DIR, { recursive: true });

  for (const file of await readdir(sourceDir)) {
    await cp(join(sourceDir, file), join(AGENTIFYER_BIN_DIR, file), { recursive: true });
  }

  const configDirEscaped = AGENTIFYER_CONFIG_DIR.replace(/\\/g, "\\\\");

  const scriptContents = `#!/bin/bash
# Agentifyer wrapper - source this file to load agentifyer commands

AGENTIFYER_DIR="${AGENTIFYER_CONFIG_DIR}"
export PATH="\${AGENTIFYER_DIR}/bin:\${PATH}"

agentifyer() {
  node "\${AGENTIFYER_DIR}/bin/cli.js" "$@"
}

af-init() { agentifyer init "$@"; }
af-spawn() { agentifyer spawn "$@"; }
af-send() { agentifyer send "$@"; }
af-reply() { agentifyer reply "$@"; }
af-inbox() { agentifyer inbox "$@"; }
af-status() { agentifyer status "$@"; }
af-task() { agentifyer task "$@"; }
af-todo() { agentifyer todo "$@"; }
af-memory() { agentifyer memory "$@"; }
af-recover() { agentifyer recover "$@"; }

# Completion
export -f agentifyer
export -f af-init
export -f af-spawn
export -f af-send
export -f af-reply
export -f af-inbox
export -f af-status
export -f af-task
export -f af-todo
export -f af-memory
export -f af-recover

echo "Loaded agentifyer commands: af-init, af-spawn, af-send, af-reply, af-inbox, af-status, af-task, af-todo, af-memory"
`;

  const shellFile = join(AGENTIFYER_CONFIG_DIR, "agentifyer.sh");
  await writeFile(shellFile, scriptContents, "utf8");
  await chmod(shellFile, 0o755);

  const fishFile = join(AGENTIFYER_CONFIG_DIR, "agentifyer.fish");
  const fishContents = `# Agentifyer commands for fish shell

function agentifyer
  node "$HOME/.agentifyer/bin/cli.js" $argv
end

function af-init; agentifyer init $argv; end
function af-spawn; agentifyer spawn $argv; end
function af-send; agentifyer send $argv; end
function af-reply; agentifyer reply $argv; end
function af-inbox; agentifyer inbox $argv; end
function af-status; agentifyer status $argv; end
function af-task; agentifyer task $argv; end
function af-todo; agentifyer todo $argv; end
function af-memory; agentifyer memory $argv; end
function af-recover; agentifyer recover $argv; end
`;
  await writeFile(fishFile, fishContents, "utf8");

  console.log(`${styles.success}✓${styles.reset} Copied CLI to ~/.agentifyer/bin/`);
  console.log("");
  console.log(`${styles.bold}Next steps:${styles.reset}`);
  console.log(`  ${styles.dim}1.${styles.reset} ${styles.text}Add to PATH:${styles.reset} ${styles.dim}set PATH=%USERPROFILE%\\.agentifyer\\bin;%PATH%${styles.reset}`);
  console.log(`  ${styles.dim}2.${styles.reset} ${styles.text}Run:${styles.reset} ${styles.accent}agentifyer init${styles.reset}`);
  console.log("");
}