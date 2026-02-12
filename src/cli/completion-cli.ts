import { Command, Option } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildProgram } from "./program/build-program.js";
import { getSubCliEntries, registerSubCliByName } from "./program/register.subclis.js";

export function registerCompletionCli(program: Command) {
  program
    .command("completion")
    .description("Generate shell completion script")
    .addOption(
      new Option("-s, --shell <shell>", "Shell to generate completion for")
        .choices(["zsh", "bash", "powershell", "fish"])
        .default("zsh"),
    )
    .option("-i, --install", "Install completion script to shell profile")
    .option("-y, --yes", "Skip confirmation (non-interactive)", false)
    .action(async (options) => {
      const shell = options.shell;
      // Eagerly register all subcommands to build the full tree
      const entries = getSubCliEntries();
      for (const entry of entries) {
        // Skip completion command itself to avoid cycle if we were to add it to the list
        if (entry.name === "completion") {
          continue;
        }
        await registerSubCliByName(program, entry.name);
      }

      if (options.install) {
        await installCompletion(shell, Boolean(options.yes), program.name(), program);
        return;
      }

      let script = "";
      if (shell === "zsh") {
        script = generateZshCompletion(program);
      } else if (shell === "bash") {
        script = generateBashCompletion(program);
      } else if (shell === "powershell") {
        script = generatePowerShellCompletion(program);
      } else if (shell === "fish") {
        script = generateFishCompletion(program);
      }

      console.log(script);
    });
}

async function buildCompletionProgram(binName: string): Promise<Command> {
  const program = buildProgram();
  program.name(binName);
  // Eagerly register all subcommands to build the full tree.
  // This can be slow, but it runs only at install-time (not on every shell startup).
  const entries = getSubCliEntries();
  for (const entry of entries) {
    await registerSubCliByName(program, entry.name);
  }
  return program;
}

function getCompletionCachePaths(home: string, binName: string, shell: string) {
  const ext =
    shell === "bash" ? "bash" : shell === "zsh" ? "zsh" : shell === "fish" ? "fish" : shell;
  const dir = path.join(home, ".omniclaw", "completions");
  const filePath = path.join(dir, `${binName}.${ext}`);
  const shellPath = `$HOME/.omniclaw/completions/${binName}.${ext}`;
  return { dir, filePath, shellPath };
}

