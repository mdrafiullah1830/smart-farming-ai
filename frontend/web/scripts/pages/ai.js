/** AI assistant: conversations, citations, upload validation, save/share/listen, honest unavailable. */

import { api } from '../api.js';
import { getLang, t, applyI18n } from '../i18n.js';
import { el, clear, qs, qsa, safeExternalHref } from '../dom.js';
import { setState, State } from '../states.js';
import { storageGet, storageSet } from '../storage.js';
import { reportClientError } from '../telemetry.js';
import { bindShell, requireAuth } from '../shell.js';

const CONVOS_KEY = 'ai.conversations';
const SAVED_KEY = 'ai.saved';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getConversations() {
  const list = storageGet(CONVOS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveConversations(list) {
  storageSet(CONVOS_KEY, list.slice(0, 30));
}

function getSaved() {
  const list = storageGet(SAVED_KEY, []);
  return Array.isArray(list) ? list : [];
}

function renderConversationList(activeId) {
  const listEl = qs('#conversationList');
  if (!listEl) return;
  clear(listEl);
  const convos = getConversations();
  if (!convos.length) {
    listEl.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const c of convos) {
    const btn = el(
      'button',
      {
        type: 'button',
        className: `conversation${c.id === activeId ? ' active' : ''}`,
        dataset: { convoId: c.id },
        onClick: () => loadConversation(c.id),
      },
      [
        el('span', { text: '◯', 'aria-hidden': 'true' }),
        el('span', {}, [el('b', { text: c.title }), el('small', { text: c.atLabel || c.at || '' })]),
      ],
    );
    listEl.append(btn);
  }
}

function loadConversation(id) {
  const convo = getConversations().find((c) => c.id === id);
  if (!convo) return;
  const input = qs('#question');
  if (input) input.value = convo.question || '';
  renderAnswer(convo);
  renderConversationList(id);
}

function renderAnswer(convo) {
  const card = qs('#answerCard');
  if (!card) return;
  const lang = getLang();
  const answerBody = qs('#answerBody');
  const tools = qs('#answerTools');
  const confidence = qs('#answerConfidence');
  const sources = qs('#sourcesList');
  const related = qs('#relatedList');

  if (!convo) {
    setState(card, State.EMPTY, { message: lang === 'bn' ? 'প্রশ্ন করে উত্তর দেখুন' : 'Ask a question to see the answer', lang });
    if (answerBody) clear(answerBody);
    if (tools) tools.hidden = true;
    if (sources) clear(sources);
    if (related) clear(related);
    return;
  }

  // Honest model-unavailable path
  if (convo.status === 'model_unavailable') {
    setState(card, State.UNAVAILABLE, {
      message: t('modelUnavailable'),
      lang,
    });
    if (answerBody) {
      clear(answerBody);
      answerBody.append(
        el('p', { text: convo.answer || t('modelUnavailable') }),
        el('p', {
          className: 'muted',
          text: lang === 'bn'
            ? 'একটি বৈধ মডেল এখনো ডিপ্লয় করা হয়নি। নিয়মভিত্তিক সহায়তা নিচে দেওয়া হলো।'
            : 'No production model is deployed yet. Rule-based guidance is shown below.',
        }),
      );
    }
    if (tools) tools.hidden = false;
    renderSources(convo.sources || []);
    renderRelated(convo.related || []);
    if (confidence) confidence.textContent = lang === 'bn' ? 'অনুপলব্ধ' : 'Unavailable';
    return;
  }

  setState(card, State.READY, { lang });
  if (answerBody) {
    clear(answerBody);
    answerBody.append(el('h2', { text: convo.title || (lang === 'bn' ? 'উত্তর' : 'Answer') }));
    answerBody.append(el('p', { text: convo.answer || '' }));
    if (Array.isArray(convo.actions) && convo.actions.length) {
      const actions = el('div', { className: 'action-list' });
      convo.actions.forEach((a, i) => {
        actions.append(
          el('div', { className: 'action' }, [
            el('span', { className: 'action-num', text: String(i + 1) }),
            el('span', {}, [el('b', { text: a.title }), el('br'), el('small', { className: 'muted', text: a.detail || '' })]),
          ]),
        );
      });
      answerBody.append(el('h3', { text: lang === 'bn' ? 'পরবর্তী ধাপ' : 'Action plan' }), actions);
    }
  }
  if (tools) tools.hidden = false;
  if (confidence) {
    confidence.textContent = convo.confidence != null
      ? `${lang === 'bn' ? 'আত্মবিশ্বাস' : 'Confidence'} ${Math.round(convo.confidence * 100)}%`
      : '';
  }
  renderSources(convo.sources || []);
  renderRelated(convo.related || []);
}

function renderSources(sources) {
  const list = qs('#sourcesList');
  if (!list) return;
  clear(list);
  if (!sources.length) {
    list.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const s of sources) {
    const href = safeExternalHref(s.url);
    const logo = (s.source || s.title || '?').slice(0, 4).toUpperCase();
    list.append(
      el('div', { className: 'source-card' }, [
        el('span', { className: 'source-logo', text: logo }),
        el('span', {}, [
          el('b', { text: s.title || s.source || '—' }),
          el('small', { text: s.snippet || s.source || '' }),
          href
            ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: `${s.source || 'link'} ↗` })
            : el('small', { className: 'muted', text: '—' }),
        ]),
      ]),
    );
  }
}

