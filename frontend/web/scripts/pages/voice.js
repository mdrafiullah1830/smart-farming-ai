/**
 * Voice-first assistant.
 *
 * Voice-first means voice is the default path, not a widget bolted onto a text
 * box. Three things make that true in a browser, and this module owns all three:
 *
 *  1. Speech in. Web Speech API, because it is built into the browser, costs
 *     nothing to serve, and runs on the phone the farmer already owns. It is
 *     Chromium-only, so Firefox and Safari get a real fallback -- typing -- rather
 *     than a microphone button that silently does nothing.
 *  2. Banglish to Bangla. The recogniser returns "koto sar lagbe", not "সার".
 *     The server normalises it, and the UI shows what it understood so a
 *     misheard word can be corrected before anyone acts on it.
 *  3. Speech out. Without this the farmer has to read every answer, which is
 *     the actual reason a low-literacy user would give up. Bengali voices are
 *     picked explicitly: the default system voice on a desktop is usually
 *     English, and Bangla text read by an English voice is unintelligible.
 *
 * Where voice is unavailable the panel says so in plain words and stays usable
 * by typing. It never pretends to be listening.
 */

import { api } from '../api.js';
import { t, getLang } from '../i18n.js';
import { el, qs, replaceChildren } from '../dom.js';
import { setState, State } from '../states.js';
import { reportClientError } from '../telemetry.js';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
const HAS_SR = !!SR;
const HAS_TTS = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

let recognition = null;
let listening = false;
/** Last few turns, sent to the server so a follow-up has context. */
let turns = [];

function speechLocale() {
  return getLang() === 'en' ? 'en-US' : 'bn-BD';
}

/**
 * Pick a Bengali voice.
 *
 * The name check is not decoration: on Windows it is labelled "Bangla
 * (Bangladesh)", on Android/Linux variants like "bn-IN" appear. Falling back to
 * index 0 would pick an English voice on some devices, which reads Bangla script
 * as nonsense -- worse than silence, because the farmer cannot tell it is wrong.
 */
export function pickBengaliVoice() {
  if (!HAS_TTS) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const byLang = voices.filter((v) => /^bn(-|_|$)/i.test(v.lang || ''));
  if (!byLang.length) return null;
  const named = byLang.find((v) => /bangla|bengali/i.test(v.name));
  return named || byLang[0];
}

/** Speak an answer. Returns false when the browser cannot, so callers can say so. */
export function speak(text) {
  if (!HAS_TTS || !text) return false;
  // Cancel first: a queued answer from a previous question would otherwise play
  // after the new one and leave the farmer listening to the wrong advice.
  window.speechSynthesis.cancel();
  const voice = pickBengaliVoice();
  const utter = new window.SpeechSynthesisUtterance(text);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = speechLocale();
  }
  utter.rate = 0.95; // slightly slow: this is being heard, not listened to
  window.speechSynthesis.speak(utter);
  return true;
}

function setStatus(text, level = 'info') {
  const node = qs('#voiceStatus');
  if (!node) return;
  node.textContent = text;
  node.dataset.level = level;
}

/**
 * The answer, rendered and spoken.
 *
 * "Understood" is shown whenever the server changed what it heard. Without it
 * a misrecognised word produces confident, wrong advice with no way for the
 * farmer to notice it before acting.
 */
function renderAnswer(data, { speakIt = true } = {}) {
  const card = qs('#voiceAnswer');
  if (!card) return;
  if (!data) {
    setState(card, State.EMPTY);
    replaceChildren(card, el('p', { className: 'muted', text: t('voiceIdle') }));
    return;
  }

  const parts = [
    data.understood && (data.wasBanglish || data.usedContext)
      ? el('p', { className: 'voice-understood' }, [
        el('span', { className: 'muted', text: `${t('voiceUnderstood')}: ` }),
        el('b', { text: data.understood }),
      ])
      : null,
    el('p', { className: 'voice-reply', text: data.reply }),
  ].filter(Boolean);

  replaceChildren(card, ...parts);
  setState(card, State.READY);

  if (speakIt && !speak(data.reply)) setStatus(t('voiceNoSpeechOut'), 'warn');
}

