"use strict";
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
exports.processReferral = processReferral;
exports.handleRefCommand = handleRefCommand;
exports.notifyReferrer = notifyReferrer;
const tg_1 = require("../tg");
const db_1 = require("../db");
const emoji_1 = require("../emoji");
// Called on /start ref_CODE — register referral for new user
async function processReferral(newUserId, code) {
    const referrer = await (0, db_1.getUserByReferralCode)(code);
    if (!referrer || referrer.id === newUserId)
        return;
    const newUser = await (0, db_1.getUser)(newUserId);
    if (newUser?.referred_by)
        return; // already referred
    await (0, db_1.recordReferral)(newUserId, referrer.id);
    // New user gets 1 day free trial
    await (0, db_1.grantPremiumDays)(newUserId, 1);
}
// /ref command
async function handleRefCommand(userId, chatId) {
    const user = await (0, db_1.getUser)(userId);
    if (!user)
        return;
    const link = `https://t.me/${tg_1.BOT_USERNAME}?start=ref_${user.referral_code}`;
    const count = user.referral_count;
    const premium = await (0, db_1.isPremium)(userId);
    await (0, tg_1.sendMessage)(chatId, `${(0, emoji_1.ce)('handshake')} <b>Реферальная программа</b>\n\n` +
        `Твоя ссылка:\n<code>${link}</code>\n\n` +
        `Как работает:\n` +
        `${(0, emoji_1.ce)('gift')} Друг переходит по твоей ссылке и получает <b>1 день Premium бесплатно</b>\n` +
        `${(0, emoji_1.ce)('star')} Ты получаешь <b>+1 день Premium</b> за каждого\n` +
        `${(0, emoji_1.ce)('fire')} Каждые 3 реферала = <b>+5 дней Premium</b> бонусом\n\n` +
        `${(0, emoji_1.ce)('chart')} Твоя статистика:\n` +
        `${(0, emoji_1.ce)('people')} Рефералов: <b>${count}</b>\n` +
        (premium ? '' : `\n${(0, emoji_1.ce)('bulb')} Начни делиться ссылкой прямо сейчас!`));
}
// Called after successful referral — notify referrer
async function notifyReferrer(referrerId, newUserId) {
    const referrer = await (0, db_1.getUser)(referrerId);
    if (!referrer)
        return;
    const { sendMessage: send } = await Promise.resolve().then(() => __importStar(require('../tg')));
    const count = referrer.referral_count;
    const bonusMsg = count % 3 === 0 ? `\n${(0, emoji_1.ce)('fire')} Бонус: <b>+5 дней Premium</b> за 3 реферала!` : '';
    const newUser = await (0, db_1.getUser)(newUserId);
    const href = newUser?.username
        ? `https://t.me/${newUser.username}`
        : `tg://user?id=${newUserId}`;
    const userLink = `<a href="${href}">новый</a>`;
    await send(referrerId, `${(0, emoji_1.ce)('gift')} По твоей реферальной ссылке зарегистрировался ${userLink} пользователь!\n` +
        `Ты получил <b>+1 день Premium</b>.${bonusMsg}\n\n` +
        `Всего рефералов: ${count}`).catch(() => { });
}