export async function installCompletion(
  shell: string,
  yes: boolean,
  binName = "omniclaw",
  program?: Command,
) {
  const home = process.env.HOME || os.homedir();
  let profilePath = "";
  let generateScript: ((program: Command) => string) | undefined;

  const blockStart = "# OmniClaw Completion (BEGIN)";
  const blockEnd = "# OmniClaw Completion (END)";
  const legacyMarker = "# OmniClaw Completion";
  const legacyLines: string[] = [
    // Older installs that re-generated completion on every shell startup.
    `source <(${binName} completion --shell bash)`,
    `source <(${binName} completion --shell zsh)`,
    `${binName} completion --shell fish | source`,
  ];

  const {
    dir: completionDir,
    filePath: completionFilePath,
    shellPath: completionShellPath,
  } = getCompletionCachePaths(home, binName, shell);

  let completionBlock = "";

  if (shell === "zsh") {
    profilePath = path.join(home, ".zshrc");
    generateScript = generateZshCompletion;
    completionBlock = [
      blockStart,
      `if [[ -f "${completionShellPath}" ]]; then`,
      `  source "${completionShellPath}"`,
      "fi",
      blockEnd,
    ].join("\n");
  } else if (shell === "bash") {
    // Try .bashrc first, then .bash_profile
    profilePath = path.join(home, ".bashrc");
    try {
      await fs.access(profilePath);
    } catch {
      profilePath = path.join(home, ".bash_profile");
    }
    generateScript = generateBashCompletion;
    completionBlock = [
      blockStart,
      `if [ -f "${completionShellPath}" ]; then`,
      `  source "${completionShellPath}"`,
      "fi",
      blockEnd,
    ].join("\n");
  } else if (shell === "fish") {
    profilePath = path.join(home, ".config", "fish", "config.fish");
    generateScript = generateFishCompletion;
    completionBlock = [
      blockStart,
      `if test -f "${completionShellPath}"`,
      `  source "${completionShellPath}"`,
      "end",
      blockEnd,
    ].join("\n");
  } else {
    console.error(`Automated installation not supported for ${shell} yet.`);
    return;
  }

  try {
    // Generate & cache completion script once (avoid running OmniClaw on every shell startup).
    const completionProgram = program ?? (await buildCompletionProgram(binName));
    completionProgram.name(binName);

    if (!generateScript) {
      console.error("Completion generator missing for this shell.");
      return;
    }
    const script = generateScript(completionProgram);

    await fs.mkdir(completionDir, { recursive: true });
    await fs.writeFile(completionFilePath, script, "utf-8");

    // Check if profile exists
    try {
      await fs.access(profilePath);
    } catch {
      if (!yes) {
        console.warn(`Profile not found at ${profilePath}. Created a new one.`);
      }
      await fs.mkdir(path.dirname(profilePath), { recursive: true });
      await fs.writeFile(profilePath, "", "utf-8");
    }

    const content = await fs.readFile(profilePath, "utf-8");
    const lines = content.split("\n");
    const blockLines = completionBlock.split("\n");

    // Replace existing managed block.
    const startIdx = lines.findIndex((line) => line.trim() === blockStart);
    if (startIdx !== -1) {
      const endIdx = lines.findIndex((line, idx) => idx > startIdx && line.trim() === blockEnd);
      if (endIdx !== -1) {
        const next = [...lines.slice(0, startIdx), ...blockLines, ...lines.slice(endIdx + 1)].join(
          "\n",
        );
        if (next !== content) {
          await fs.writeFile(profilePath, next, "utf-8");
          console.log(`Completion updated. Restart your shell or run: source ${profilePath}`);
        } else if (!yes) {
          console.log(`Completion already installed in ${profilePath}`);
        }
        return;
      }
    }

    // Upgrade the old 2-line format:
    //   # OmniClaw Completion
    //   <one-liner>
    const legacyMarkerIdx = lines.findIndex((line) => line.trim() === legacyMarker);
    if (legacyMarkerIdx !== -1) {
      const nextLine = lines[legacyMarkerIdx + 1] ?? "";
      if (nextLine.includes(`${binName} completion`) || nextLine.includes("pnpm -C")) {
        const next = [
          ...lines.slice(0, legacyMarkerIdx),
          ...blockLines,
          ...lines.slice(Math.min(lines.length, legacyMarkerIdx + 2)),
        ].join("\n");
        await fs.writeFile(profilePath, next, "utf-8");
        console.log(`Completion updated. Restart your shell or run: source ${profilePath}`);
        return;
      }
    }

    // Upgrade known legacy one-liners even if the marker isn't present.
    for (const legacyLine of legacyLines) {
      const idx = lines.findIndex((line) => line.trim() === legacyLine.trim());
      if (idx !== -1) {
        const next = [...lines.slice(0, idx), ...blockLines, ...lines.slice(idx + 1)].join("\n");
        await fs.writeFile(profilePath, next, "utf-8");
        console.log(`Completion updated. Restart your shell or run: source ${profilePath}`);
        return;
      }
    }

    // If completion is already present (manual or previous install), don't duplicate.
    if (content.includes(completionShellPath) || content.includes(legacyMarker)) {
      if (!yes) {
        console.log(`Completion already installed in ${profilePath}`);
      }
      return;
    }

    if (!yes) {
      console.log(`Installing completion to ${profilePath}...`);
    }

    const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    await fs.appendFile(profilePath, `${prefix}\n${completionBlock}\n`);
    console.log(`Completion installed. Restart your shell or run: source ${profilePath}`);
  } catch (err) {
    console.error(`Failed to install completion: ${err as string}`);
  }
}

function generateZshCompletion(program: Command): string {
  const rootCmd = program.name();
  const script = `
#compdef ${rootCmd}

_${rootCmd}_root_completion() {
  local -a commands
  local -a options
  
  _arguments -C \\
    ${generateZshArgs(program)} \\
    ${generateZshSubcmdList(program)} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${program.commands.map((cmd) => `(${cmd.name()}) _${rootCmd}_${cmd.name().replace(/-/g, "_")} ;;`).join("\n        ")}
      esac
      ;;
  esac
}

${generateZshSubcommands(program, rootCmd)}

compdef _${rootCmd}_root_completion ${rootCmd}
`;
  return script;
}

