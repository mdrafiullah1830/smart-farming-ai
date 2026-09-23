/**
 * Bangla / English localization.
 * Translation catalogs are page-agnostic shared keys + optional page keys.
 */

import { storageGet, storageSet } from './storage.js';
import { localizeNumeral } from './format.js';

export const LANGS = ['bn', 'en'];

export const STRINGS = {
  bn: {
    appTitle: 'স্মার্ট ফার্মিং AI',
    brandTag: 'বাংলাদেশ',
    navHome: 'হোম',
    navDashboard: 'ড্যাশবোর্ড',
    navMarket: 'বাজার',
    navSoil: 'মাটি',
    navAI: 'AI সহকারী',
    openDashboard: 'ড্যাশবোর্ড খুলুন',
    getStarted: 'শুরু করুন',
    explore: 'প্ল্যাটফর্ম দেখুন',
    search: 'খুঁজুন',
    searchPlaceholder: 'মাঠ, ফসল, দাম, আবহাওয়া…',
    searchOpen: 'গ্লোবাল সার্চ',
    langToggle: 'English',
    solutions: 'সমাধান',
    insights: 'ইনসাইট',
    resources: 'রিসোর্স',
    calendar: 'মৌসুমি ক্যালেন্ডার',
    calendarDesc: 'বাংলাদেশের প্রধান ফসলের কার্যক্রম',
    weatherAlert: 'আবহাওয়া সতর্কতা',
    govtSupport: 'সরকারি সহায়তা',
    cropIntel: 'ফসল ইন্টেলিজেন্স',
    trustedData: 'নির্ভরযোগ্য ডেটা',
    liveUpdates: 'লাইভ কৃষি আপডেট',
    loading: 'লোড হচ্ছে…',
    loadFailed: 'তথ্য আনা যায়নি',
    retry: 'আবার চেষ্টা',
    offline: 'অফলাইন',
    empty: 'কোনো ডেটা নেই',
    signIn: 'সাইন ইন',
    signOut: 'সাইন আউট',
    fields: 'মাঠ',
    tasks: 'আজকের অগ্রাধিকার',
    markComplete: 'নির্বাচিত কাজ সম্পন্ন',
    notifications: 'বিজ্ঞপ্তি',
    irrigation: 'সেচ',
    irrigationNoDevice: 'কোনো সেচ ডিভাইস যুক্ত নেই',
    irrigationUnavailable: 'ডিভাইস সংযোগ নেই — নিয়ন্ত্রণ অনুপলব্ধ',
    irrigationManage: 'সেচ ব্যবস্থাপনা',
    sensors: 'সেন্সর',
    noSensors: 'কোনো সেন্সর নেই',
    weather: 'আবহাওয়া',
    marketPrices: 'বাজার দর',
    viewAll: 'সব দেখুন',
    forecast: '৭ দিনের পূরাভাস',
    watchlist: 'ওয়াচলিস্ট',
    createAlert: 'অ্যালার্ট তৈরি',
    exportReport: 'রিপোর্ট এক্সপোর্ট',
    commodities: 'পণ্য',
    priceTrend: 'দামের প্রবণতা',
    compare: 'তুলনা',
    directions: 'দিকনির্দেশনা',
    soilHealth: 'মাটির স্বাস্থ্য',
    downloadReport: 'রিপোর্ট ডাউনলোড',
    setReminder: 'রিমাইন্ডার সেট',
    compareFields: 'মাঠ তুলনা',
    fertilizerPlan: 'সার পরিকল্পনা',
    recommendedCrops: 'প্রস্তাবিত ফসল',
    askAI: 'AI-এ প্রশ্ন করুন',
    newQuestion: 'নতুন প্রশ্ন',
    getAnswer: 'উত্তর নিন',
    listen: 'শুনুন',
    save: 'সেভ',
    share: 'শেয়ার',
    sources: 'উৎস',
    related: 'সম্পর্কিত প্রশ্ন',
    modelUnavailable: 'মডেল এখন অনুপলব্ধ',
    uploadPhoto: 'ছবি আপলোড',
    authRequired: 'এই কাজের জন্য সাইন ইন দরকার',
    unauthorized: 'সাইন ইন করুন',
    rateLimited: 'অনুরোধ সীমা — কিছুক্ষণ পরে চেষ্টা করুন',
    stale: 'পুরনো ডেটা',
    savedOk: 'সেভ হয়েছে',
    copied: 'কপি হয়েছে',
    footerNote: 'তথ্য যাচাই করে ব্যবহার করুন',
    district: 'জেলা',
    division: 'বিভাগ',
    upazila: 'উপজেলা',
    lastTested: 'সর্বশেষ পরীক্ষা',
    noFields: 'কোনো মাঠ নেই — প্রথমে মাঠ তৈরি করুন',
    partialData: 'আংশিক ডেটা',
    partialHint: 'কিছু উৎস আনা যায়নি',
    // page: home
    heroEyebrow: 'স্বাস্থ্যবান মাটি · সমৃদ্ধ ফসল · সবুজ বাংলাদেশ',
    heroTitle: 'প্রতিটি মাঠের জন্য স্মার্ট সিদ্ধান্ত',
    heroLead: 'বাংলাদেশের কৃষকদের জন্য আবহাওয়া, মাটি, বাজার ও AI নির্দেশনা—আত্মবিশ্বাসের সঙ্গে কাজ করুন।',
    supportRow1: 'কৃষি ইনসেন্টিভ প্রোগ্রাম',
    supportRow1s: 'বীজ, সার ও যন্ত্রপাতির সাবসিডি',
    supportRow2: 'সুজোনে কৃষি ঋণ',
    supportRow2s: 'ক্ষুদ্র ও প্রান্তিক কৃষকদের জন্য',
    supportRow3: 'ফসল বীমা প্রকল্প',
    supportRow3s: 'প্রাকৃতিক বিপর্যয়ে আর্থিক সহায়তা',
    cropRiceAdvice: 'বৃষ্টির আগে মাঠের জল নিকাস পরিষ্কার রাখুন।',
    goodCondition: 'ভালো অবস্থা',
    trustedBmd: 'BMD', trustedSrdd: 'SRDI', trustedDam: 'DAM', trustedSat: 'স্যাটেলাইট',
    // page: dashboard
    dashTitle: 'শুভ সকাল',
    dashLead: 'আজ আপনার খামারে যা কিছু চলছে তা এখানে।',
    farmHealth: 'খামারের স্বাস্থ্য',
    soilMoisture: 'মাটির আর্দ্রতা',
    diseaseRisk: 'রোগের ঝুঁকি',
    sensorStatus: 'সেন্সর অবস্থা',
    yourFields: 'আপনার মাঠ',
    recentActivity: 'সাম্প্রতিক কার্যক্রম',
    weatherAlertTitle: 'আগামীকাল ভারী বৃষ্টি প্রত্যাশিত',
    weatherAlertBody: 'ময়মনসিংহে ৬০–৯০ মিমি বৃষ্টি হতে পারে। আজ মাঠের কাজ শেষ করুন ও নিকাস নিশ্চিত করুন。',
    viewDetails: 'বিস্তারিত',
    humidity: 'আর্দ্রতা', wind: 'বাতাস',
    optimal: 'উপযুক্ত', idealRange: 'আদর্শ সীমা: ৬০–৮০%',
    liveIrrigation: 'লাইভ সেচ', runningPlan: 'নির্ধারিত পরিকল্পনা চলছে',
    nextCycle: 'পরবর্তী চক্র', lowRisk: 'কম ঝুঁকি', noThreats: 'তাৎক্ষণিক হুমকি নেই',
    online: 'অনলাইন', soilSensors: 'মাটি সেন্সর', weatherStation: 'আবহাওয়া স্টেশন',
    waterLevel: 'পানির লেভেল', fieldCameras: 'মাঠ ক্যামেরা', phSensors: 'pH সেন্সর',
    // page: market
    marketTitle: 'বাজার ইন্টেলিজেন্স',
    marketLead: 'লাইভ দাম ও স্মার্ট বিক্রয় সিদ্ধান্ত',
    liveMarketPrices: 'লাইভ বাজার দর',
    currentPrice: 'বর্তমান দাম', weeklyHigh: 'সাপ্তাহিক সর্বোচ্চ', weeklyLow: 'সাপ্তাহিক সর্বনিম্ন',
    aiRecommendation: 'AI সুপারিশ',
    nearestMarket: 'নিকটতম বাজার',
    districtCompare: 'জেলাভিত্তিক তুলনা',
    marketInsights: 'বাজার ইনসাইট',
    watchlistEmpty: 'ওয়াচলিস্ট খালি — কমোডিটি যোগ করুন',
    // page: soil
    soilTitle: 'মাটি ইন্টেলিজেন্স',
    soilLead: 'জমি বুঝুন। সঠিক পরিমাণ প্রয়োগ করুন।',
    selectDistrict: 'জেলা বাছাই', selectUpazila: 'উপজেলা বাছাই',
    viewReport: 'রিপোর্ট দেখুন', fieldMap: 'মাঠ ম্যাপ ও নমুনা পয়েন্ট',
    nextSoilTest: 'পরবর্তী মাটি পরীক্ষা',
    // page: ai
    aiTitle: 'AI কৃষি সহকারী',
    aiLead: 'প্রশ্ন করুন, ছবি আপলোড করুন বা বলুন—বিশ্বস্ত উত্তর পান।',
    weatherContext: 'আবহাওয়া প্রসঙ্গ',
    askMode: 'প্রশ্ন', photoMode: 'ছবি', voiceMode: 'ভয়েস',
    askPlaceholder: 'আপনার প্রশ্ন লিখুন…',
    recent: 'সাম্প্রতিক',
    trustedKnowledge: 'বিশ্বস্ত জ্ঞান', healthierHarvests: 'স্বাস্থ্যবান ফসলের জন্য',
    startListening: 'শুনুন', analyzing: 'বিশ্লেষণ হচ্ছে…',
    // footer
    footerRights: '© Smart Farming AI · Bangladesh',
  },
  en: {
    appTitle: 'Smart Farming AI',
    brandTag: 'Bangladesh',
    navHome: 'Home',
    navDashboard: 'Dashboard',
    navMarket: 'Market',
    navSoil: 'Soil',
    navAI: 'AI Assistant',
    openDashboard: 'Open Dashboard',
    getStarted: 'Get Started',
    explore: 'Explore Platform',
    search: 'Search',
    searchPlaceholder: 'Search fields, crops, prices, weather…',
    searchOpen: 'Global search',
    langToggle: 'বাংলা',
    solutions: 'Solutions',
    insights: 'Insights',
    resources: 'Resources',
    calendar: 'Seasonal Calendar',
    calendarDesc: 'Key activities for major crops in Bangladesh',
    weatherAlert: 'Weather Alert',
    govtSupport: 'Government Support',
    cropIntel: 'Crop Intelligence',
    trustedData: 'Trusted Data',
    liveUpdates: 'Live Agriculture Updates',
    loading: 'Loading…',
    loadFailed: 'Could not load data',
    retry: 'Retry',
    offline: 'Offline',
    empty: 'No data yet',
    signIn: 'Sign in',
    signOut: 'Sign out',
    fields: 'Fields',
    tasks: "Today's priorities",
    markComplete: 'Mark selected complete',
    notifications: 'Notifications',
    irrigation: 'Irrigation',
    irrigationNoDevice: 'No irrigation device connected',
    irrigationUnavailable: 'No device link — control unavailable',
    irrigationManage: 'Manage irrigation',
    sensors: 'Sensors',
    noSensors: 'No sensors',
    weather: 'Weather',
    marketPrices: 'Market prices',
    viewAll: 'View all',
    createAlert: 'Create Alert',
    watchlist: 'Watchlist',
    exportReport: 'Export Report',
    commodities: 'Commodities',
    priceTrend: 'Price Trend',
    compare: 'Compare',
    directions: 'Get Directions',
    soilHealth: 'Soil Health',
    downloadReport: 'Download Report',
    setReminder: 'Set Reminder',
    compareFields: 'Compare Fields',
    fertilizerPlan: 'Fertilizer Plan',
    recommendedCrops: 'Recommended Crops',
    askAI: 'Ask AI',
    newQuestion: 'New Question',
    getAnswer: 'Get Answer',
    listen: 'Listen',
    save: 'Save',
    share: 'Share',
    sources: 'Sources',
    related: 'Related Questions',
    modelUnavailable: 'Model currently unavailable',
    uploadPhoto: 'Upload Photo',
    authRequired: 'Sign in required for this action',
    unauthorized: 'Sign in required',
    rateLimited: 'Rate limited — try shortly',
    stale: 'Stale data',
    savedOk: 'Saved',
    copied: 'Copied',
    footerNote: 'Verify information before use',
    district: 'District',
    division: 'Division',
    upazila: 'Upazila',
    lastTested: 'Last tested',
    noFields: 'No fields yet — add a field first',
    partialData: 'Partial data',
    partialHint: 'Some sources could not be loaded',
    // page: home
    heroEyebrow: 'Healthy soil · Thriving crops · A greener Bangladesh',
    heroTitle: 'Smarter decisions for every field',
    heroLead: 'Weather, soil, market and AI guidance for Bangladesh—designed to help every farmer act with confidence.',
    supportRow1: 'Krishi Incentive Program',
    supportRow1s: 'Subsidy for seeds, fertilizer and equipment',
    supportRow2: 'Low-Interest Agricultural Loan',
    supportRow2s: 'For small and marginal farmers',
    supportRow3: 'Crop Insurance Scheme',
    supportRow3s: 'Financial support against natural disasters',
    cropRiceAdvice: 'Keep field drainage clear before expected rainfall.',
    goodCondition: 'Good condition',
    trustedBmd: 'BMD', trustedSrdd: 'SRDI', trustedDam: 'DAM', trustedSat: 'Satellite',
    // page: dashboard
    dashTitle: 'Good morning',
    dashLead: 'Here is what is happening on your farm today.',
    farmHealth: 'Farm Health',
    soilMoisture: 'Soil Moisture',
    diseaseRisk: 'Disease Risk',
    sensorStatus: 'Sensor Status',
    yourFields: 'Your Fields',
    recentActivity: 'Recent Activity',
    forecast: '7-Day Weather Forecast',
    weatherAlertTitle: 'Heavy rain expected tomorrow',
    weatherAlertBody: 'Up to 60–90 mm in Mymensingh. Complete field activities today and ensure proper drainage.',
    viewDetails: 'View details',
    humidity: 'Humidity', wind: 'Wind',
    optimal: 'Optimal', idealRange: 'Ideal range: 60–80%',
    liveIrrigation: 'Live irrigation', runningPlan: 'Running scheduled plan',
    nextCycle: 'Next cycle', lowRisk: 'Low risk', noThreats: 'No immediate threats',
    online: 'Online', soilSensors: 'Soil Sensors', weatherStation: 'Weather Station',
    waterLevel: 'Water Level', fieldCameras: 'Field Cameras', phSensors: 'pH Sensors',
    // page: market
    marketTitle: 'Market Intelligence',
    marketLead: 'Live prices and smarter selling decisions',
    liveMarketPrices: 'Live Market Prices',
    currentPrice: 'Current Price', weeklyHigh: 'Weekly High', weeklyLow: 'Weekly Low',
    aiRecommendation: 'AI Recommendation',
    nearestMarket: 'Nearest Market',
    districtCompare: 'District Price Comparison',
    marketInsights: 'Market Insights',
    watchlistEmpty: 'Watchlist empty — add a commodity',
    // page: soil
    soilTitle: 'Soil Intelligence',
    soilLead: 'Understand your land. Apply the right dose.',
    selectDistrict: 'Select district', selectUpazila: 'Select upazila',
    viewReport: 'View Report', fieldMap: 'Field Map & Sample Points',
    nextSoilTest: 'Next Soil Test',
    // page: ai
    aiTitle: 'AI Farming Assistant',
    aiLead: 'Ask, upload or speak—get trusted answers.',
    weatherContext: 'Weather Context',
    askMode: 'Ask', photoMode: 'Photo', voiceMode: 'Voice',
    askPlaceholder: 'Type your question…',
    recent: 'Recent',
    trustedKnowledge: 'Trusted knowledge', healthierHarvests: 'for healthier harvests',
    startListening: 'Start listening', analyzing: 'Analyzing…',
    // footer
    footerRights: '© Smart Farming AI · Bangladesh',
  },
};

