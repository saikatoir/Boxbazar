const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const generatedDir = path.join(__dirname, '..', 'generated', 'client');

if (!fs.existsSync(generatedDir)) {
  console.log(
    '[db] Skipping typecheck: generated/client not found. Run `pnpm generate` first.'
  );
  process.exit(0);
}

try {
  execSync('tsc --noEmit', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch {
  process.exit(1);
}