function generateZshArgs(cmd: Command): string {
  return (cmd.options || [])
    .map((opt) => {
      const flags = opt.flags.split(/[ ,|]+/);
      const name = flags.find((f) => f.startsWith("--")) || flags[0];
      const short = flags.find((f) => f.startsWith("-") && !f.startsWith("--"));
      const desc = opt.description.replace(/'/g, "'\\''");
      if (short) {
        return `"(${name} ${short})"{${name},${short}}"[${desc}]"`;
      }
      return `"${name}[${desc}]"`;
    })
    .join(" \\\n    ");
}

function generateZshSubcmdList(cmd: Command): string {
  const list = cmd.commands
    .map((c) => {
      const desc = c
        .description()
        .replace(/'/g, "'\\''")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]");
      return `'${c.name()}[${desc}]'`;
    })
    .join(" ");
  return `"1: :_values 'command' ${list}"`;
}

function generateZshSubcommands(program: Command, prefix: string): string {
  let script = "";
  for (const cmd of program.commands) {
    const cmdName = cmd.name();
    const funcName = `_${prefix}_${cmdName.replace(/-/g, "_")}`;

    // Recurse first
    script += generateZshSubcommands(cmd, `${prefix}_${cmdName.replace(/-/g, "_")}`);

    const subCommands = cmd.commands;
    if (subCommands.length > 0) {
      script += `
${funcName}() {
  local -a commands
  local -a options
  
  _arguments -C \\
    ${generateZshArgs(cmd)} \\
    ${generateZshSubcmdList(cmd)} \\
    "*::arg:->args"

  case $state in
    (args)
      case $line[1] in
        ${subCommands.map((sub) => `(${sub.name()}) ${funcName}_${sub.name().replace(/-/g, "_")} ;;`).join("\n        ")}
      esac
      ;;
  esac
}
`;
    } else {
      script += `
${funcName}() {
  _arguments -C \\
    ${generateZshArgs(cmd)}
}
`;
    }
  }
  return script;
}

function generateBashCompletion(program: Command): string {
  // Simplified Bash completion using dynamic iteration logic (often hardcoded in static scripts)
  // For a robust implementation, usually one maps out the tree.
  // This assumes a simple structure.
  const rootCmd = program.name();

  // We can use a recursive function to build the case statements
  return `
_${rootCmd}_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    # Simple top-level completion for now
    opts="${program.commands.map((c) => c.name()).join(" ")} ${program.options.map((o) => o.flags.split(" ")[0]).join(" ")}"
    
    case "\${prev}" in
      ${program.commands.map((cmd) => generateBashSubcommand(cmd)).join("\n      ")}
    esac

    if [[ \${cur} == -* ]] ; then
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi
    
    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
}

complete -F _${rootCmd}_completion ${rootCmd}
`;
}

function generateBashSubcommand(cmd: Command): string {
  // This is a naive implementation; fully recursive bash completion is complex to generate as a single string without improved state tracking.
  // For now, let's provide top-level command recognition.
  return `${cmd.name()})
        opts="${cmd.commands.map((c) => c.name()).join(" ")} ${cmd.options.map((o) => o.flags.split(" ")[0]).join(" ")}"
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
        ;;`;
}

function generatePowerShellCompletion(program: Command): string {
  const rootCmd = program.name();

  const visit = (cmd: Command, parents: string[]): string => {
    const cmdName = cmd.name();
    const fullPath = [...parents, cmdName].join(" ");

    let script = "";

    // Command completion for this level
    const subCommands = cmd.commands.map((c) => c.name());
    const options = cmd.options.map((o) => o.flags.split(/[ ,|]+/)[0]); // Take first flag
    const allCompletions = [...subCommands, ...options].map((s) => `'${s}'`).join(",");

    if (allCompletions.length > 0) {
      script += `
            if ($commandPath -eq '${fullPath}') {
                $completions = @(${allCompletions})
                $completions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
                }
            }
`;
    }

    // Recurse
    for (const sub of cmd.commands) {
      script += visit(sub, [...parents, cmdName]);
    }

    return script;
  };

  const rootBody = visit(program, []);

  return `
Register-ArgumentCompleter -Native -CommandName ${rootCmd} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    
    $commandElements = $commandAst.CommandElements
    $commandPath = ""
    
    # Reconstruct command path (simple approximation)
    # Skip the executable name
    for ($i = 1; $i -lt $commandElements.Count; $i++) {
        $element = $commandElements[$i].Extent.Text
        if ($element -like "-*") { break }
        if ($i -eq $commandElements.Count - 1 -and $wordToComplete -ne "") { break } # Don't include current word being typed
        $commandPath += "$element "
    }
    $commandPath = $commandPath.Trim()
    
    # Root command
    if ($commandPath -eq "") {
         $completions = @(${program.commands.map((c) => `'${c.name()}'`).join(",")}, ${program.options.map((o) => `'${o.flags.split(" ")[0]}'`).join(",")}) 
         $completions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)
         }
    }
    
    ${rootBody}
}
`;
}

function generateFishCompletion(program: Command): string {
  const rootCmd = program.name();
  let script = "";

  const visit = (cmd: Command, parents: string[]) => {
    const cmdName = cmd.name();
    const fullPath = [...parents];
    if (parents.length > 0) {
      fullPath.push(cmdName);
    } // Only push if not root, or consistent root handling

    // Fish uses 'seen_subcommand_from' to determine context.
    // For root: complete -c omniclaw -n "__fish_use_subcommand" -a "subcmd" -d "desc"

    // Root logic
    if (parents.length === 0) {
      // Subcommands of root
      for (const sub of cmd.commands) {
        const desc = sub.description().replace(/'/g, "'\\''");
        script += `complete -c ${rootCmd} -n "__fish_use_subcommand" -a "${sub.name()}" -d '${desc}'\n`;
      }
      // Options of root
      for (const opt of cmd.options) {
        const flags = opt.flags.split(/[ ,|]+/);
        const long = flags.find((f) => f.startsWith("--"))?.replace(/^--/, "");
        const short = flags
          .find((f) => f.startsWith("-") && !f.startsWith("--"))
          ?.replace(/^-/, "");
        const desc = opt.description.replace(/'/g, "'\\''");
        let line = `complete -c ${rootCmd} -n "__fish_use_subcommand"`;
        if (short) {
          line += ` -s ${short}`;
        }
        if (long) {
          line += ` -l ${long}`;
        }
        line += ` -d '${desc}'\n`;
        script += line;
      }
    } else {
      // Nested commands
      // Logic: if seen subcommand matches parents...
      // But fish completion logic is simpler if we just say "if we haven't seen THIS command yet but seen parent"
      // Actually, a robust fish completion often requires defining a function to check current line.
      // For simplicity, we'll assume standard fish helper __fish_seen_subcommand_from.

      // To properly scope to 'omniclaw gateway' and not 'omniclaw other gateway', we need to check the sequence.
      // A simplified approach:

      // Subcommands
      for (const sub of cmd.commands) {
        const desc = sub.description().replace(/'/g, "'\\''");
        script += `complete -c ${rootCmd} -n "__fish_seen_subcommand_from ${cmdName}" -a "${sub.name()}" -d '${desc}'\n`;
      }
      // Options
      for (const opt of cmd.options) {
        const flags = opt.flags.split(/[ ,|]+/);
        const long = flags.find((f) => f.startsWith("--"))?.replace(/^--/, "");
        const short = flags
          .find((f) => f.startsWith("-") && !f.startsWith("--"))
          ?.replace(/^-/, "");
        const desc = opt.description.replace(/'/g, "'\\''");
        let line = `complete -c ${rootCmd} -n "__fish_seen_subcommand_from ${cmdName}"`;
        if (short) {
          line += ` -s ${short}`;
        }
        if (long) {
          line += ` -l ${long}`;
        }
        line += ` -d '${desc}'\n`;
        script += line;
      }
    }

    for (const sub of cmd.commands) {
      visit(sub, [...parents, cmdName]);
    }
  };

  visit(program, []);
  return script;
}
