"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeCursorRef = storeCursorRef;
exports.getCursorRef = getCursorRef;
const crypto_1 = __importDefault(require("crypto"));
const refs = new Map();
const TTL_MS = 30 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of refs) {
        if (entry.expiresAt <= now)
            refs.delete(token);
    }
}, 5 * 60 * 1000).unref?.();
/** Stores image bytes for a short-lived public URL Cursor Cloud can fetch. */
function storeCursorRef(buffer, mimeType) {
    const token = crypto_1.default.randomBytes(16).toString('hex');
    refs.set(token, { buffer, mimeType, expiresAt: Date.now() + TTL_MS });
    return token;
}
function getCursorRef(token) {
    const entry = refs.get(token);
    if (!entry)
        return null;
    if (entry.expiresAt <= Date.now()) {
        refs.delete(token);
        return null;
    }
    return { buffer: entry.buffer, mimeType: entry.mimeType };
}
