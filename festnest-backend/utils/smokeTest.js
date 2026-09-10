// utils/smokeTest.js – Lightweight pre-deploy syntax and import verification
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔍 Running FestNest pre-deploy smoke test...');

// 1. Collect all JavaScript files to check syntax
const DIRS_TO_SCAN = ['controllers', 'routes', 'models', 'middleware', 'config', 'utils'];
const filesToCheck = [path.join(rootDir, 'server.js')];

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      // Don't recursively check smokeTest itself or seed
      if (entry.name !== 'smokeTest.js') {
        filesToCheck.push(fullPath);
      }
    }
  }
}

for (const dir of DIRS_TO_SCAN) {
  scanDirectory(path.join(rootDir, dir));
}

let syntaxErrors = 0;
for (const file of filesToCheck) {
  const relPath = path.relative(rootDir, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    syntaxErrors++;
    console.error(`❌ [SYNTAX ERROR] ${relPath}:`);
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error(stderr.trim());
  }
}

if (syntaxErrors > 0) {
  console.error(`\n🚨 Pre-deploy smoke test FAILED with ${syntaxErrors} syntax error(s). Deploy aborted.`);
  process.exit(1);
}

console.log(`✅ Syntax check passed for ${filesToCheck.length} files.`);

// 2. Test importing key modules to catch broken imports or runtime initialization bugs
const modulesToImport = [
  './models/Competition.js',
  './models/Event.js',
  './middleware/validate.js',
  './controllers/eventsController.js',
  './routes/ai.js',
  './routes/events.js',
];

try {
  for (const mod of modulesToImport) {
    const modPath = path.resolve(rootDir, mod);
    await import(`file://${modPath}`);
  }
  console.log(`✅ Module import check passed for ${modulesToImport.length} critical modules.`);
} catch (importErr) {
  console.error('\n🚨 [IMPORT ERROR] Failed to load module:', importErr);
  process.exit(1);
}

console.log('🎉 Pre-deploy smoke test PASSED successfully!\n');
process.exit(0);
