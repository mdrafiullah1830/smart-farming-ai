import type { Env } from '../types.ts';
import { json, error } from '../http.ts';

// ---------------------------------------------------------------------------
// Voice-first assistant support.
//
// A farmer does not type Bangla. They speak, and what the recogniser hands back
// is Banglish -- "boro ta kete aishen", "kadhatar sar" -- mixed with imperfect
// Bangla. Sending that straight to the guidance matcher finds nothing, because
// it looks for "সার" and "সেচ". So two things happen here that plain text does
// not get:
//
//  1. Banglish is normalised into Bangla, and the route reports whether it did,
//     so the UI can show what it understood and the farmer can correct it.
//     Correcting a misheard word matters: a wrong guess acted on silently is
//     worse than asking again.
//  2. The last few turns are carried as context, so a follow-up like "ki kore?"
//     resolves against what was asked before. Voice makes short questions the
//     normal case -- typing a follow-up in full is exactly what voice is for.
//
// Nothing here invents an answer. The guidance itself is the curated set
// already served by /api/v1/chat; this only makes the input reach it.
// ---------------------------------------------------------------------------

/**
 * Banglish -> Bangla. Deliberately small and explicit rather than clever: it
 * covers the terms a farmer actually says, and anything it does not know is
 * left alone rather than mangled.
 */
const BANGLISH_MAP: Array<[RegExp, string]> = [
  // Crops
  [/\bbhai\b|\bpora\b|\bboro\b/gi, 'বোরো'],
  [/\bchaa\b|\brice\b/gi, 'ধান'],
  [/\bgam\b|\bwheat\b/gi, 'গম'],
  [/\bshorisha\b|\bsarson\b|\bmustard\b/gi, 'সরিষা'],
  [/\bmosur\b|\bpulse\b|\bdal\b/gi, 'ডাল'],
  [/\btaromuz\b|\bwatal\b|\bmelon\b/gi, 'তরমুজ'],
  [/\biber\b|\bchilli\b|\bchili\b/gi, 'মরিচ'],
  [/\balu\b|\bpotato\b/gi, 'আলু'],
  // Farm terms
  [/\bkadhatar\b|\bkh\b|\bdam\b/gi, 'খাদ্য'],
  [/\bsar\b|\bfertili/gi, 'সার'],
  [/\bsech\b|\bpani\b|\bwater\b|\birrig/gi, 'পানি'],
  [/\brog\b|\bdisease\b|\bbimari\b/gi, 'রোগ'],
  [/\bpatha\b|\blos\b|\bcrop\b/gi, 'ফসল'],
  [/\bjomi\b|\bfield\b|\blot\b/gi, 'জমি'],
  [/\bmash\b|\bseason\b/gi, 'মৌসুম'],
  // Verbs and question words
  [/\bkete\b|\bkat\b/gi, 'করে'],
  [/\bkora\b|\bkor\b/gi, 'কর'],
  [/\bkore\b|\bkor\b/gi, 'করে'],
  [/\bkivabe\b|\bhow\b/gi, 'কীভাবে'],
  [/\bkoto\b|\bhow much\b/gi, 'কত'],
  [/\bhobe\b|\bwill\b/gi, 'হবে'],
  [/\bachi\b|\bachilam\b/gi, 'আছি'],
  [/\bboth\b/gi, 'পরা'],
  [/\bki\b|\bwhat\b/gi, 'কি'],
  [/\bdilam\b|\bdiyechi\b/gi, 'দিয়েছি'],
  [/\bbighi\b|\bacre\b/gi, 'বিঘা'],
  [/\blagbe\b|\bneeded\b/gi, 'লাগবে'],
  [/\bhocche\b|\bhose\b|\bhocche\b/gi, 'হচ্ছে'],
  [/\bta\b|\bbhat\b/gi, ''],
  [/\baishen\b|\baissen\b|\bkorbo\b|\bkorben\b/gi, 'করবেন'],
  [/\bhobo\b|\bkorbo\b/gi, 'হবে'],
  [/\bni\b|\bna\b/gi, 'না'],
  [/\bki\b|\bwhat\b/gi, 'কি'],
];

export type VoiceTurn = { role: 'user' | 'assistant'; text: string };

/**
 * Resolve a short follow-up against the previous turn.
 *
 * "ki kore?" alone carries no topic. If the previous question was about
 * fertilizer, the follow-up is about fertilizer too. This is string matching,
 * not understanding -- stated plainly here because pretending to comprehend
 * would be the dishonest part.
 */
export function resolveFollowUp(query: string, context: VoiceTurn[]): string {
  const q = query.trim();
  const short = q.replace(/[?.।\s]+$/g, '').length <= 12;
  if (!short || context.length === 0) return q;

  const lastUser = [...context].reverse().find((t) => t.role === 'user');
  if (!lastUser) return q;
  // Already carries a subject: leave it rather than doubling the topic.
  if (/সার|পানি|রোগ|ফসল|জমি|খাদ্য/.test(q)) return q;
  return `${q} ${lastUser.text}`;
}

