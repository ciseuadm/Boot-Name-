"use strict";
// Thin wrapper around the Cursor SDK (Cloud Agents).
//
// The bot forwards admin messages here; each task spins up (or resumes) a
// cloud agent that works on THIS repo on a Cursor-hosted VM, optionally opens a
// PR, and returns the assistant's final answer. Model is "auto" by default so
// Cursor itself routes the task to the right model (Sonnet / Opus / Max).
//
// Everything is gated behind CURSOR_API_KEY: if it isn't set the feature stays
// dormant and the bot keeps working exactly as before.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cursorConfigured = cursorConfigured;
exports.runCursorTask = runCursorTask;
exports.cancelCursorRun = cancelCursorRun;
exports.awaitExistingRun = awaitExistingRun;
// Loaded lazily so the bot never pays the SDK's load cost (or its Node >=22.13
// requirement / native deps) unless the Cursor feature is actually used.
async function sdk() {
    return Promise.resolve().then(() => __importStar(require('@cursor/sdk')));
}
const API_KEY = (process.env.CURSOR_API_KEY ?? '').trim();
const MODEL_ID = (process.env.CURSOR_MODEL ?? 'auto').trim() || 'auto';
const REPO_URL = (process.env.CURSOR_REPO_URL ?? 'https://github.com/ciseuadm/Boot-Name-.git').trim();
const REPO_REF = (process.env.CURSOR_REPO_REF ?? 'main').trim();
// Open a PR per task by default (review before merge). Set CURSOR_AUTO_PR=false
// to let the agent work without raising a PR.
const AUTO_PR = (process.env.CURSOR_AUTO_PR ?? 'true').toLowerCase() !== 'false';
function cursorConfigured() {
    return API_KEY.length > 0;
}
function firstPrUrl(result) {
    return result.git?.branches?.find(b => b.prUrl)?.prUrl;
}
/**
 * Runs one task. Creates a fresh cloud agent when `prevAgentId` is null,
 * otherwise resumes the existing conversation so follow-up fixes keep context.
 * `onStarted` is invoked with the agent/run IDs as soon as the run is dispatched
 * — persist them there so an answer can still be recovered after a restart.
 */
async function runCursorTask(prompt, prevAgentId, onStarted) {
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
        await onStarted(agent.agentId, run.id).catch(() => { });
        const result = await run.wait();
        return {
            agentId: agent.agentId,
            runId: run.id,
            status: result.status,
            result: result.result,
            prUrl: firstPrUrl(result),
        };
    }
    finally {
        await agent[Symbol.asyncDispose]().catch(() => { });
    }
}
/** Cancels an in-flight run. Best-effort; safe to call on an already-finished run. */
async function cancelCursorRun(agentId, runId) {
    const { Agent } = await sdk();
    await Agent.cancelRun(runId, { runtime: 'cloud', agentId, apiKey: API_KEY });
}
/** Re-attaches to a run that was already dispatched (used for crash recovery). */
async function awaitExistingRun(agentId, runId) {
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
