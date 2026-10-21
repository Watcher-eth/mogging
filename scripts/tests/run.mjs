// Bun's module mocks persist between files. Run each suite in its own process.
const files = [...new Bun.Glob('{components,lib,tests}/**/*.test.{ts,tsx}').scanSync()].sort();
let failed = 0;

for (const file of files) {
  const result = Bun.spawnSync([process.execPath, 'test', `./${file}`, ...process.argv.slice(2)], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) failed++;
}

console.log(`\n${files.length} test files: ${files.length - failed} passed, ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
