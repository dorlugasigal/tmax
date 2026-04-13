#!/usr/bin/env node
/**
 * tmax-pipeline-monitor — Background script that polls an Azure DevOps
 * pipeline run and writes stage-level status to a JSON file that tmax
 * watches to render a progress widget on the originating terminal pane.
 *
 * Usage:
 *   tmax-pipeline-monitor --build-id 1234 --org https://dev.azure.com/myorg \
 *     --project MyProject [--pat $ADO_PAT]
 *
 * Reads TMAX_PANE_ID from environment to know which file to write.
 * Writes to ~/.tmax/pipeline/{TMAX_PANE_ID}.json
 *
 * The AI auto-launches this after triggering a pipeline via its MCP tools.
 */

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

// ── Parse args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const buildId = getArg('build-id');
const org = getArg('org');       // e.g. https://dev.azure.com/myorg
const project = getArg('project');
const pat = getArg('pat') || process.env.ADO_PAT || process.env.AZURE_DEVOPS_PAT;
const paneId = process.env.TMAX_PANE_ID;
const pollInterval = parseInt(getArg('interval') || '15', 10) * 1000;

if (!buildId || !org || !project) {
  console.error('Usage: tmax-pipeline-monitor --build-id ID --org ORG_URL --project PROJECT [--pat PAT]');
  process.exit(1);
}

if (!paneId) {
  console.error('Error: TMAX_PANE_ID environment variable not set. Run this from a tmax terminal pane.');
  process.exit(1);
}

const statusDir = path.join(require('node:os').homedir(), '.tmax', 'pipeline');
const statusFile = path.join(statusDir, `${paneId}.json`);

// Ensure directory exists
fs.mkdirSync(statusDir, { recursive: true });

// ── ADO API client ─────────────────────────────────────────────────────
const authHeader = pat
  ? `Basic ${Buffer.from(`:${pat}`).toString('base64')}`
  : undefined;

function adoFetch(apiPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${org.replace(/\/$/, '')}/${encodeURIComponent(project)}/_apis${apiPath}`);
    url.searchParams.set('api-version', '7.1');

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
        } else {
          reject(new Error(`ADO API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Polling loop ───────────────────────────────────────────────────────
const TERMINAL_RESULTS = new Set(['succeeded', 'failed', 'canceled']);

async function poll() {
  try {
    // Get build info
    const build = await adoFetch(`/build/builds/${buildId}`);
    // Get timeline (stages)
    const timeline = await adoFetch(`/build/builds/${buildId}/timeline`);

    const stages = (timeline.records || [])
      .filter(r => r.type === 'Stage' && r.name !== '__default')
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(r => {
        const stage = {
          name: r.name,
          state: mapState(r.state),
          result: mapResult(r.result),
        };

        if (r.startTime) {
          const start = new Date(r.startTime).getTime();
          if (r.finishTime) {
            stage.duration = Math.round((new Date(r.finishTime).getTime() - start) / 1000);
          } else {
            stage.elapsed = Math.round((Date.now() - start) / 1000);
          }
        }

        return stage;
      });

    const startTime = build.startTime || build.queueTime || new Date().toISOString();
    const status = {
      buildId: parseInt(buildId, 10),
      pipelineName: build.definition?.name || `Build #${buildId}`,
      sourceBranch: (build.sourceBranch || '').replace('refs/heads/', ''),
      status: mapState(build.status),
      result: mapResult(build.result),
      stages,
      startTime,
      estimatedRemaining: null,
      updatedAt: new Date().toISOString(),
    };

    // Write atomically (write to temp, rename)
    const tmpFile = statusFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(status, null, 2));
    fs.renameSync(tmpFile, statusFile);

    // Check if we should stop
    if (TERMINAL_RESULTS.has(build.result)) {
      console.log(`Pipeline ${buildId} finished: ${build.result}`);
      // Keep file for a bit so tmax can show final state, then clean up
      setTimeout(() => {
        try { fs.unlinkSync(statusFile); } catch {}
        process.exit(0);
      }, 30000);
      return false; // Stop polling
    }

    return true; // Continue polling
  } catch (err) {
    console.error(`Poll error: ${err.message}`);
    return true; // Keep trying
  }
}

function mapState(state) {
  if (!state) return 'pending';
  const s = state.toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'inprogress') return 'inProgress';
  if (s === 'cancelling') return 'cancelling';
  if (s === 'notstarted' || s === 'pending') return 'pending';
  return 'pending';
}

function mapResult(result) {
  if (!result) return null;
  const r = result.toLowerCase();
  if (r === 'succeeded') return 'succeeded';
  if (r === 'failed') return 'failed';
  if (r === 'canceled' || r === 'cancelled') return 'canceled';
  if (r === 'skipped') return 'skipped';
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`Monitoring pipeline build ${buildId} for pane ${paneId}`);
  console.log(`Writing status to ${statusFile}`);

  let shouldContinue = true;
  while (shouldContinue) {
    shouldContinue = await poll();
    if (shouldContinue) {
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }
}

// Clean up status file on exit
process.on('SIGINT', () => {
  try { fs.unlinkSync(statusFile); } catch {}
  process.exit(0);
});
process.on('SIGTERM', () => {
  try { fs.unlinkSync(statusFile); } catch {}
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