function renderRelated(related) {
  const list = qs('#relatedList');
  if (!list) return;
  clear(list);
  if (!related.length) {
    list.append(el('p', { className: 'muted', text: t('empty') }));
    return;
  }
  for (const q of related) {
    list.append(
      el('button', {
        type: 'button',
        text: `${q} →`,
        onClick: () => {
          const input = qs('#question');
          if (input) input.value = q;
          void submitQuestion(q);
        },
      }),
    );
  }
}

async function askWorker(query) {
  const { data } = await api.get(`/api/v1/ai-search?q=${encodeURIComponent(query)}`, { timeoutMs: 12000 });
  return data;
}

async function askAIHealth() {
  try {
    const { data } = await api.get('/api/v1/integrations/ai/health', { timeoutMs: 6000 });
    return data;
  } catch {
    return null;
  }
}

async function submitQuestion(forcedQuery) {
  const input = qs('#question');
  const card = qs('#answerCard');
  const lang = getLang();
  const query = (forcedQuery ?? input?.value ?? '').trim();
  if (!query) {
    if (card) setState(card, State.EMPTY, { message: lang === 'bn' ? 'প্রশ্ন লিখুন' : 'Enter a question', lang });
    return;
  }

  if (card) setState(card, State.LOADING, { lang });

  // Probe model availability honestly
  const health = await askAIHealth();
  const models = health?.models || {};
  const advisoryOk = models.advisory === 'ok' || health?.status === 'ok';

  try {
    const data = await askWorker(query);
    const answer = data.answer || '';
    const sources = (data.sources || []).map((s) => ({
      title: s.title,
      url: s.url,
      source: s.source,
      snippet: s.snippet,
    }));
    const related = (data.relatedTopics || []).map((x) => (typeof x === 'string' ? x : x.title || x.topic)).filter(Boolean);

    const convo = {
      id: crypto.randomUUID(),
      title: query.slice(0, 80),
      question: query,
      answer,
      sources,
      related,
      status: advisoryOk ? 'ok' : 'rule_based',
      confidence: data.confidence ?? null,
      at: new Date().toISOString(),
      atLabel: lang === 'bn' ? 'এইমাত্র' : 'Just now',
      actions: [
        {
          title: lang === 'bn' ? 'উত্তর যাচাই করুন' : 'Verify the answer',
          detail: lang === 'bn' ? 'সরকারি কৃষি তথ্যের সঙ্গে মিলিয়ে দেখুন' : 'Cross-check with official agriculture sources',
        },
        {
          title: lang === 'bn' ? 'স্থানীয় পরামর্শ' : 'Local advice',
          detail: lang === 'bn' ? 'প্রয়োজনে কৃষি সম্প্রসারণ কর্মকর্তার সঙ্গে কথা বলুন' : 'Consult your local agriculture officer',
        },
      ],
    };

    // If AI service reports all ML models down, surface honest unavailable badge
    if (health && Object.values(models).every((v) => v === 'unavailable')) {
      convo.status = 'model_unavailable';
    }

    const convos = getConversations();
    convos.unshift(convo);
    saveConversations(convos);
    renderAnswer(convo);
    renderConversationList(convo.id);
    bindAnswerTools(convo);
  } catch (err) {
    reportClientError(err, { component: 'ai-ask' });
    const fallback = {
      id: crypto.randomUUID(),
      title: query.slice(0, 80),
      question: query,
      answer: err.message || t('loadFailed'),
      sources: [],
      related: [],
      status: err.code === 'timeout' || err.status >= 500 ? 'model_unavailable' : 'error',
      confidence: null,
      at: new Date().toISOString(),
      atLabel: lang === 'bn' ? 'এইমাত্র' : 'Just now',
    };
    renderAnswer(fallback);
    if (card) {
      setState(card, err.status === 429 ? State.RATE_LIMITED : State.ERROR, {
        message: err.message || t('loadFailed'),
        lang,
        retry: () => submitQuestion(query),
      });
    }
    bindAnswerTools(fallback);
  }
}

