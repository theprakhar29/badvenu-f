// Run Next build without allowing Next's automatic .env loading to touch the workspace.
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function main() {
  const root = path.resolve(__dirname, ".."), tempRoot = root;
  // Stay on the dependency drive: Windows Webpack cannot relativize C: -> D: entries.
  const stage = await fs.mkdtemp(path.join(tempRoot, ".phase3a-build-"));
  const dependencies = path.join(stage, "node_modules");
  let exitCode = 1;
  try {
    const allowed = (source) => !/^(?:\.env.*|\.npmrc|\.yarnrc.*)$/i.test(path.basename(source)) && !/\.(?:pem|key)$/i.test(source);
    for (const name of ["package.json", "next.config.js"]) await fs.copyFile(path.join(root, name), path.join(stage, name));
    for (const name of ["src", "public"]) {
      try { await fs.access(path.join(root, name)); } catch { continue; }
      await fs.cp(path.join(root, name), path.join(stage, name), { recursive: true, filter: allowed });
    }
    await fs.symlink(path.join(root, "node_modules"), dependencies, process.platform === "win32" ? "junction" : "dir");
    const env = { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", CI: "1", NEXT_PUBLIC_API_URL: "http://127.0.0.1:1" };
    for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "ComSpec", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TMP", "TEMP", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    const args = [path.join(root, "node_modules/next/dist/bin/next"), "build", stage, "--webpack"];
    if (process.argv.includes("--focused")) args.push("--debug-build-paths=src/app/events/[slug]/book/page.jsx,src/app/booking/[id]/payment/page.jsx,src/app/booking-confirmation/[id]/page.jsx");
    console.log("Building an isolated .env-free copy; no application backend is contacted.");
    exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: stage, env, stdio: "inherit", windowsHide: true });
      child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    // Verify this exact generated target before recursive cleanup on Windows.
    const resolved = path.resolve(stage);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith(".phase3a-build-")) throw new Error("Unsafe build cleanup target.");
    try {
      const stat = await fs.lstat(dependencies);
      if (!stat.isSymbolicLink()) throw new Error("Unexpected dependency copy; refusing recursive cleanup.");
      const real = await fs.realpath(dependencies), original = await fs.realpath(path.join(root, "node_modules"));
      if (real.toLowerCase() !== original.toLowerCase()) throw new Error("Unexpected dependency link target.");
      await fs.unlink(dependencies); // remove link only; never traverse original node_modules
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  process.exitCode = exitCode;
}
main().catch(() => { console.error("Isolated build could not complete; no credential files were loaded."); process.exitCode = 1; });
