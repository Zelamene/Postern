#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
const reportDir = process.env.DAST_REPORT_DIR || 'dast-reports';
const scanDate = process.env.DAST_SCAN_DATE || new Date().toISOString().slice(0, 10);
const reviewDays = Number.parseInt(process.env.DAST_REVIEW_DAYS || '30', 10);
const expectedReports = (process.env.DAST_EXPECTED_REPORTS || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const exclusionsPath = process.env.DAST_EXCLUSIONS_FILE || 'zap/finding-exclusions.json';
const exclusions = existsSync(exclusionsPath)
  ? JSON.parse(readFileSync(exclusionsPath, 'utf8')).exclusions || []
  : [];
const excludedPluginIds = new Set(exclusions.map((entry) => String(entry.pluginId)));

if (!token) throw new Error('GITHUB_TOKEN is required');
if (!repository) throw new Error('GITHUB_REPOSITORY is required');
if (!Number.isFinite(reviewDays) || reviewDays <= 0) {
  throw new Error('DAST_REVIEW_DAYS must be a positive integer');
}
if (!existsSync(reportDir)) throw new Error(`DAST report directory missing: ${reportDir}`);

const TRACKING_LABEL = 'dast-finding';
const OVERDUE_LABEL = 'dast-review-overdue';
const SECURITY_LABEL = 'security';

async function api(route, options = {}) {
  const response = await fetch(`${apiUrl}${route}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`GitHub API ${options.method || 'GET'} ${route} failed (${response.status}): ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

async function ensureLabel(name, color, description) {
  try {
    await api(`/repos/${repository}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color, description }),
    });
  } catch (error) {
    if (!String(error.message).includes('(422)')) throw error;
  }
}

async function allOpenTrackedIssues() {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(
      `/repos/${repository}/issues?state=open&labels=${encodeURIComponent(TRACKING_LABEL)}&per_page=100&page=${page}`,
    );
    issues.push(...batch);
    if (batch.length < 100) return issues;
  }
}

function normalizedPath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname
      .split('/')
      .map((segment) => {
        if (/^\d+$/.test(segment)) return '{id}';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
          return '{uuid}';
        }
        return segment;
      })
      .join('/');
    return segments || '/';
  } catch {
    return String(rawUrl || '').split('?')[0];
  }
}

function riskOf(alert) {
  if (alert.risk === 'High' || alert.risk === 'Medium') return alert.risk;
  const description = alert.riskdesc || alert.riskDesc || '';
  if (/^high/i.test(description)) return 'High';
  if (/^medium/i.test(description)) return 'Medium';
  const code = Number(alert.riskcode ?? alert.riskCode);
  if (code === 3) return 'High';
  if (code === 2) return 'Medium';
  return '';
}

function primaryInstance(alert) {
  return alert.instances?.[0] || alert;
}

function fingerprintFor(alert) {
  const instance = primaryInstance(alert);
  const parts = [
    alert.pluginId || alert.pluginid || '',
    alert.name || alert.alert || '',
    (instance.method || alert.method || '').toUpperCase(),
    normalizedPath(instance.uri || alert.url),
    instance.param || alert.param || alert.inputVector || '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 20);
}

function readFindings() {
  const files = readdirSync(reportDir)
    .filter((name) => name.startsWith('zap-') && name.endsWith('-report.json'))
    .sort();
  if (expectedReports.length) {
    const missing = expectedReports.filter((name) => !files.includes(name));
    if (missing.length) throw new Error(`Missing ZAP reports: ${missing.join(', ')}`);
  }
  if (!files.length) throw new Error(`No ZAP JSON reports found in ${reportDir}`);

  const findings = new Map();
  const excluded = new Map();
  for (const file of files) {
    const report = JSON.parse(readFileSync(path.join(reportDir, file), 'utf8'));
    for (const site of report.site || []) {
      for (const alert of site.alerts || []) {
        const risk = riskOf(alert);
        if (risk !== 'High' && risk !== 'Medium') continue;
        const pluginId = String(alert.pluginId || alert.pluginid || '');
        if (excludedPluginIds.has(pluginId)) {
          const exclusion = exclusions.find((entry) => String(entry.pluginId) === pluginId);
          excluded.set(pluginId, {
            pluginId,
            name: alert.name || alert.alert || '',
            risk,
            reason: exclusion?.reason || 'Documented environment exclusion',
          });
          continue;
        }
        const instance = primaryInstance(alert);
        const fingerprint = fingerprintFor(alert);
        const finding = findings.get(fingerprint) || {
          fingerprint,
          risk,
          name: alert.name || alert.alert || 'Unnamed ZAP alert',
          pluginId,
          method: instance.method || alert.method || '',
          path: normalizedPath(instance.uri || alert.url),
          param: instance.param || alert.param || alert.inputVector || '',
          reports: [],
        };
        if (risk === 'High') finding.risk = 'High';
        finding.reports.push(file);
        findings.set(fingerprint, finding);
      }
    }
  }
  return { files, findings: [...findings.values()], excluded: [...excluded.values()] };
}

function firstSeenFrom(body, createdAt) {
  const match = body?.match(/First seen:\s*`?(\d{4}-\d{2}-\d{2})`?/i);
  return match ? match[1] : String(createdAt || scanDate).slice(0, 10);
}

function daysSince(dateString) {
  const then = Date.parse(`${dateString}T00:00:00Z`);
  const now = Date.parse(`${scanDate}T00:00:00Z`);
  return Math.floor((now - then) / 86_400_000);
}

function issueBody(finding, firstSeen) {
  return [
    '<!-- dast-finding: tracked automatically by web/scripts/review-dast-findings.mjs -->',
    `Fingerprint: \`${finding.fingerprint}\``,
    `Risk: **${finding.risk}**`,
    `Rule: ${finding.pluginId} — ${finding.name}`,
    `Request: \`${finding.method} ${finding.path}\`${finding.param ? ` (parameter: \`${finding.param}\`)` : ''}`,
    `First seen: \`${firstSeen}\``,
    `Last seen: \`${scanDate}\``,
    `Reports: ${[...new Set(finding.reports)].map((name) => `\`${name}\``).join(', ')}`,
    '',
    'This issue is maintained by the nightly DAST job. Medium findings are reviewed when they remain unresolved for 30 days; high findings fail the nightly workflow immediately.',
  ].join('\n');
}

function issueTitle(finding) {
  return `[DAST][${finding.risk}] ${finding.name} — ${finding.path}`;
}

function findIssueByFingerprint(issues, fingerprint) {
  return issues.find((issue) => {
    const match = issue.body?.match(/Fingerprint:\s*`?([a-f0-9]{12,64})`?/i);
    return match?.[1] === fingerprint;
  });
}

await ensureLabel(TRACKING_LABEL, 'd73a4a', 'DAST finding tracked by the nightly ZAP scan');
await ensureLabel(OVERDUE_LABEL, 'b60205', 'DAST medium finding unresolved beyond the review window');
await ensureLabel(SECURITY_LABEL, 'ee0701', 'Security work');

const { files, findings, excluded } = readFindings();
const issues = await allOpenTrackedIssues();
const summary = [
  '## QR1.6 DAST finding review',
  '',
  `- Scan date: \`${scanDate}\``,
  `- Reports: ${files.map((name) => `\`${name}\``).join(', ')}`,
  `- High findings: **${findings.filter((finding) => finding.risk === 'High').length}**`,
  `- Medium findings: **${findings.filter((finding) => finding.risk === 'Medium').length}**`,
  `- Documented environment exclusions: **${excluded.length}**`,
  '',
];
for (const entry of excluded) {
  summary.push(`- Excluded rule ${entry.pluginId} (${entry.name}): ${entry.reason}`);
}
if (excluded.length) summary.push('');

const seenFingerprints = new Set();
for (const finding of findings) {
  seenFingerprints.add(finding.fingerprint);
  let issue = findIssueByFingerprint(issues, finding.fingerprint);
  if (!issue) {
    issue = await api(`/repos/${repository}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: issueTitle(finding),
        body: issueBody(finding, scanDate),
        labels: [TRACKING_LABEL, SECURITY_LABEL],
      }),
    });
    issues.push(issue);
    summary.push(`- Created tracking issue ${issue.number} for ${finding.risk.toLowerCase()} finding \`${finding.fingerprint}\`.`);
  } else {
    const firstSeen = firstSeenFrom(issue.body, issue.created_at);
    const labels = (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name));
    await api(`/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: issueTitle(finding),
        body: issueBody(finding, firstSeen),
        labels: labels.includes(OVERDUE_LABEL) ? [...labels] : labels,
      }),
    });
  }
}

if (expectedReports.length === files.length) {
  for (const issue of issues) {
    const fingerprint = issue.body?.match(/Fingerprint:\s*`?([a-f0-9]{12,64})`?/i)?.[1];
    if (fingerprint && seenFingerprints.has(fingerprint)) continue;
    await api(`/repos/${repository}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `Not observed in the nightly ZAP scan on ${scanDate}; closing as resolved. Reopen if this is a crawler false negative.`,
      }),
    });
    await api(`/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    summary.push(`- Closed issue ${issue.number}; finding was not observed in the latest scan.`);
  }
}

const highFindings = findings.filter((finding) => finding.risk === 'High');
const overdue = [];
for (const issue of issues) {
  const fingerprint = issue.body?.match(/Fingerprint:\s*`?([a-f0-9]{12,64})`?/i)?.[1];
  const finding = findings.find((candidate) => candidate.fingerprint === fingerprint);
  if (!finding || finding.risk !== 'Medium') continue;
  const firstSeen = firstSeenFrom(issue.body, issue.created_at);
  if (daysSince(firstSeen) <= reviewDays) continue;

  const labels = (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name));
  if (!labels.includes(OVERDUE_LABEL)) {
    await api(`/repos/${repository}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `30-day medium-finding review required: first seen ${firstSeen}, still present on ${scanDate}. Triage, document an accepted risk, or remediate before this review is satisfied.`,
      }),
    });
    await api(`/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ labels: [...labels, OVERDUE_LABEL] }),
    });
  }
  overdue.push({ issue, firstSeen });
}

if (highFindings.length) {
  summary.push('', `### High findings (blocking)`, '');
  for (const finding of highFindings) {
    summary.push(`- \`${finding.pluginId}\` ${finding.name} on \`${finding.method} ${finding.path}\``);
  }
}
if (overdue.length) {
  summary.push('', `### Medium findings unresolved > ${reviewDays} days (review required)`, '');
  for (const { issue, firstSeen } of overdue) {
    summary.push(`- #${issue.number} — first seen ${firstSeen} (${daysSince(firstSeen)} days)`);
  }
}
if (!highFindings.length && !overdue.length) {
  summary.push('', 'No blocking high findings and no medium findings past the review window.');
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) writeFileSync(summaryPath, `${summary.join('\n')}\n`, { flag: 'a' });
console.log(summary.join('\n'));

if (highFindings.length || overdue.length) process.exitCode = 1;