async function askServer(transcript) {
  // `api.post` takes the body as its second argument, not as `{ body }` -- that
  // wrapper shape is for `put`/`delete`. Getting this wrong sends `{}` and the
  // route answers 400 with no hint about the missing field.
  const { data } = await api.post('/api/v1/voice/ask', {
    transcript,
    lang: getLang(),
    context: turns.slice(-4),
  });
  // Only real turns are kept, so the context stays honest.
  turns = [...turns, { role: 'user', text: transcript }, { role: 'assistant', text: data.reply }].slice(-6);
  return data;
}

async function submit(transcript) {
  const card = qs('#voiceAnswer');
  if (card) setState(card, State.LOADING);
  try {
    renderAnswer(await askServer(transcript));
    setStatus('');
  } catch (error) {
    if (card) setState(card, State.ERROR);
    if (card) replaceChildren(card, el('p', { className: 'muted', text: t('voiceUnavailable') }));
    setStatus(t('voiceUnavailable'), 'error');
    reportClientError('voice_ask', error);
  }
}

function startListening() {
  if (!HAS_SR) return;
  recognition = new SR();
  recognition.lang = speechLocale();
  // Interim results matter for Bangla: the recogniser revises its guess several
  // times, and showing only the final answer loses that feedback.
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  const finalBits = [];
  let interim = '';

  recognition.onresult = (event) => {
    interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalBits.push(chunk);
      else interim += chunk;
    }
    const shown = `${finalBits.join(' ').trim()} ${interim}`.trim();
    const out = qs('#voiceTranscript');
    if (out) out.textContent = shown || t('voiceListening');
  };

  recognition.onerror = (event) => {
    listening = false;
    // "no-speech" is not an error worth alarming anyone about: it just means
    // nothing was said inside the window.
    if (event.error === 'no-speech') setStatus(t('voiceNoSpeech'), 'warn');
    else if (event.error === 'not-allowed') setStatus(t('voiceMicDenied'), 'error');
    else setStatus(`${t('voiceError')}${event.error ? ` (${event.error})` : ''}`, 'error');
    qs('#voiceStart')?.setAttribute('aria-pressed', 'false');
  };

  recognition.onend = () => {
    listening = false;
    qs('#voiceStart')?.setAttribute('aria-pressed', 'false');
    const transcript = finalBits.join(' ').trim();
    if (!transcript) {
      setStatus(t('voiceNoSpeech'), 'warn');
      return;
    }
    const input = qs('#voiceInput');
    if (input) input.value = transcript;
    setStatus(t('voiceThinking'));
    void submit(transcript);
  };

  try {
    recognition.start();
    listening = true;
    qs('#voiceStart')?.setAttribute('aria-pressed', 'true');
    setStatus(t('voiceListening'));
  } catch {
    // start() throws if called while already listening, which happens when the
    // button is double-tapped on a slow phone.
    setStatus(t('voiceError'), 'warn');
  }
}
export function initVoice() {
  const panel = qs('#voicePanelBody');
  if (!panel) return;

  const startBtn = qs('#voiceStart');
  const input = qs('#voiceInput');
  const form = qs('#voiceForm');

  // Honest capability report. Firefox and Safari have no SpeechRecognition at
  // all, so a microphone button there would do nothing; it is disabled and the
  // reason is stated. The typing form below stays fully usable regardless.
  if (!HAS_SR) {
    const unsupported = qs('#voiceUnsupported');
    if (unsupported) unsupported.hidden = false;
    if (startBtn) startBtn.disabled = true;
    setStatus(t('voiceNotSupported'), 'warn');
  }

  startBtn?.addEventListener('click', () => {
    if (listening) recognition?.stop();
    else startListening();
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = (input?.value ?? '').trim();
    if (!value) return;
    void submit(value);
    if (input) input.value = '';
  });

  // Repeat is a real requirement, not a nicety: a farmer who did not catch the
  // first reading has no way to recover the text otherwise.
  qs('#voiceRepeat')?.addEventListener('click', () => {
    const answer = qs('#voiceAnswer .voice-reply')?.textContent ?? '';
    if (answer) speak(answer);
  });

  qs('#voiceClear')?.addEventListener('click', () => {
    turns = [];
    renderAnswer(null, { speakIt: false });
    setStatus('');
  });

  document.addEventListener('sf:langchange', () => {
    // The recogniser is bound to one locale at start(); a language switch has to
    // stop it or it keeps listening in the previous language.
    if (listening) recognition?.stop();
    setStatus('');
  });
}