function bindAnswerTools(convo) {
  const tools = qs('#answerTools');
  if (!tools) return;
  clear(tools);
  const lang = getLang();

  const listenBtn = el('button', {
    type: 'button',
    text: `🔊 ${t('listen')}`,
    onClick: () => {
      if (typeof speechSynthesis === 'undefined') {
        listenBtn.textContent = lang === 'bn' ? 'শব্দ সাপোর্ট নেই' : 'Speech unsupported';
        listenBtn.disabled = true;
        return;
      }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(convo.answer || convo.title || '');
      u.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
      speechSynthesis.speak(u);
    },
  });

  const saveBtn = el('button', {
    type: 'button',
    text: `🔖 ${t('save')}`,
    onClick: () => {
      if (!requireAuth(t('save'))) return;
      const saved = getSaved();
      if (!saved.find((s) => s.id === convo.id)) {
        saved.unshift(convo);
        storageSet(SAVED_KEY, saved.slice(0, 50));
      }
      saveBtn.textContent = `✓ ${t('savedOk')}`;
    },
  });

  const shareBtn = el('button', {
    type: 'button',
    text: `↗ ${t('share')}`,
    onClick: async () => {
      const textShare = `${convo.title}\n\n${convo.answer || ''}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: convo.title, text: textShare, url: location.href });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(textShare);
          shareBtn.textContent = `✓ ${t('copied')}`;
        } else {
          shareBtn.textContent = lang === 'bn' ? 'শেয়ার নেই' : 'Share unavailable';
        }
      } catch {
        shareBtn.textContent = lang === 'bn' ? 'বাতিল' : 'Cancelled';
      }
    },
  });

  tools.append(listenBtn, saveBtn, shareBtn);
}

function validateImageFile(file) {
  const lang = getLang();
  if (!file) return { ok: false, message: lang === 'bn' ? 'ফাইল নেই' : 'No file' };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, message: lang === 'bn' ? 'শুধু JPEG/PNG/WebP' : 'JPEG/PNG/WebP only' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: lang === 'bn' ? 'সর্বোচ্চ ৫ MB' : 'Max 5 MB' };
  }
  return { ok: true };
}

function bindUpload() {
  const input = qs('#photoInput');
  const error = qs('#photoError');
  const preview = qs('#photoPreview');
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    const result = validateImageFile(file);
    if (error) {
      error.hidden = result.ok;
      error.textContent = result.ok ? '' : result.message;
    }
    if (preview) {
      clear(preview);
      if (result.ok && file) {
        const img = el('img', { alt: file.name, src: URL.createObjectURL(file) });
        preview.append(img);
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    }
  });
  qs('#photoSubmit')?.addEventListener('click', async () => {
    const file = input.files?.[0];
    const result = validateImageFile(file);
    const lang = getLang();
    if (error) {
      error.hidden = result.ok;
      error.textContent = result.ok ? '' : result.message;
    }
    if (!result.ok) return;
    if (!requireAuth(t('uploadPhoto'))) return;

    const status = qs('#photoStatus');
    if (status) {
      status.hidden = false;
      status.textContent = lang === 'bn' ? 'বিশ্লেষণ হচ্ছে…' : 'Analyzing…';
    }
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/v1/disease/analyze', {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error(body?.error || 'Upload failed'), { status: res.status });
      if (status) {
        if (body?.status === 'model_unavailable' || body?.error) {
          status.textContent = `${t('modelUnavailable')}${body?.message ? ` — ${body.message}` : ''}`;
          status.dataset.state = 'unavailable';
        } else {
          status.textContent = lang === 'bn' ? 'সম্পন্ন' : 'Done';
          status.dataset.state = 'ready';
        }
      }
    } catch (err) {
      reportClientError(err, { component: 'ai-upload' });
      if (status) {
        status.textContent = err.message || t('loadFailed');
        status.dataset.state = 'error';
      }
    }
  });
}

function bindModes() {
  qsa('.composer-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('.composer-tabs button').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const mode = btn.getAttribute('data-mode');
      const askPanel = qs('#askPanel');
      const photoPanel = qs('#photoPanel');
      const voicePanel = qs('#voicePanel');
      if (askPanel) askPanel.hidden = mode !== 'ask';
      if (photoPanel) photoPanel.hidden = mode !== 'photo';
      if (voicePanel) voicePanel.hidden = mode !== 'voice';
    });
  });
}

function bindAsk() {
  qs('#askButton')?.addEventListener('click', () => void submitQuestion());
  qs('#question')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      void submitQuestion();
    }
  });
  qs('#newQuestionBtn')?.addEventListener('click', () => {
    const input = qs('#question');
    if (input) input.value = '';
    renderAnswer(null);
    renderConversationList(null);
    input?.focus();
  });
}

function bindVoice() {
  const btn = qs('#voiceStart');
  const out = qs('#voiceTranscript');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (out) out.textContent = getLang() === 'bn' ? 'ভয়েস ইনপুট সমর্থিত নয়' : 'Voice input not supported in this browser';
      btn.disabled = true;
      return;
    }
    const rec = new SR();
    rec.lang = getLang() === 'bn' ? 'bn-BD' : 'en-US';
    rec.interimResults = false;
    if (out) out.textContent = getLang() === 'bn' ? 'শুনছি…' : 'Listening…';
    rec.onresult = (ev) => {
      const textResult = ev.results[0][0].transcript;
      if (out) out.textContent = textResult;
      const input = qs('#question');
      if (input) input.value = textResult;
    };
    rec.onerror = () => {
      if (out) out.textContent = getLang() === 'bn' ? 'ভয়েস ত্রুটি' : 'Voice error';
    };
    rec.start();
  });
}

export function initAI() {
  bindShell();
  bindModes();
  bindAsk();
  bindUpload();
  bindVoice();
  qsa('a[href="#"]').forEach((a) => a.setAttribute('href', 'index.html'));

  renderConversationList(null);
  renderAnswer(getConversations()[0] || null);
  if (getConversations()[0]) bindAnswerTools(getConversations()[0]);

  const params = new URLSearchParams(location.search);
  if (params.get('q')) {
    const input = qs('#question');
    if (input) input.value = params.get('q');
    void submitQuestion(params.get('q'));
  }

  document.addEventListener('sf:langchange', () => {
    applyI18n();
    renderConversationList(null);
    const active = getConversations()[0];
    if (active) renderAnswer(active);
  });
}

if (typeof document !== 'undefined' && !globalThis.__SF_AI_INIT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalThis.__SF_AI_INIT__ = true;
      initAI();
    });
  } else {
    globalThis.__SF_AI_INIT__ = true;
    initAI();
  }
}
