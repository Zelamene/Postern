import { runDisposable } from './e2e-runtime.mjs'

await runDisposable({
  name: 'E2E',
  prefix: 'postern-e2e',
  task: ({ stack, webEnvironment }) =>
    stack.runPlaywright('playwright.config.ts', webEnvironment, process.argv.slice(2)),
})
