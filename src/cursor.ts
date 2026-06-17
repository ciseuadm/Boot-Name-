// Thin wrapper around the Cursor SDK (Cloud Agents).
//
// The bot forwards admin messages here; each task spins up (or resumes) a
// cloud agent that works on THIS repo on a Cursor-hosted VM, optionally opens a
// PR, and returns the assistant's final answer. Model is "auto" by default so
// Cursor itself routes the task to the right model (Sonnet / Opus / Max).
//
// Everything is gated behind CURSOR_API_KEY: if it isn't set the feature stays
// dormant and the bot keeps working exactly as before.

import type { RunResult, RunResultStatus } from '@cursor/sdk';

// Loaded lazily so the bot never pays the SDK's load cost (or its Node >=22.13
// requirement / native deps) unless the Cursor feature is actually used.
async function sdk() {
  return import('@cursor/sdk');
}

const API_KEY = (process.env.CURSOR_API_KEY ?? '').trim();
const MODEL_ID = (process.env.CURSOR_MODEL ?? 'auto').trim() || 'auto';
const REPO_URL = normalizeRepoUrl(
  process.env.CURSOR_REPO_URL ?? 'https://github.com/ciseuadm/Boot-Name-',
);
const REPO_REF = (process.env.CURSOR_REPO_REF ?? 'main').trim();
// Open a PR per task by default (review before merge). Set CURSOR_AUTO_PR=false
// to let the agent work without raising a PR.
const AUTO_PR = (process.env.CURSOR_AUTO_PR ?? 'true').toLowerCase() !== 'false';

export function cursorConfigured(): boolean {
  return API_KEY.length > 0;
}

/** Canonical form expected by the Cursor Cloud API (no trailing .git). */
export function normalizeRepoUrl(url: string): string {
  return url.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
}

export function getCursorRepoUrl(): string {
  return REPO_URL;
}

/** Web URL to watch a cloud agent live (same account as CURSOR_API_KEY). */
export function cursorAgentUrl(agentId: string): string {
  return `https://cursor.com/agents/${agentId}`;
}

export interface CursorRepoCheck {
  ok: boolean;
  message: string;
  available: string[];
}

/**
 * Lists repos the API key can actually reach via the Cursor ↔ GitHub integration.
 * If our configured repo isn't in the list, cloud agents will fail with
 * "Failed to verify existence of branch …".
 */
export async function checkCursorRepoAccess(): Promise<CursorRepoCheck> {
  try {
    const { Cursor } = await sdk();
    const repos = await Cursor.repositories.list({ apiKey: API_KEY });
    const available = repos.map(r => normalizeRepoUrl(r.url));
    const ok = available.some(u => u.toLowerCase() === REPO_URL.toLowerCase());
    if (ok) {
      return { ok: true, message: '', available };
    }
    const preview = available.slice(0, 8).map(u => `• <code>${u}</code>`).join('\n');
    return {
      ok: false,
      message:
        `Cursor не видит репозиторий <code>${REPO_URL}</code> через GitHub-интеграцию.\n\n` +
        `<b>Что сделать:</b>\n` +
        `1. Открой <a href="https://cursor.com/dashboard/integrations">cursor.com/dashboard/integrations</a>\n` +
        `2. Подключи GitHub (Install Cursor GitHub App)\n` +
        `3. Выдай доступ к репозиторию <code>ciseuadm/Boot-Name-</code> (или ко всем)\n` +
        `4. Подожди минуту и снова /cursor\n\n` +
        (preview
          ? `<b>Репозитории, которые Cursor уже видит:</b>\n${preview}`
          : `<b>Cursor пока не видит ни одного репозитория</b> — GitHub ещё не подключён.`),
      available,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        `Не удалось проверить доступ к репозиторию: ${(e as Error).message}\n\n` +
        `Проверь CURSOR_API_KEY на <a href="https://cursor.com/dashboard/integrations">Integrations</a>.`,
      available: [],
    };
  }
}

/** Turns raw SDK validation errors into actionable Telegram HTML. */
export function formatCursorError(err: unknown): string {
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  const raw = msg(err);
  if (/Failed to verify existence of branch/i.test(raw)) {
    return (
      `${raw}\n\n` +
      `<b>Причина:</b> Cursor GitHub App не имеет доступа к этому репо/ветке.\n\n` +
      `<b>Исправление:</b>\n` +
      `1. <a href="https://cursor.com/dashboard/integrations">Integrations → GitHub</a> — подключи приложение\n` +
      `2. В GitHub → Settings → Applications → Cursor — дай доступ к <code>ciseuadm/Boot-Name-</code>\n` +
      `3. Убедись, что ветка <code>${REPO_REF}</code> существует (она есть на GitHub)\n` +
      `4. Перезапусти /cursor`
    );
  }
  if (/IntegrationNotConnected|integration.*not connected/i.test(raw)) {
    return `${raw}\n\nПодключи GitHub на cursor.com/dashboard/integrations.`;
  }
  return raw;
}

export interface CursorOutcome {
  agentId: string;
  runId: string;
  status: RunResultStatus;
  result?: string;
  prUrl?: string;
}

function firstPrUrl(result: RunResult): string | undefined {
  return result.git?.branches?.find(b => b.prUrl)?.prUrl;
}

/**
 * Runs one task. Creates a fresh cloud agent when `prevAgentId` is null,
 * otherwise resumes the existing conversation so follow-up fixes keep context.
 * `onStarted` is invoked with the agent/run IDs as soon as the run is dispatched
 * — persist them there so an answer can still be recovered after a restart.
 */
export async function runCursorTask(
  prompt: string,
  prevAgentId: string | null,
  onStarted: (agentId: string, runId: string) => Promise<void>,
): Promise<CursorOutcome> {
  const { Agent } = await sdk();
  const agent = prevAgentId
    ? await Agent.resume(prevAgentId, { apiKey: API_KEY })
    : await Agent.create({
        apiKey: API_KEY,
        model: { id: MODEL_ID },
        name: 'Telegram Ops',
        cloud: {
          repos: [{ url: REPO_URL, startingRef: REPO_REF }],
          autoCreatePR: AUTO_PR,
          skipReviewerRequest: true,
        },
      });

  try {
    const run = await agent.send(prompt);
    await onStarted(agent.agentId, run.id).catch(() => {});
    const result = await run.wait();
    return {
      agentId: agent.agentId,
      runId: run.id,
      status: result.status,
      result: result.result,
      prUrl: firstPrUrl(result),
    };
  } finally {
    await agent[Symbol.asyncDispose]().catch(() => {});
  }
}

/** Cancels an in-flight run. Best-effort; safe to call on an already-finished run. */
export async function cancelCursorRun(agentId: string, runId: string): Promise<void> {
  const { Agent } = await sdk();
  await Agent.cancelRun(runId, { runtime: 'cloud', agentId, apiKey: API_KEY });
}

/** Re-attaches to a run that was already dispatched (used for crash recovery). */
export async function awaitExistingRun(agentId: string, runId: string): Promise<CursorOutcome> {
  const { Agent } = await sdk();
  const run = await Agent.getRun(runId, { runtime: 'cloud', agentId, apiKey: API_KEY });
  const result = await run.wait();
  return {
    agentId,
    runId,
    status: result.status,
    result: result.result,
    prUrl: firstPrUrl(result),
  };
}