export function getLang() {
  const saved = storageGet('lang', null);
  if (saved === 'bn' || saved === 'en') return saved;
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('bn')) return 'bn';
  return 'bn';
}

export function setLang(lang) {
  const next = lang === 'en' ? 'en' : 'bn';
  storageSet('lang', next);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
  }
  return next;
}

export function t(key, lang = getLang()) {
  const table = STRINGS[lang] || STRINGS.bn;
  const fallback = STRINGS.en[key];
  return table[key] ?? fallback ?? key;
}

export function applyI18n(root = typeof document !== 'undefined' ? document : null, lang = getLang()) {
  if (!root) return lang;
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (key) node.textContent = t(key, lang);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (key) node.setAttribute('placeholder', t(key, lang));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria');
    if (key) node.setAttribute('aria-label', t(key, lang));
  });
  // Toggle active classes on lang buttons
  root.querySelectorAll('[data-lang]').forEach((btn) => {
    const active = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  return lang;
}

export function bindLangToggle(root = document) {
  root.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = setLang(btn.getAttribute('data-lang'));
      applyI18n(root, lang);
      document.dispatchEvent(new CustomEvent('sf:langchange', { detail: { lang } }));
    });
  });
}

export function formatWithLang(value, formatter, lang = getLang()) {
  return formatter(value, { lang, locale: lang === 'bn' ? 'bn-BD' : 'en-GB' });
}

export { localizeNumeral };
