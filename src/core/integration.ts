import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, writeFile, chmod, readFile, cp, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { detectAvailableAgents } from "./io.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTIFYER_CONFIG_DIR = join(homedir(), ".agentifyer");
const AGENTIFYER_BIN_DIR = join(AGENTIFYER_CONFIG_DIR, "bin");

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

  console.log(`Installed to ~/.agentifyer/bin/`);
  console.log("");
  console.log("Add to PATH:");
  console.log("  Windows: set PATH=%USERPROFILE%\\.agentifyer\\bin;%PATH%");
  console.log("  Unix: export PATH=~/.agentifyer/bin:$PATH");
  console.log("");
  console.log("Then use:");
  console.log("  agentifyer init");
  console.log("  agentifyer spawn <id> [role]");
}
  console.log("  agentifyer send ...");