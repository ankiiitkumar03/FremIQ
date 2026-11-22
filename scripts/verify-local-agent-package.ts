import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const root = process.cwd();
const sourceDir = path.join(root, "local-agent");
const archivePath = path.join(root, "public", "downloads", "fremiq-local-agent.zip");
const files = ["agent.py", "requirements.txt", "README.md", "Start FREMIQ Agent.bat"];

if (!fs.existsSync(archivePath)) {
  throw new Error("The downloadable FREMIQ Local Agent ZIP is missing");
}

const archive = new AdmZip(archivePath);
for (const name of files) {
  const entry = archive.getEntry(name);
  const sourcePath = path.join(sourceDir, name);
  if (!entry) throw new Error(`The Local Agent ZIP is missing ${name}`);
  if (!fs.readFileSync(sourcePath).equals(entry.getData())) {
    throw new Error(`The Local Agent ZIP is stale: ${name} differs from local-agent/${name}`);
  }
}

console.log(`Verified ${files.length} Local Agent files in the downloadable ZIP`);