/** The same curated guidance the text chat serves, plus the season question. */
export function voiceGuidance(query: string, lang: 'bn' | 'en'): string {
  const lower = query.toLowerCase();
  const bn = lang !== 'en';
  if (/সার|fertili/.test(lower)) {
    return bn
      ? 'মাটি পরীক্ষা ও ফসলের বৃদ্ধির ধাপ অনুযায়ী সার দিন; ভারী বৃষ্টির আগে সার প্রয়োগ করবেন না।'
      : 'Apply fertilizer after a soil test and follow crop-stage guidance; avoid applying before heavy rain.';
  }
  if (/পানি|সেচ|irrig/.test(lower)) {
    return bn
      ? 'সকালে সেচ দিন, আগে মাটির আর্দ্রতা দেখুন এবং জমিতে পানি জমতে দেবেন না।'
      : 'Irrigate early morning, check soil moisture first, and avoid standing water.';
  }
  if (/রোগ|পাতা|disease/.test(lower)) {
    return bn
      ? 'আক্রান্ত গাছ আলদা করুন, পাতার দুই পাশের পরিষ্কার ছবি নিন এবং কীটনাশক ব্যবহারের আগে স্থানীয় কৃষি কর্মকর্তার পরামর্শ নিন।'
      : 'Isolate affected plants, photograph both sides of the leaf, and consult a local agriculture officer before pesticide use.';
  }
  if (/\b(boro|aman|aus)\b/i.test(lower)) {
    const season = /boro/i.test(lower) ? 'বোরো' : /aus/i.test(lower) ? 'আউস' : 'আমন';
    return bn
      ? `${season} মৌসুমে বীজ বপন, সেচ ও সারের ক্রম অনুযায়ী কাজ করুন; আগের মৌসুমের তুলনায় সময় একটু আগে ধরুন।`
      : `For the ${season} season follow the usual order of sowing, irrigation and fertilizer; shift slightly earlier than last season.`;
  }
  return bn
    ? 'সঠিক পরামর্শের জন্য ফসলের নাম, জেলা এবং সমস্যাটি বিস্তারিত বলুন।'
    : 'Please share the crop, district and the specific problem for a focused recommendation.';
}

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

/**
 * POST /api/v1/voice/ask
 *
 * Takes a spoken transcript, normalises it, resolves a short follow-up against
 * the supplied context, and returns guidance plus enough detail for the UI to
 * show what it understood.
 */
export async function voiceAskRoute(request: Request, env: Env): Promise<Response> {
  const data = await body<{ transcript?: string; lang?: string; context?: unknown }>(request);
  const raw = (data?.transcript ?? '').trim();
  if (!raw) return error(request, env, 400, 'transcript is required');

  // A recogniser transcript longer than this is a stuck microphone, not a
  // question, and it would be matched against the rules as if it were.
  if (raw.length > 1000) return error(request, env, 400, 'transcript is too long');

  const lang = data?.lang === 'en' ? 'en' : 'bn';
  const context = carryContext(data?.context);
  const normalized = normalizeBanglish(raw);
  const resolved = resolveFollowUp(normalized.text, context);
  const reply = voiceGuidance(resolved, lang);

  return json(request, env, {
    success: true,
    transcript: raw,
    // What the engine actually matched on, so the UI can show it. A farmer who
    // sees a wrong interpretation can correct it before acting.
    understood: resolved,
    wasBanglish: normalized.wasBanglish,
    usedContext: resolved !== normalized.text,
    reply,
    source: 'curated-voice-guidance',
  });
}

/**
 * GET /api/v1/voice/capabilities
 *
 * What this browser and server can actually do, so the UI can degrade honestly
 * instead of offering a microphone that will not work. Public: it reveals no
 * user data and the UI needs it before sign-in.
 */
export function voiceCapabilitiesRoute(request: Request, env: Env): Response {
  return json(request, env, {
    success: true,
    capabilities: {
      // The server never transcribes audio: it only matches text. This is the
      // honest limit of a deployment with no STT model.
      serverTranscription: false,
      banglishNormalisation: true,
      conversationContext: true,
      languages: ['bn', 'en'],
    },
    // The browser supplies SpeechRecognition and speechSynthesis. Which ones
    // exist is a browser property, not a server one, so the client reports it.
    browserResponsibility: ['SpeechRecognition', 'speechSynthesis'],
  });
}

/**
 * Normalise a spoken transcript.
 *
 * Returns the Bangla form and whether anything was actually changed, so the
 * caller can be honest with the farmer about interpreting their words.
 */
export function normalizeBanglish(input: string): { text: string; wasBanglish: boolean } {
  let out = input;
  for (const [pattern, replacement] of BANGLISH_MAP) out = out.replace(pattern, replacement);
  const wasBanglish = out !== input;
  // Collapse the doubled whitespace that the replacements can leave behind.
  return { text: out.replace(/\s{2,}/g, ' ').trim(), wasBanglish };
}

/**
 * Carry a short conversation so a follow-up has something to attach to.
 *
 * Capped at 4 turns and 400 characters each: the matcher is a rule set, not a
 * language model, so a long history adds noise rather than context. Bounding
 * it also stops a caller pushing an arbitrary payload into the matching regexes.
 */
export function carryContext(turns: unknown): VoiceTurn[] {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      role: t.role === 'assistant' ? 'assistant' as const : 'user' as const,
      text: String(t.text ?? '').slice(0, 400),
    }))
    .filter((t) => t.text.length > 0)
    .slice(-4);
}