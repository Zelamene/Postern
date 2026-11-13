import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const summaryPath = resolve(process.cwd(), 'coverage/coverage-summary.json')

if (!existsSync(summaryPath)) {
  console.log('No coverage/coverage-summary.json found; skipping the coverage summary.')
  process.exit(0)
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
const metrics = ['lines', 'statements', 'branches', 'functions']

const rows = metrics.map((metric) => {
  const entry = summary.total[metric]
  return `| ${metric} | ${entry.pct}% | ${entry.covered} / ${entry.total} |`
})

const markdown = [
  '## Web coverage',
  '',
  'Merged unit and integration coverage, generated from `coverage/coverage-summary.json`.',
  '',
  '| Metric | Coverage | Covered |',
  '|:---|:---|:---|',
  ...rows,
  '',
].join('\n')

console.log(markdown)

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
}
