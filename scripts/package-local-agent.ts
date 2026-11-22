import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const root = process.cwd();
const sourceDir = path.join(root, "local-agent");
const outputPath = path.join(root, "public", "downloads", "fremiq-local-agent.zip");
const files = ["agent.py", "requirements.txt", "README.md", "Start FREMIQ Agent.bat"];
const archive = new AdmZip();

for (const name of files) {
  const filePath = path.join(sourceDir, name);
  if (!fs.existsSync(filePath)) throw new Error(`Local Agent package file is missing: ${name}`);
  archive.addLocalFile(filePath, "", name);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
archive.writeZip(outputPath);
console.log(`Packaged ${files.length} Local Agent files: ${path.relative(root, outputPath)}`);
