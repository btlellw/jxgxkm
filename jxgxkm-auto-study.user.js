// ==UserScript==
// @name         JXGXKM Auto Study Helper
// @namespace    https://jxgxkm.wsglw.net/
// @version      1.7.0
// @description  Auto play courseware, assist quiz answering, and notify WeCom when QR face verification is required. Integrated with muted autoplay and pause protection.
// @author       Codex
// @match        https://*/train/courseware/cc*
// @match        http://*/train/courseware/cc*
// @match        *://jxgxkm.wsglw.net/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      qyapi.weixin.qq.com
// @connect      *
// @run-at       document-start
// @inject-into  content
// ==/UserScript==

(function () {
  'use strict';

  console.log('[JXGXKM] userscript boot', location.href);

  var isPlaying = false;
  var videoElement = null;
  var pauseProtectionEnabled = false;
  var pageGlobal = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  function protectVideoFromPause() {
    var mediaProto = pageGlobal.HTMLMediaElement && pageGlobal.HTMLMediaElement.prototype || HTMLMediaElement.prototype;
    if (mediaProto.__jxgxkmPauseProtected) return;
    var originalPause = mediaProto.pause;

    mediaProto.pause = function() {
      if (pauseProtectionEnabled) {
        console.log('%c[V3.1] 🛡️ 永久阻止pause()！保持播放', 'color: #ff6600; font-weight: bold;');
        return; // 完全阻止暂停
      }
      console.log('[V3.1] pause()已被允许（保护未启用）');
      return originalPause.apply(this, arguments);
    };
    mediaProto.__jxgxkmPauseProtected = true;
    console.log('[V3.1] ✓ pause永久保护已就绪');
  }

  function hijackPlayerConfig() {
    var originalPolyvPlayer = pageGlobal.polyvPlayer;
    var playerConfigured = false;

    Object.defineProperty(pageGlobal, 'polyvPlayer', {
      set: function(value) {
        originalPolyvPlayer = value;
      },
      get: function() {
        if (playerConfigured) {
          return originalPolyvPlayer;
        }

        return function(config) {
          console.log('[V3.1] 劫持播放器配置');
          playerConfigured = true;

          // 强制静音自动播放
          config.autoplay = true;
          config.volume = 0;

          console.log('[V3.1] 配置: autoplay=true, volume=0（静音）');

          var player = originalPolyvPlayer(config);
          pageGlobal.player = player;

          // 延迟启动
          setTimeout(function() {
            startMutedAutoplay();
          }, 800);

          return player;
        };
      },
      configurable: true
    });
  }

  function disableBuggyCode() {
    var originalOnPlayerInitOver = null;
    Object.defineProperty(pageGlobal, 's2j_onPlayerInitOver', {
      set: function(fn) {
        originalOnPlayerInitOver = fn;
      },
      get: function() {
        return function(params) {
          console.log('[V3.1] 处理s2j_onPlayerInitOver');
          if (typeof originalOnPlayerInitOver === 'function') {
            try {
              originalOnPlayerInitOver.apply(this, arguments);
            } catch (e) {
              console.warn('[V3.1] 执行原 s2j_onPlayerInitOver 出错:', e);
            }
          }
        };
      },
      configurable: true
    });

    var originalOnPlayStart = null;
    Object.defineProperty(pageGlobal, 's2j_onPlayStart', {
      set: function(fn) {
        originalOnPlayStart = fn;
      },
      get: function() {
        return function() {
          console.log('[V3.1] 延迟处理s2j_onPlayStart');
          if (typeof originalOnPlayStart === 'function') {
            try {
              originalOnPlayStart.apply(this, arguments);
            } catch (e) {
              console.warn('[V3.1] 执行原 s2j_onPlayStart 出错:', e);
            }
          }

          if (pageGlobal.watch_start_time > 0 && pageGlobal.player) {
            setTimeout(function() {
              console.log('[V3.1] 延迟seek到:', pageGlobal.watch_start_time);
              try {
                pageGlobal.player.j2s_seekVideo(pageGlobal.watch_start_time);
              } catch (e) {}
            }, 2000);
          }
        };
      },
      configurable: true
    });
  }

  // 立即在顶层执行劫持
  if (/\/train\/courseware\/cc/i.test(location.pathname)) {
    protectVideoFromPause();
    hijackPlayerConfig();
    disableBuggyCode();
  }

  if (GM_getValue('playbackStrategyVersion', '') !== '1.7.0') {
    GM_setValue('hidePluginMarkers', false);
    GM_setValue('blockPluginDestroy', true);
    GM_setValue('bypassQos', false);
    GM_setValue('patchPlayerProtection', false);
    GM_setValue('forceUnlockExam', true);
    GM_setValue('playbackStrategyVersion', '1.7.0');
  }

  const BOOT = {
    hidePluginMarkers: GM_getValue('hidePluginMarkers', false),
    blockPluginDestroy: GM_getValue('blockPluginDestroy', true),
    bypassQos: GM_getValue('bypassQos', false),
    patchPlayerProtection: GM_getValue('patchPlayerProtection', false),
  };

  function injectMainWorldPluginMarkerPatch() {
    if (!BOOT.hidePluginMarkers) return;
    const code = '(' + function () {
      if (window.__jxgxkmMainWorldPluginPatch) return;
      window.__jxgxkmMainWorldPluginPatch = true;

      function patchQuerySelector(proto) {
        if (!proto || !proto.querySelector || proto.querySelector.__jxgxkmMainPatched) return;
        var raw = proto.querySelector;
        var patched = function (selector) {
          if (typeof selector === 'string' && /video\.vsc-initialized/i.test(selector)) {
            try { console.log('[JXGXKM/main] hide video.vsc-initialized'); } catch (_) {}
            return null;
          }
          return raw.call(this, selector);
        };
        patched.__jxgxkmMainPatched = true;
        proto.querySelector = patched;
      }

      function patchGetAttribute(proto) {
        if (!proto || !proto.getAttribute || proto.getAttribute.__jxgxkmMainPatched) return;
        var raw = proto.getAttribute;
        var patched = function (name) {
          if (String(name).toLowerCase() === 'data-popup-wrap-id' &&
            this && typeof this.matches === 'function' && this.matches('video.pv-video')) {
            try { console.log('[JXGXKM/main] hide data-popup-wrap-id'); } catch (_) {}
            return null;
          }
          return raw.call(this, name);
        };
        patched.__jxgxkmMainPatched = true;
        proto.getAttribute = patched;
      }

      patchQuerySelector(Document && Document.prototype);
      patchQuerySelector(Element && Element.prototype);
      patchGetAttribute(Element && Element.prototype);

      function clearMarkers() {
        try {
          document.querySelectorAll('video.vsc-initialized').forEach(function (video) {
            video.classList.remove('vsc-initialized');
          });
          document.querySelectorAll('video.pv-video[data-popup-wrap-id]').forEach(function (video) {
            video.removeAttribute('data-popup-wrap-id');
          });
        } catch (_) {}
      }
      document.addEventListener('DOMContentLoaded', clearMarkers, { once: true });
      setInterval(clearMarkers, 500);
    } + ')();';

    try {
      const script = document.createElement('script');
      script.textContent = code;
      (document.documentElement || document.head || document).appendChild(script);
      script.remove();
    } catch (err) {
      console.warn('[JXGXKM] main world patch injection failed:', err);
    }
  }

  injectMainWorldPluginMarkerPatch();

  function injectMainWorldDestroyBlocker() {
    if (!BOOT.blockPluginDestroy) return;
    const code = '(' + function () {
      if (window.__jxgxkmMainWorldDestroyBlocker) return;
      window.__jxgxkmMainWorldDestroyBlocker = true;

      var rawAlert = window.alert;
      window.alert = function (message) {
        if (typeof message === 'string' &&
          /异常插件|快进插件|plugin|speed/i.test(message)) {
          try { console.log('[JXGXKM/main] block plugin alert:', message); } catch (_) {}
          return;
        }
        return rawAlert.apply(this, arguments);
      };

      function shouldBlockDestroy() {
        var stack = '';
        try { stack = String(new Error().stack || ''); } catch (_) {}
        return /s2j_onPlayerInitOver|vsc-initialized|data-popup-wrap-id/i.test(stack);
      }

      function hookPlayer(player) {
        if (!player || player.__jxgxkmMainDestroyHooked || typeof player.destroy !== 'function') return;
        var rawDestroy = player.destroy;
        player.destroy = function () {
          if (shouldBlockDestroy()) {
            try { console.log('[JXGXKM/main] block player.destroy from plugin detection'); } catch (_) {}
            return;
          }
          return rawDestroy.apply(this, arguments);
        };
        player.__jxgxkmMainDestroyHooked = true;
      }

      var currentPlayer;
      try {
        currentPlayer = window.player;
        Object.defineProperty(window, 'player', {
          configurable: true,
          get: function () { return currentPlayer; },
          set: function (value) {
            currentPlayer = value;
            setTimeout(function () { hookPlayer(value); }, 0);
          }
        });
        if (currentPlayer) hookPlayer(currentPlayer);
      } catch (_) {
        setInterval(function () { hookPlayer(window.player); }, 200);
      }
      setInterval(function () { hookPlayer(window.player); }, 500);
    } + ')();';

    try {
      const script = document.createElement('script');
      script.textContent = code;
      (document.documentElement || document.head || document).appendChild(script);
      script.remove();
    } catch (err) {
      console.warn('[JXGXKM] main world destroy blocker injection failed:', err);
    }
  }

  injectMainWorldDestroyBlocker();

  function installQosBypass() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const isQosUrl = value => {
      const url = typeof value === 'string' ? value : (value && value.url) || '';
      return /\/\/prtas\.videocc\.net\/qos\b|\/qos\?/i.test(url);
    };

    if (w.__jxgxkmQosBypassInstalled) return;
    w.__jxgxkmQosBypassInstalled = true;

    if (typeof w.fetch === 'function') {
      const rawFetch = w.fetch.bind(w);
      w.fetch = function (input, init) {
        if (isQosUrl(input)) {
          console.log('[JXGXKM] bypass qos fetch', typeof input === 'string' ? input : input && input.url);
          return Promise.resolve(new Response('', { status: 204, statusText: 'No Content' }));
        }
        return rawFetch(input, init);
      };
    }

    if (w.navigator && w.navigator.sendBeacon) {
      const rawBeacon = w.navigator.sendBeacon.bind(w.navigator);
      w.navigator.sendBeacon = function (url, data) {
        if (isQosUrl(url)) {
          console.log('[JXGXKM] bypass qos beacon', url);
          return true;
        }
        return rawBeacon(url, data);
      };
    }

    const XHR = w.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const rawOpen = XHR.prototype.open;
      const rawSend = XHR.prototype.send;
      XHR.prototype.open = function (method, url, ...args) {
        this.__jxgxkmQos = isQosUrl(url);
        this.__jxgxkmQosUrl = url;
        return rawOpen.call(this, method, url, ...args);
      };
      XHR.prototype.send = function (body) {
        if (!this.__jxgxkmQos) return rawSend.call(this, body);
        console.log('[JXGXKM] bypass qos xhr', this.__jxgxkmQosUrl);
        try {
          Object.defineProperty(this, 'readyState', { configurable: true, get: () => 4 });
          Object.defineProperty(this, 'status', { configurable: true, get: () => 204 });
          Object.defineProperty(this, 'responseText', { configurable: true, get: () => '' });
          Object.defineProperty(this, 'response', { configurable: true, get: () => '' });
        } catch (_) {}
        const xhr = this;
        setTimeout(function () {
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
          if (typeof xhr.onload === 'function') xhr.onload();
          if (typeof xhr.onloadend === 'function') xhr.onloadend();
        }, 0);
      };
    }
  }

  if (BOOT.bypassQos) installQosBypass();

  // Hide the plugin checks used by the page without touching normal player flow.
  function protectPlayer() {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const pageDocumentProto = w.Document && w.Document.prototype || Document.prototype;
    const pageElementProto = w.Element && w.Element.prototype || Element.prototype;

    const isPluginProbeSelector = selector => typeof selector === 'string' &&
      /video\.vsc-initialized/i.test(selector);

    const patchQuerySelector = proto => {
      if (!proto || !proto.querySelector || proto.querySelector.__jxgxkmPatched) return;
      const rawQuerySelector = proto.querySelector;
      const patched = function(selector) {
        if (isPluginProbeSelector(selector)) {
          console.log('[JXGXKM] blocked plugin detection query:', selector);
          return null;
        }
        return rawQuerySelector.call(this, selector);
      };
      patched.__jxgxkmPatched = true;
      proto.querySelector = patched;
    };

    patchQuerySelector(Document.prototype);
    patchQuerySelector(Element.prototype);
    patchQuerySelector(pageDocumentProto);
    patchQuerySelector(pageElementProto);

    const patchGetAttribute = proto => {
      if (!proto || !proto.getAttribute || proto.getAttribute.__jxgxkmPatched) return;
      const rawGetAttribute = proto.getAttribute;
      const patchedGetAttribute = function(name) {
        if (String(name).toLowerCase() === 'data-popup-wrap-id' &&
          this && typeof this.matches === 'function' && this.matches('video.pv-video')) {
          console.log('[JXGXKM] hidden polyv popup-wrap plugin marker');
          return null;
        }
        return rawGetAttribute.call(this, name);
      };
      patchedGetAttribute.__jxgxkmPatched = true;
      proto.getAttribute = patchedGetAttribute;
    };

    patchGetAttribute(Element.prototype);
    patchGetAttribute(pageElementProto);

    const clearPluginMarkers = () => {
      if (!document.querySelectorAll) return;
      document.querySelectorAll('video.vsc-initialized').forEach(video => {
        video.classList.remove('vsc-initialized');
      });
      document.querySelectorAll('video.pv-video[data-popup-wrap-id]').forEach(video => {
        video.removeAttribute('data-popup-wrap-id');
      });
    };

    document.addEventListener('DOMContentLoaded', clearPluginMarkers, { once: true });
    setInterval(clearPluginMarkers, 2000);

    if (!BOOT.patchPlayerProtection) return;

    if (!w.__jxgxkmPlayerHookInstalled) {
      w.__jxgxkmPlayerHookInstalled = true;
      const hookPlayerDestroy = () => {
        const player = w.player;
        if (!player || player.__jxgxkmDestroyHooked || typeof player.destroy !== 'function') return;
        const rawDestroy = player.destroy.bind(player);
        player.destroy = function(...args) {
          const stack = String(new Error().stack || '');
          if (/s2j_onPlayerInitOver|vsc-initialized|data-popup-wrap-id/i.test(stack)) {
            console.log('[JXGXKM] blocked player.destroy from plugin detection');
            return null;
          }
          return rawDestroy(...args);
        };
        player.__jxgxkmDestroyHooked = true;
      };

      try {
        Object.defineProperty(w, 'player', {
          configurable: true,
          get() {
            return this.__jxgxkmPlayerValue;
          },
          set(value) {
            this.__jxgxkmPlayerValue = value;
            setTimeout(hookPlayerDestroy, 0);
          },
        });
      } catch (_) {}
      setInterval(hookPlayerDestroy, 1000);
    }

    const originalAlert = w.alert;
    w.alert = function(message) {
      if (typeof message === 'string' &&
        /\u5f02\u5e38\u63d2\u4ef6|\u5feb\u8fdb\u63d2\u4ef6|plugin|speed/i.test(message)) {
        console.log('[JXGXKM] blocked plugin warning alert:', message);
        return null;
      }
      return originalAlert.call(w, message);
    };
  }

  if (BOOT.hidePluginMarkers || BOOT.patchPlayerProtection) protectPlayer();

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    const message = reason && reason.message || String(reason || '');
    if (/player|polyv|videocc|Cannot read|undefined/i.test(message)) {
      console.warn('[JXGXKM] swallowed player promise rejection:', message);
      setTimeout(function() {
        try { notifyScriptError(reason || message, '播放器/脚本异常'); } catch (_) {}
      }, 0);
      event.preventDefault();
    }
  });

  window.addEventListener('error', event => {
    setTimeout(function() {
      try { notifyScriptError(event.error || event.message, '脚本报错'); } catch (_) {}
    }, 0);
  });

  const RE = {
    unfinished: /\u672a\u5b8c\u6210|\u672a\u5b66\u5b8c|\u5b66\u4e60\u4e2d|\u7ee7\u7eed\u5b66\u4e60|\u672a\u901a\u8fc7|\u5f85\u5b66\u4e60/i,
    finished: /\u5df2\u5b8c\u6210|\u5df2\u5b66\u5b8c|\u901a\u8fc7|\u5b8c\u6210/i,
    next: /\u4e0b\u4e00|\u4e0b\u8282|\u7ee7\u7eed|next/i,
    videoDone: /\u5b66\u4e60\u5b8c\u6210|\u89c2\u770b\u5b8c\u6210|\u5df2\u5b8c\u6210|\u4e0b\u4e00\u8282|\u8fdb\u5165\u4e0b\u4e00\u8282/i,
    question: /[?\uff1f]|\u5355\u9009|\u591a\u9009|\u5224\u65ad|\u9898\u76ee|\u8003\u8bd5|\u6d4b\u8bd5|\u7b54\u9898/i,
    optionPrefix: /^[A-Z][.\u3001\s]+/i,
  };

  const CFG = {
    webhookUrl: GM_getValue('webhookUrl', ''),
    aiApiUrl: GM_getValue('aiApiUrl', 'https://open.bigmodel.cn/api/paas/v4/chat/completions'),
    aiApiKey: GM_getValue('aiApiKey', ''),
    aiModel: GM_getValue('aiModel', 'GLM-4.7'),
    aiTimeoutMs: GM_getValue('aiTimeoutMs', 90000),
    autoSubmitAnswer: GM_getValue('autoSubmitAnswer', true),
    autoSubmitExam: GM_getValue('autoSubmitExam', true),
    saveQuestionBank: GM_getValue('saveQuestionBank', true),
    autoContinueAfterPass: GM_getValue('autoContinueAfterPass', true),
    autoSignIn: true,
    autoEnterExam: true,
    forceUnlockExam: true,
    scanIntervalMs: GM_getValue('scanIntervalMs', 2000),
    nextDelayMs: GM_getValue('nextDelayMs', 2500),
    debug: GM_getValue('debug', true),
  };

  const STATE = {
    notifiedQrSrc: GM_getValue('notifiedQrSrc', ''),
    answering: false,
    advancing: false,
    signing: false,
    enteringExam: false,
    openingCourse: false,
    lastQuestionKey: '',
    lastQuestionAt: 0,
    aiDisabled: false,
    submittingExam: false,
    lastExamSubmitAt: 0,
    continuingAfterPass: false,
    bootedAt: Date.now(),
    noticesSent: {},
  };

  const SELECTORS = {
    courseList: '#listBox > div > ul > li',
    courseLink: '#listBox a[href*="/train/courseware/cc?cwid="]',
    lessonItems: '.list_kc2 li, ol.list_kc2 li',
    lessonClickTarget: 'a[href*="/train/courseware/cc?cwid="], p[onclick*="/train/courseware/cc?cwid="], span[onclick*="/train/courseware/cc?cwid="], [onclick*="/train/courseware/cc?cwid="]',
    playButton: '.bf, .pv-player-btn-start, .pv-big-play-button, .pv-player-cover, .plv-player-icon-play, .xgplayer-start, .xgplayer-play, [class*="play"][class*="button"], [class*="play"][class*="btn"], button[aria-label*="play" i], button[title*="play" i]',
    signButton: '.signBtn',
    examButton: '#jrks',
    qrCode: '#imgQRCode',
    nextButtons: [
      '.next',
      '.btn-next',
      '.next_btn',
      'a[onclick*="next"]',
      'button[onclick*="next"]',
      'a[href*="/train/courseware/cc?cwid="]',
      'p[onclick*="/train/courseware/cc?cwid="]',
      'span[onclick*="/train/courseware/cc?cwid="]',
    ],
    questionContainers: [
      '.question',
      '.exam-question',
      '.test-question',
      '.paper-question',
      '.topic',
      '.tm',
      'form',
    ],
    submitButtons: [
      'button[type="submit"]',
      'input[type="submit"]',
      '.submit',
      '.btn-submit',
      'button[onclick*="submit"]',
      'button[onclick*="Submit"]',
      'a[onclick*="submit"]',
      'a[onclick*="Submit"]',
      'button[onclick*="jiaojuan"]',
      'a[onclick*="jiaojuan"]',
      'button[onclick*="hand"]',
      'a[onclick*="hand"]',
      '.but2_a[onclick*="tijiao"]',
      'span[onclick*="tijiao"]',
      '[onclick*="tijiao"]',
    ],
  };

  function log(...args) {
    if (CFG.debug) console.log('[JXGXKM]', ...args);
  }

  function notify(title, text) {
    try {
      GM_notification({ title, text, timeout: 5000 });
    } catch (_) {
      log(title, text);
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, location.origin).href;
    } catch (_) {
      return url || '';
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function clickElement(el) {
    if (!el) return false;
    if (!el.matches?.('.signBtn, button, a, input, [onclick]')) {
      el = el.closest?.('[onclick], button, a, input') || el;
    }
    const view = el.ownerDocument?.defaultView || window;
    const EventCtor = view.MouseEvent || MouseEvent;
    try {
      el.dispatchEvent(new EventCtor('mouseover', { bubbles: true, cancelable: true, view }));
      el.dispatchEvent(new EventCtor('mousedown', { bubbles: true, cancelable: true, view }));
      el.dispatchEvent(new EventCtor('mouseup', { bubbles: true, cancelable: true, view }));
      el.click();
      return true;
    } catch (err) {
      log('native click failed:', err.message || err);
    }

    try {
      el.dispatchEvent(new EventCtor('mouseover', { bubbles: true, cancelable: true, view }));
      el.dispatchEvent(new EventCtor('mousedown', { bubbles: true, cancelable: true, view }));
      el.dispatchEvent(new EventCtor('mouseup', { bubbles: true, cancelable: true, view }));
      el.click();
      return true;
    } catch (err) {
      log('clickElement failed:', err.message || err);
      return false;
    }
  }



  function pageWindow() {
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  }

  function pagePlayer() {
    return pageWindow().player || window.player || null;
  }

  function callPageFunction(name, ...args) {
    const fn = pageWindow()[name] || window[name];
    if (typeof fn !== 'function') return false;
    try {
      fn.apply(pageWindow(), args);
      return true;
    } catch (err) {
      log(`${name} failed:`, err.message || err);
      return false;
    }
  }

  function getPageNumber(name, fallback = 0) {
    const value = pageWindow()[name];
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getPlayerCurrentTime() {
    const player = pagePlayer();
    if (player && typeof player.j2s_getCurrentTime === 'function') {
      const value = Number(player.j2s_getCurrentTime());
      if (Number.isFinite(value)) return value;
    }

    const video = findPlayableVideo();
    return video ? Number(video.currentTime) || 0 : 0;
  }

  function getPlayerDuration() {
    const player = pagePlayer();
    if (player && typeof player.j2s_getDuration === 'function') {
      const value = Number(player.j2s_getDuration());
      if (Number.isFinite(value) && value > 0) return value;
    }

    const htmlDuration = getPageNumber('course_ware_duration', 0);
    if (htmlDuration > 0) return htmlDuration;

    const video = findPlayableVideo();
    return video && Number.isFinite(video.duration) ? video.duration : 0;
  }

  function getCurrentCoursewareId() {
    const fromUrl = new URLSearchParams(location.search).get('cwid');
    if (fromUrl) return fromUrl;

    const w = pageWindow();
    return w.relation_id || w.course_ware_id || w.cwid || '';
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return '未知';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}小时${String(m).padStart(2, '0')}分${String(s).padStart(2, '0')}秒`;
    return `${m}分${String(s).padStart(2, '0')}秒`;
  }

  function getActiveLessonElement() {
    const lessonItems = Array.from(document.querySelectorAll(SELECTORS.lessonItems));
    const candidates = lessonItems.length ? lessonItems : Array.from(document.querySelectorAll('ol li, ul li'));
    return candidates.find(li => {
      if (/active|cur|current|on|selected/i.test(li.className)) return true;
      return Boolean(li.querySelector('.zt, i.bk, .bai'));
    }) || null;
  }

  function cleanCourseTitle(text) {
    return normalizeText(text)
      .replace(/^(?:第?\s*)?\d{1,3}\s*[、.．-]?\s*/, '')
      .replace(/\s*(查看讲义|进入考试|观看视频完成后.*)$/i, '')
      .trim();
  }

  function getCourseTitle() {
    const cwid = getCurrentCoursewareId();
    if (cwid) {
      const current = Array.from(document.querySelectorAll(`${SELECTORS.lessonClickTarget}, a[href*="/train/courseware/cc?cwid="]`)).find(el => {
        const href = el.getAttribute?.('href') || '';
        const onclick = el.getAttribute?.('onclick') || '';
        return href.includes(cwid) || onclick.includes(cwid);
      });
      const currentTitle = cleanCourseTitle(current?.textContent || '');
      if (currentTitle) return currentTitle;
    }

    const active = getActiveLessonElement();
    const activeTitle = cleanCourseTitle(active?.querySelector?.('p, a, span')?.textContent || active?.textContent || '');
    if (activeTitle) return activeTitle;

    const stored = readStoredCourseInfo();
    if (stored.title) return stored.title;

    return cleanCourseTitle(document.title || '') || '未知课程';
  }

  function readStoredCourseInfo() {
    try {
      const info = JSON.parse(GM_getValue('currentCourseInfo', '{}') || '{}');
      return info && typeof info === 'object' ? info : {};
    } catch (_) {
      return {};
    }
  }

  function getCourseInfoSnapshot() {
    const cwid = getCurrentCoursewareId();
    const stored = readStoredCourseInfo();
    const duration = getPlayerDuration();
    const info = {
      cwid: cwid || stored.cwid || '',
      title: getCourseTitle(),
      duration: duration || Number(stored.duration) || 0,
      durationText: duration ? formatDuration(duration) : (stored.durationText || formatDuration(duration)),
      url: location.href,
      at: new Date().toLocaleString(),
    };
    if (cwid || info.title !== '未知课程') {
      GM_setValue('currentCourseInfo', JSON.stringify(info));
    }
    return info;
  }

  function isCourseListPage() {
    return location.pathname.includes('/train/courseware/list');
  }

  function isCoursePlayPage() {
    return location.pathname.includes('/train/courseware/cc');
  }

  function isFaceValidPage() {
    return location.pathname.includes('/train/courseware/facevalid');
  }

  function isExamPage() {
    return location.pathname.includes('/train/courseware/exam');
  }

  function getExamUrl() {
    const cwid = getCurrentCoursewareId();
    return cwid ? `/train/courseware/exam?cwid=${encodeURIComponent(cwid)}` : '';
  }

  function isExamPassPage() {
    const text = normalizeText(document.body?.textContent || '');
    return location.pathname.includes('/train/courseware/') &&
      /\u5df2\u7ecf\u901a\u8fc7\u4e86\u672c\u8bfe\u4ef6\u7684\u8003\u8bd5|\u606d\u559c\u60a8/.test(text) &&
      /\u7ee7\u7eed\u5b66\u4e60/.test(text);
  }

  function requestJson(url, payload, headers = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        data: JSON.stringify(payload),
        timeout: timeoutMs,
        onload: res => {
          try {
            resolve({ status: res.status, body: JSON.parse(res.responseText || '{}') });
          } catch (_) {
            resolve({ status: res.status, body: res.responseText });
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error('request timeout')),
      });
    });
  }

  async function sendWeComText(content) {
    if (!CFG.webhookUrl) {
      log('Webhook is empty, skip notification:', content);
      notify('JXGXKM', 'QR detected, but WeCom webhook is not configured.');
      return;
    }

    const res = await requestJson(CFG.webhookUrl, {
      msgtype: 'text',
      text: { content },
    });
    log('WeCom text response:', res);
  }

  async function sendWeComMarkdown(content) {
    if (!CFG.webhookUrl) {
      log('Webhook is empty, skip markdown notification:', content);
      return;
    }

    const res = await requestJson(CFG.webhookUrl, {
      msgtype: 'markdown',
      markdown: { content },
    });
    log('WeCom markdown response:', res);
  }

  function markdownEscape(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function markdownNotice(title, fields = [], color = 'info') {
    const colorMap = {
      info: 'info',
      comment: 'comment',
      warning: 'warning',
    };
    const theme = colorMap[color] || 'info';
    const lines = [`<font color="${theme}">${markdownEscape(title)}</font>`];
    for (const [label, value] of fields) {
      if (value === undefined || value === null || value === '') continue;
      lines.push(`> **${markdownEscape(label)}：**${markdownEscape(value)}`);
    }
    return lines.join('\n');
  }

  function notifyMarkdownOnce(key, title, fields = [], color = 'info') {
    const course = getCourseInfoSnapshot();
    const dedupeKey = `${key}:${course.cwid || course.title || location.pathname}`;
    if (STATE.noticesSent[dedupeKey]) return false;
    STATE.noticesSent[dedupeKey] = true;
    sendWeComMarkdown(markdownNotice(title, fields, color)).catch(err => {
      console.error('[JXGXKM] markdown webhook failed:', err);
    });
    return true;
  }

  function notifyCourseStarted() {
    const course = getCourseInfoSnapshot();
    if (!course.duration && (!course.title || /平台|未知课程/.test(course.title))) return false;
    return notifyMarkdownOnce('course-start', '开始观看课程', [
      ['课程', course.title],
      ['时长', course.durationText],
      ['时间', course.at],
    ], 'info');
  }

  function notifyVideoFinished() {
    const course = getCourseInfoSnapshot();
    return notifyMarkdownOnce('video-finished', '视频观看完毕', [
      ['课程', course.title],
      ['时长', course.durationText],
      ['进度', `${formatDuration(getPlayerCurrentTime())} / ${course.durationText}`],
    ], 'info');
  }

  function notifyExamStarted() {
    const course = readStoredCourseInfo();
    return notifyMarkdownOnce('exam-start', '开始答题考试', [
      ['课程', course.title || getCourseTitle()],
      ['时长', course.durationText || formatDuration(getPlayerDuration())],
      ['页面', location.href],
    ], 'info');
  }

  function notifySignInTriggered() {
    const course = getCourseInfoSnapshot();
    return notifyMarkdownOnce('sign-in', '触发手动签到', [
      ['课程', course.title],
      ['播放进度', `${formatDuration(getPlayerCurrentTime())} / ${course.durationText}`],
      ['动作', '已自动点击签到并恢复播放'],
    ], 'warning');
  }

  function notifyScriptError(err, source = '脚本异常') {
    const message = err && err.message || String(err || '');
    const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : '';
    const key = `script-error:${source}:${message}`.slice(0, 160);
    if (STATE.noticesSent[key]) return false;
    STATE.noticesSent[key] = true;
    const course = getCourseInfoSnapshot();
    sendWeComMarkdown(markdownNotice(source, [
      ['课程', course.title],
      ['错误', message || '未知错误'],
      ['位置', stack || location.href],
    ], 'warning')).catch(webhookErr => {
      console.error('[JXGXKM] error webhook failed:', webhookErr);
    });
    return true;
  }

  async function sendWeComQr(imageSrc) {
    if (!CFG.webhookUrl) {
      log('Webhook is empty, skip QR notification.');
      notify('JXGXKM', 'Face verification QR detected. Configure webhook first.');
      return;
    }

    const course = getCourseInfoSnapshot();
    const content = markdownNotice('触发二维码验证', [
      ['课程', course.title],
      ['进度', `${formatDuration(getPlayerCurrentTime())} / ${course.durationText}`],
      ['状态', '请扫码或完成人脸验证后继续'],
      ['页面', location.href],
      imageSrc.startsWith('data:image/') ? ['二维码', '图片已随消息发送'] : ['二维码', absoluteUrl(imageSrc)],
    ], 'warning');

    await sendWeComMarkdown(content);

    if (imageSrc.startsWith('data:image/')) {
      await sendWeComImage(imageSrc);
    }
  }

  async function sendWeComImage(dataUrl) {
    const match = /^data:image\/\w+;base64,(.+)$/i.exec(dataUrl || '');
    if (!match) return;

    const base64 = match[1];
    const md5 = md5HexFromBytes(base64ToBytes(base64));
    const res = await requestJson(CFG.webhookUrl, {
      msgtype: 'image',
      image: { base64, md5 },
    });
    log('WeCom image response:', res);
  }

  function base64ToBytes(base64) {
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  }

  function md5HexFromBytes(bytes) {
    const s = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    return md5(s);
  }

  function getCourseItems() {
    const items = Array.from(document.querySelectorAll(SELECTORS.courseList));
    if (items.length) return items;
    return Array.from(document.querySelectorAll(SELECTORS.courseLink)).map(link => link.closest('li') || link);
  }

  function getCourseInfo(item) {
    const link = item.querySelector?.('a[href*="/train/courseware/cc?cwid="]') || (item.matches?.('a') ? item : null);
    const title = normalizeText(link?.textContent || item.textContent);
    const statusText = normalizeText(item.textContent);
    const href = link ? absoluteUrl(link.getAttribute('href')) : '';
    const unfinished = RE.unfinished.test(statusText);
    const finished = RE.finished.test(statusText) && !unfinished;

    return { item, link, title, statusText, href, unfinished, finished };
  }

  function pickNextCourse() {
    const courses = getCourseItems().map(getCourseInfo).filter(course => course.link && course.href);
    if (!courses.length) return null;

    const unfinished = courses.find(course => course.unfinished);
    if (unfinished) return unfinished;

    return courses.find(course => !course.finished) || null;
  }

  async function runCourseListPage() {
    if (STATE.openingCourse) return;
    STATE.openingCourse = true;

    await sleep(1000);
    GM_setValue('lastListUrl', location.href);

    const nextCourse = pickNextCourse();
    if (!nextCourse) {
      notify('JXGXKM', 'No unfinished course found.');
      log('no unfinished course found');
      STATE.openingCourse = false;
      return;
    }

    GM_setValue('lastCourseUrl', nextCourse.href);
    log('opening course:', nextCourse.title, nextCourse.href);
    clickElement(nextCourse.link);

    await sleep(1500);
    if (location.href !== nextCourse.href) location.href = nextCourse.href;
  }

  function findPlayableVideo() {
    return Array.from(document.querySelectorAll('video')).find(video => !video.ended && (video.readyState >= 1 || video.src || video.currentSrc)) ||
      document.querySelector('video');
  }

  // ==================== 强制静音播放核心 ====================
  function startMutedAutoplay() {
    log('[V3.1] 🎬 启动静音自动播放');

    var attempts = 0;
    var maxAttempts = 20;

    var playInterval = setInterval(function() {
      attempts++;
      videoElement = document.querySelector('video');

      if (!videoElement) {
        if (attempts >= maxAttempts) {
          clearInterval(playInterval);
          console.error('[V3.1] 未找到video元素');
        }
        return;
      }

      if (isPlaying) {
        clearInterval(playInterval);
        return;
      }

      // 强制静音
      videoElement.muted = true;
      videoElement.volume = 0;
      videoElement.autoplay = true;

      var playPromise = videoElement.play();

      if (playPromise !== undefined) {
        playPromise.then(function() {
          log('[V3.1] ✓ 静音播放成功！');
          isPlaying = true;
          clearInterval(playInterval);

          // 启动永久保护
          pauseProtectionEnabled = true;
          log('[V3.1] 🛡️ pause永久保护已启动（不会解除）');

          // 监听状态
          monitorVideoState();

          // 显示静音提示
          showMutedNotification();

        }).catch(function(error) {
          if (attempts >= maxAttempts) {
            clearInterval(playInterval);
            console.error('[V3.1] 达到最大尝试次数', error);
            showManualPlayButton();
          }
        });
      }
    }, 400);
  }

  // ==================== 监控视频状态 ====================
  function monitorVideoState() {
    if (!videoElement) return;

    log('[V3.1] 开始监控视频状态（全程）');

    // 监听暂停事件（备用方案）
    videoElement.addEventListener('pause', function(e) {
      if (!pauseProtectionEnabled) return;
      if (videoElement && videoElement.ended) return; // 视频播放结束时不恢复播放

      log('[V3.1] ⚠️ 检测到pause事件！立即恢复...');

      setTimeout(function() {
        if (videoElement && videoElement.paused && !videoElement.ended) {
          videoElement.muted = true;
          videoElement.volume = 0;

          videoElement.play().then(function() {
            log('[V3.1] ✓ 已恢复播放');
          }).catch(function(err) {
            console.error('[V3.1] 恢复失败:', err.name);
            setTimeout(function() {
              if (videoElement && !videoElement.ended) {
                videoElement.play().catch(function() {});
              }
            }, 500);
          });
        }
      }, 50);
    });

    // 播放事件
    videoElement.addEventListener('play', function() {
      log('[V3.1] ▶ 播放中');
      isPlaying = true;
      videoElement.muted = true;
      videoElement.volume = 0;
    });

    // 时间更新事件
    var lastTime = 0;
    videoElement.addEventListener('timeupdate', function() {
      var currentTime = Math.floor(videoElement.currentTime);
      var duration = Math.floor(videoElement.duration);

      // 视频即将结束（最后3秒内），释放暂停保护，允许播放器正常触发 ended 并结算
      if (duration > 0 && videoElement.currentTime >= duration - 3) {
        if (pauseProtectionEnabled) {
          pauseProtectionEnabled = false;
          log('[V3.1] 🏁 视频即将结束，已解除 pause 保护以允许正常结算。');
        }
      }

      if (currentTime > lastTime && currentTime % 60 === 0) {
        log('[V3.1] 播放进度: ' + Math.floor(currentTime / 60) + '分钟');
        lastTime = currentTime;
      }
    });

    // 定期检查（每2秒）
    setInterval(function() {
      if (videoElement && videoElement.paused && !videoElement.ended && isPlaying && pauseProtectionEnabled) {
        log('[V3.1] 定期检查：检测到暂停，恢复播放');
        videoElement.muted = true;
        videoElement.play().catch(function() {});
      }

      // 强制保持静音
      if (videoElement && !videoElement.muted) {
        videoElement.muted = true;
        videoElement.volume = 0;
      }
    }, 2000);
  }

  // ==================== 显示静音提示 ====================
  function showMutedNotification() {
    // 等待jQuery加载
    var checkJquery = setInterval(function() {
      if (typeof $ !== 'undefined') {
        clearInterval(checkJquery);
        createNotification();
      }
    }, 100);

    function createNotification() {
      var notification = $('<div></div>').css({
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '15px 25px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 999998,
        fontSize: '14px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }).html('🔇 静音播放中（全程静音，确保不被中断）');

      $('body').append(notification);

      setTimeout(function() {
        notification.fadeOut(500, function() {
          $(this).remove();
        });
      }, 5000);
    }
  }

  // ==================== 手动播放按钮遮罩 ====================
  function showManualPlayButton() {
    var checkJquery = setInterval(function() {
      if (typeof $ !== 'undefined') {
        clearInterval(checkJquery);
        createButton();
      }
    }, 100);

    function createButton() {
      log('[V3.1] 显示手动播放按钮');

      var overlay = $('<div></div>').css({
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        cursor: 'pointer'
      });

      var playBtn = $('<div></div>').css({
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '40px 80px',
        borderRadius: '15px',
        fontSize: '28px',
        fontWeight: 'bold',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        textAlign: 'center',
        transition: 'all 0.3s'
      }).html('🔇 点击开始静音播放');

      var hint = $('<div></div>').css({
        color: 'white',
        fontSize: '14px',
        marginTop: '20px',
        opacity: 0.7
      }).text('将全程静音播放，避免被中断');

      playBtn.hover(
        function() { $(this).css('transform', 'scale(1.05)'); },
        function() { $(this).css('transform', 'scale(1)'); }
      );

      overlay.append(playBtn).append(hint);
      $('body').append(overlay);

      overlay.on('click', function() {
        log('[V3.1] 用户点击播放');
        $(this).fadeOut(300, function() { $(this).remove(); });

        if (videoElement) {
          videoElement.muted = true;
          videoElement.volume = 0;
          videoElement.play().then(function() {
            log('[V3.1] ✓ 用户交互后播放成功！');
            isPlaying = true;
            pauseProtectionEnabled = true;
            monitorVideoState();
            showMutedNotification();
          });
        }
      });
    }
  }

  // ==================== 监听DOM中的video元素 ====================
  function observeVideoElement() {
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.tagName === 'VIDEO') {
            videoElement = node;
            handleVideoElement(node);
          } else if (node.querySelectorAll) {
            var videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              videoElement = videos[0];
              videos.forEach(handleVideoElement);
            }
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    function handleVideoElement(video) {
      video.muted = true;
      video.autoplay = true;
      video.volume = 0;

      setTimeout(function() {
        video.play().catch(function() {});
      }, 200);
    }
  }

  // ==================== 手动控制方法挂载 ====================
  function manualMutedPlay() {
    log('[手动] 静音播放');
    var video = document.querySelector('video');
    if (video) {
      video.muted = true;
      video.volume = 0;
      video.play().then(function() {
        log('[手动] 播放成功');
        pauseProtectionEnabled = true;
        isPlaying = true;
      });
    }
  }
  window.mutedPlay = manualMutedPlay;
  pageWindow().mutedPlay = manualMutedPlay;

  function manualDisablePauseProtection() {
    pauseProtectionEnabled = false;
    log('[手动] pause保护已禁用');
  }
  window.disablePauseProtection = manualDisablePauseProtection;
  pageWindow().disablePauseProtection = manualDisablePauseProtection;

  function manualEnablePauseProtection() {
    pauseProtectionEnabled = true;
    log('[手动] pause保护已启用');
  }
  window.enablePauseProtection = manualEnablePauseProtection;
  pageWindow().enablePauseProtection = manualEnablePauseProtection;

  // 兼容主脚本原本的 ensurePlaying 调用
  async function ensurePlaying() {
    var video = document.querySelector('video');
    if (video) {
      if (video.paused && !video.ended && isPlaying && pauseProtectionEnabled) {
        log('[JXGXKM] ensurePlaying检测到视频暂停，强行恢复播放');
        video.muted = true;
        video.volume = 0;
        video.play().catch(function() {});
      }
    }
  }

  function getCurrentLessonIndex() {
    const lessonItems = Array.from(document.querySelectorAll(SELECTORS.lessonItems));
    const candidates = lessonItems.length ? lessonItems : Array.from(document.querySelectorAll('ol li, ul li'));
    const active = candidates.find(li => {
      if (/active|cur|current|on|selected/i.test(li.className)) return true;
      return Boolean(li.querySelector('.zt, i.bk, .bai'));
    });
    if (active) return candidates.indexOf(active);

    const currentCwid = new URLSearchParams(location.search).get('cwid');
    if (currentCwid) {
      const byCwid = candidates.findIndex(li => (li.textContent + ' ' + li.innerHTML).includes(currentCwid));
      if (byCwid >= 0) return byCwid;
    }

    return -1;
  }

  function findNextLessonLink() {
    const currentIndex = getCurrentLessonIndex();
    if (currentIndex >= 0) {
      const lessonItems = Array.from(document.querySelectorAll(SELECTORS.lessonItems));
      const listItems = lessonItems.length ? lessonItems : Array.from(document.querySelectorAll('ol li, ul li'));
      const nextLi = listItems[currentIndex + 1];
      const nextLink = nextLi?.querySelector(SELECTORS.lessonClickTarget);
      if (nextLink) return nextLink;
    }

    for (const selector of SELECTORS.nextButtons) {
      const found = Array.from(document.querySelectorAll(selector)).find(el => {
        const text = normalizeText(el.textContent);
        const href = el.getAttribute?.('href') || '';
        return isVisible(el) && RE.next.test(text + href);
      });
      if (found) return found;
    }

    return null;
  }

  function isVideoFinished() {
    if (pageWindow().IsEnd === true) return true;

    const duration = getPlayerDuration();
    const currentTime = getPlayerCurrentTime();
    if (duration > 0 && currentTime >= duration - 2) return true;

    const video = findPlayableVideo();
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      return video.ended || video.currentTime >= video.duration - 2;
    }

    if (BOOT.safePlaybackMode) return false;
    return RE.videoDone.test(normalizeText(document.body.textContent));
  }

  async function advanceIfFinished() {
    if (STATE.advancing || !isVideoFinished()) return;
    STATE.advancing = true;
    notifyVideoFinished();

    await sleep(CFG.nextDelayMs);
    await handleFaceQr();
    if (await enterExamIfReady()) {
      await sleep(2000);
      STATE.advancing = false;
      return;
    }

    const nextLink = findNextLessonLink();
    if (nextLink) {
      log('advance to next lesson');
      clickElement(nextLink);
    } else {
      const listUrl = GM_getValue('lastListUrl', '');
      log('no next lesson link, returning to list:', listUrl);
      if (listUrl) location.href = listUrl;
    }

    await sleep(2000);
    STATE.advancing = false;
  }

  function getInputLabel(input) {
    const id = input.getAttribute('id');
    const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrapper = input.closest('label, li, .option, .answer, dd, p, div');
    const text = normalizeText((byFor || wrapper || input).textContent);
    return text || input.value || '';
  }

  function nearestQuestionRoot(inputGroup) {
    const first = inputGroup[0];
    if (!first) return null;

    let node = first.closest('li, .question, .exam-question, .test-question, .paper-question, .topic, .tm, .item, .subject, .exam-item, .question-item');
    if (node && node.matches('li') && node.querySelectorAll('input[type="radio"], input[type="checkbox"]').length <= 1) {
      node = node.parentElement || node;
    }

    while (node && node !== document.body) {
      const inputs = node.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      const names = new Set(Array.from(inputs).map(input => input.name || input.value || 'choice'));
      if (inputs.length <= Math.max(inputGroup.length + 3, 8) || names.size <= 2) return node;
      node = node.parentElement?.closest('li, .question, .exam-question, .test-question, .paper-question, .topic, .tm, .item, .subject, .exam-item, .question-item');
    }

    return first.closest('form') || first.parentElement;
  }

  function cleanQuestionText(root, options) {
    const previous = findPreviousQuestionText(root);
    if (previous) return previous;

    const clone = root?.cloneNode(true);
    if (!clone) return '';

    clone.querySelectorAll('input, label, option, select, textarea, button, .option, .answer').forEach(el => {
      const text = normalizeText(el.textContent);
      if (!text || options.some(option => option.text && text.includes(option.text))) el.remove();
    });

    let text = normalizeText(clone.textContent);
    for (const option of options) {
      if (option.text) text = text.replace(option.text, ' ');
    }
    return normalizeText(text) || normalizeText(root.textContent);
  }

  function looksLikeQuestionText(text) {
    return /^\d+\s*[.\u3001]/.test(text) || /[?\uff1f]$/.test(text);
  }

  function stripOptionLikePrefix(text) {
    return normalizeText(text).replace(/^[A-H]\s*[.\u3001]\s*/i, '');
  }

  function findPreviousQuestionText(root) {
    if (!root) return '';

    const scan = [];
    let node = root.previousElementSibling;
    while (node && scan.length < 8) {
      scan.push(node);
      node = node.previousElementSibling;
    }

    let parent = root.parentElement;
    while (parent && parent !== document.body && scan.length < 20) {
      node = parent.previousElementSibling;
      while (node && scan.length < 20) {
        scan.push(node);
        node = node.previousElementSibling;
      }
      parent = parent.parentElement;
    }

    for (const el of scan) {
      const text = stripOptionLikePrefix(el.textContent || '');
      if (text && looksLikeQuestionText(text)) return text;
    }

    return '';
  }

  function collectQuestionData(container, opts = {}) {
    const inputs = Array.from(container.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(input => !input.disabled && isVisible(input));
    if (!inputs.length) return null;

    const groups = new Map();
    for (const input of inputs) {
      const key = input.name || input.getAttribute('data-name') || input.closest('[data-question-id], [questionid], li, .question')?.getAttribute('data-question-id') || input.value || 'choice';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(input);
    }

    const inputGroup = Array.from(groups.values()).find(group => group.length >= 2 && (opts.includeAnswered || !group.some(input => input.checked)));
    if (!inputGroup) return null;

    const root = nearestQuestionRoot(inputGroup) || container;
    const options = inputGroup.map((input, index) => ({
      index,
      text: getInputLabel(input).replace(RE.optionPrefix, '').trim(),
      value: input.value || '',
      inputType: input.type || '',
      name: input.name || '',
    })).filter(option => option.text || option.value);

    return {
      container: root,
      inputs: inputGroup,
      text: cleanQuestionText(root, options),
      options,
    };
  }

  function findQuestionContainer() {
    const containers = SELECTORS.questionContainers.flatMap(selector => Array.from(document.querySelectorAll(selector)));
    return containers.find(container => {
      const hasChoice = container.querySelector('input[type="radio"], input[type="checkbox"]');
      return hasChoice;
    });
  }

  async function askAi(questionData) {
    if (STATE.aiDisabled) return null;

    if (!CFG.aiApiUrl) {
      log('AI API is empty, skip answering');
      return null;
    }

    const headers = CFG.aiApiKey ? { Authorization: `Bearer ${CFG.aiApiKey}` } : {};
    const prompt = [
      'Answer this single course question. Return JSON only, for example {"answers":[0]} or {"answers":["A"]}.',
      'Use only the provided options. Index is zero-based.',
      `Question: ${questionData.text}`,
      `Options: ${JSON.stringify(questionData.options)}`,
    ].join('\n');
    const isOpenAiStyle = /\/v1\/chat\/completions\b|\/chat\/completions\b/i.test(CFG.aiApiUrl);
    const payload = isOpenAiStyle ? {
      model: CFG.aiModel,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You answer multiple-choice questions. Return compact JSON only.' },
        { role: 'user', content: prompt },
      ],
    } : {
      model: CFG.aiModel,
      question: questionData.text,
      options: questionData.options,
      instruction: 'Return JSON only: {"answers":[0]} or {"answers":["A"]}.',
    };

    const res = await requestJson(CFG.aiApiUrl, payload, headers, CFG.aiTimeoutMs);

    log('AI answer response:', res);
    if (typeof res.body === 'string' && /^\s*<!doctype html|^\s*<html[\s>]/i.test(res.body)) {
      STATE.aiDisabled = true;
      notify('JXGXKM', 'AI API returned HTML. Configure a real model API endpoint.');
      log('AI API returned HTML instead of JSON. Current URL:', CFG.aiApiUrl);
      return null;
    }

    let body = typeof res.body === 'string' ? safeJsonParse(res.body) : res.body;
    const openAiContent = body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text;
    if (openAiContent) body = safeJsonParse(openAiContent) || { answer: openAiContent };
    if (body?.error) {
      const message = body.error.message || JSON.stringify(body.error);
      notify('JXGXKM', `AI API error: ${message}`);
      log('AI API error:', body.error);
      return null;
    }
    if (!body) return null;

    if (Array.isArray(body.answers)) return body.answers;
    if (Array.isArray(body.answer)) return body.answer;
    if (typeof body.answer === 'string' || typeof body.answer === 'number') return [body.answer];
    return null;
  }

  function getQuestionKey(questionData) {
    return md5(`${questionData.text}\n${questionData.options.map(option => option.text).join('|')}`);
  }

  function loadQuestionBank() {
    const raw = GM_getValue('questionBank', '{}');
    try {
      return JSON.parse(raw || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveQuestionBank(bank) {
    GM_setValue('questionBank', JSON.stringify(bank));
  }

  function getBankAnswers(questionData) {
    const item = loadQuestionBank()[getQuestionKey(questionData)];
    return item?.answers || null;
  }

  function putBankAnswers(questionData, answers, source = 'result') {
    if (!CFG.saveQuestionBank || !answers || !answers.length) return false;
    const bank = loadQuestionBank();
    bank[getQuestionKey(questionData)] = {
      question: questionData.text,
      options: questionData.options.map(option => option.text),
      answers,
      source,
      savedAt: new Date().toISOString(),
    };
    saveQuestionBank(bank);
    return true;
  }

  function loadPendingExamAnswers() {
    const raw = GM_getValue('pendingExamAnswers', '[]');
    try {
      return JSON.parse(raw || '[]');
    } catch (_) {
      return [];
    }
  }

  function savePendingExamAnswer(questionData, answers) {
    if (!answers || !answers.length) return false;
    const key = getQuestionKey(questionData);
    const pending = loadPendingExamAnswers().filter(item => item.key !== key);
    pending.push({
      key,
      question: questionData.text,
      options: questionData.options.map(option => option.text),
      answers,
      savedAt: new Date().toISOString(),
    });
    GM_setValue('pendingExamAnswers', JSON.stringify(pending));
    return true;
  }

  function promotePendingExamAnswers() {
    if (!CFG.saveQuestionBank) return 0;
    const pending = loadPendingExamAnswers();
    if (!pending.length) return 0;

    const bank = loadQuestionBank();
    for (const item of pending) {
      bank[item.key] = {
        question: item.question,
        options: item.options,
        answers: item.answers,
        source: 'passed_exam',
        savedAt: new Date().toISOString(),
      };
    }
    saveQuestionBank(bank);
    GM_setValue('pendingExamAnswers', '[]');
    log('promoted pending exam answers:', pending.length);
    return pending.length;
  }

  function extractAnswerLetters(text) {
    const value = normalizeText(text);
    const hit = value.match(/(?:\u6b63\u786e\u7b54\u6848|\u6807\u51c6\u7b54\u6848|\u53c2\u8003\u7b54\u6848|\u7b54\u6848)\s*[:\uff1a]?\s*([A-H](?:\s*[,\uff0c\u3001]\s*[A-H])*)/i);
    if (!hit) return null;
    return hit[1].split(/[,\uff0c\u3001\s]+/).filter(Boolean).map(letter => letter.toUpperCase());
  }

  function inferCorrectAnswers(root, questionData) {
    const fromText = extractAnswerLetters(root.textContent || '');
    if (fromText?.length) return fromText;

    const correctEls = Array.from(root.querySelectorAll('.right, .correct, .true, .success, .dui, .yes, [class*="right"], [class*="correct"]'));
    const letters = [];
    for (const el of correctEls) {
      const text = normalizeText(el.textContent);
      const letter = text.match(/\b([A-H])\b|^([A-H])[.\u3001]/i);
      if (letter) letters.push((letter[1] || letter[2]).toUpperCase());
      else {
        const optionIndex = questionData.options.findIndex(option => option.text && text.includes(option.text));
        if (optionIndex >= 0) letters.push(String.fromCharCode(65 + optionIndex));
      }
    }
    return [...new Set(letters)];
  }

  function saveQuestionBankFromResult() {
    if (!CFG.saveQuestionBank) return 0;

    let saved = 0;
    const containers = SELECTORS.questionContainers.flatMap(selector => Array.from(document.querySelectorAll(selector)));
    for (const container of containers) {
      const questionData = collectQuestionData(container, { includeAnswered: true });
      if (!questionData || !questionTextLooksValid(questionData)) continue;

      const answers = inferCorrectAnswers(container, questionData);
      if (answers?.length && putBankAnswers(questionData, answers, 'result')) saved += 1;
    }

    if (saved) {
      log('question bank saved from result:', saved);
      notify('JXGXKM', `Saved ${saved} answers to question bank.`);
    }
    return saved;
  }

  function questionTextLooksValid(questionData) {
    const question = normalizeText(questionData.text);
    if (!question) return false;
    const firstOption = normalizeText(questionData.options[0]?.text || '');
    if (firstOption && (question === firstOption || question.includes(firstOption))) return false;
    return true;
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      const jsonLike = String(text || '').match(/\{[\s\S]*\}/);
      if (!jsonLike) return null;
      try {
        return JSON.parse(jsonLike[0]);
      } catch (__) {
        return null;
      }
    }
  }

  function chooseAnswers(questionData, answers) {
    if (!answers || !answers.length) return false;

    const optionElements = questionData.inputs.map((input, index) => ({
      input,
      text: questionData.options[index]?.text || getInputLabel(input),
      value: questionData.options[index]?.value || input.value || '',
    }));

    let changed = false;
    for (const answer of answers) {
      const answerText = String(answer).trim();
      const numericIndex = Number(answerText);
      const answerIndex = Number.isInteger(numericIndex) ? numericIndex : -1;
      const letterIndex = /^[A-Z]$/i.test(answerText) ? answerText.toUpperCase().charCodeAt(0) - 65 : -1;

      const matched = optionElements.find((option, index) => {
        const cleanText = option.text.replace(RE.optionPrefix, '').trim();
        return index === answerIndex ||
          index === letterIndex ||
          option.input.value === answerText ||
          option.value === answerText ||
          option.text.includes(answerText) ||
          cleanText === answerText;
      });

      if (matched && !matched.input.checked) {
        clickElement(matched.input);
        changed = true;
      }
    }

    return changed;
  }

  function submitAnswers(container) {
    if (!CFG.autoSubmitAnswer) return false;

    for (const selector of SELECTORS.submitButtons) {
      const button = Array.from(container.querySelectorAll(selector)).find(isVisible) ||
        Array.from(document.querySelectorAll(selector)).find(isVisible);
      if (button) {
        log('submit answer');
        return clickElement(button);
      }
    }

    return false;
  }

  function getVisibleChoiceGroups() {
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(input => !input.disabled && isVisible(input));
    const groups = new Map();
    for (const input of inputs) {
      const key = input.name || input.closest('[data-question-id], [questionid], li, .question')?.getAttribute('data-question-id') || input.value || `choice-${groups.size}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(input);
    }
    return Array.from(groups.values()).filter(group => group.length >= 2);
  }

  function allQuestionsAnswered() {
    const groups = getVisibleChoiceGroups();
    return groups.length > 0 && groups.every(group => group.some(input => input.checked));
  }

  function hasPendingQuestion() {
    const container = findQuestionContainer();
    if (!container) return false;
    const questionData = collectQuestionData(container);
    return Boolean(questionData && questionData.options.length && questionTextLooksValid(questionData));
  }

  function snapshotAnsweredQuestions() {
    let saved = 0;
    const containers = SELECTORS.questionContainers.flatMap(selector => Array.from(document.querySelectorAll(selector)));
    for (const container of containers) {
      const questionData = collectQuestionData(container, { includeAnswered: true });
      if (!questionData || !questionTextLooksValid(questionData)) continue;

      const answers = questionData.inputs
        .map((input, index) => input.checked ? String.fromCharCode(65 + index) : null)
        .filter(Boolean);
      if (answers.length && savePendingExamAnswer(questionData, answers)) saved += 1;
    }
    if (saved) log('snapshot answered questions:', saved);
    return saved;
  }

  function findExamSubmitButton() {
    for (const selector of SELECTORS.submitButtons) {
      const button = Array.from(document.querySelectorAll(selector)).find(isVisible);
      if (button) return button;
    }

    return Array.from(document.querySelectorAll('button, a, span, div, input[type="button"], input[type="submit"]')).find(el => {
      if (!isVisible(el)) return false;
      const text = normalizeText(el.textContent || el.value || el.getAttribute('title') || '');
      return /\u4ea4\u5377|\u63d0\u4ea4|\u63d0\u4ea4\u8bd5\u5377|\u63d0\u4ea4\u7b54\u6848|\u5b8c\u6210\u8003\u8bd5|submit|hand\s*in/i.test(text);
    }) || null;
  }

  function submitExamByPageFunction() {
    const w = pageWindow();
    const names = ['tijiao', 'submitExam', 'SubmitExam', 'jiaojuan'];
    for (const name of names) {
      const fn = w[name] || window[name];
      if (typeof fn !== 'function') continue;
      try {
        log('call submit function:', name);
        fn.call(w);
        return true;
      } catch (err) {
        log('submit function failed:', name, err.message || err);
      }
    }
    return false;
  }

  async function submitExamIfComplete() {
    if (!CFG.autoSubmitExam || STATE.submittingExam) return false;
    if (!isExamPage()) return false;
    if (Date.now() - STATE.lastExamSubmitAt < 20000) return false;
    if (!allQuestionsAnswered() && hasPendingQuestion()) return false;

    const button = findExamSubmitButton();
    const hasSubmitFunction = typeof (pageWindow().tijiao || window.tijiao) === 'function';
    if (!button && !hasSubmitFunction) {
      log('submit button not found');
      return false;
    }

    STATE.submittingExam = true;
    STATE.lastExamSubmitAt = Date.now();
    try {
      log('submit exam');
      snapshotAnsweredQuestions();
      const w = pageWindow();
      const rawConfirm = w.confirm;
      const rawWindowConfirm = window.confirm;
      const autoConfirm = message => {
        log('auto confirm submit:', message || '');
        return true;
      };
      try {
        w.confirm = autoConfirm;
        window.confirm = autoConfirm;
      } catch (_) {}
      try {
        if (!submitExamByPageFunction() && button) {
          clickElement(button);
          const onclick = button.getAttribute('onclick') || '';
          if (/tijiao\s*\(/i.test(onclick)) await sleep(300);
        }
      } finally {
        try {
          w.confirm = rawConfirm;
          window.confirm = rawWindowConfirm;
        } catch (_) {}
      }
      await sleep(3000);
      saveQuestionBankFromResult();
      return true;
    } finally {
      await sleep(3000);
      STATE.submittingExam = false;
    }
  }

  async function completeSignIn(signButton) {
    let handled = false;

    if (signButton && clickElement(signButton)) {
      handled = true;
    }

    await sleep(300);

    const signStillVisible = document.querySelector('.sign-in') ||
      (signButton && document.documentElement.contains(signButton) && isVisible(signButton));
    if (signStillVisible && callPageFunction('course_ware_sign')) {
      handled = true;
    }

    document.querySelectorAll('.sign-in-menu').forEach(el => { el.innerHTML = ''; });
    document.querySelectorAll('.sign-in').forEach(el => el.remove());

    const player = pagePlayer();
    if (player && typeof player.j2s_resumeVideo === 'function') {
      try {
        player.j2s_resumeVideo();
        handled = true;
      } catch (err) {
        log('resume after sign-in failed:', err.message || err);
      }
    }

    callPageFunction('setTimerSign');

    await sleep(500);
    const video = document.querySelector('video');
    if (video && video.paused) {
      video.muted = true;
      video.volume = 0;
      video.play().catch(() => {});
    }
    return handled;
  }

  function findSignButton() {
    const direct = Array.from(document.querySelectorAll(SELECTORS.signButton)).find(isVisible);
    if (direct) return direct;

    return Array.from(document.querySelectorAll('span, button, a, input[type="button"], input[type="submit"], [role="button"]')).find(el => {
      if (!isVisible(el)) return false;
      const text = normalizeText(el.textContent || el.value || el.getAttribute('aria-label') || '');
      return /点击签到|学习签到|签到/.test(text);
    }) || null;
  }

  async function handleSignIn() {
    if (!CFG.autoSignIn || STATE.signing) return false;

    const signButton = findSignButton();
    if (!signButton) return false;

    STATE.signing = true;
    try {
      log('sign-in button detected');
      notifySignInTriggered();
      return await completeSignIn(signButton);
    } finally {
      await sleep(1500);
      STATE.signing = false;
    }
  }

  function examButtonReady(button) {
    if (!button) return false;
    const wrapper = button.closest('.jrks');
    const bg = wrapper ? window.getComputedStyle(wrapper).backgroundColor : '';
    const disabledByAlert = /alert\s*\(/i.test(button.getAttribute('onclick') || '');
    const enabledByPage = typeof (pageWindow().toExam || window.toExam) === 'function' && !disabledByAlert;
    const enabledByColor = /34,\s*152,\s*239|35,\s*152,\s*239|#2298ef/i.test(bg);
    return enabledByPage || enabledByColor || Boolean(button.getAttribute('href')) || (isVideoFinished() && Boolean(getExamUrl()));
  }

  async function unlockExamIfFinished() {
    const examButton = document.querySelector(SELECTORS.examButton);
    if (!examButton || !isVideoFinished()) return false;
    if (!CFG.forceUnlockExam) {
      log('force unlock exam disabled');
      return false;
    }

    if (examButtonReady(examButton)) return true;

    if (callPageFunction('course_ware_finish')) {
      log('course_ware_finish() called to unlock exam');
      await sleep(1500);
      return true;
    }

    if (callPageFunction('insertPlayRecord')) {
      log('insertPlayRecord() called to unlock exam');
      await sleep(1500);
      return true;
    }

    return false;
  }

  function enterExamByUrl() {
    const examUrl = getExamUrl();
    if (!examUrl) return false;
    location.href = examUrl;
    return true;
  }

  async function enterExamIfReady() {
    if (!CFG.autoEnterExam || STATE.enteringExam) return false;

    let examButton = document.querySelector(SELECTORS.examButton);
    if (!examButton && !(isVideoFinished() && getExamUrl())) return false;

    STATE.enteringExam = true;
    try {
      await unlockExamIfFinished();
      examButton = document.querySelector(SELECTORS.examButton);
      if (!examButton && isVideoFinished()) {
        log('enter exam by url because exam button is missing');
        notifyMarkdownOnce('enter-exam', '准备进入考试', [
          ['课程', getCourseTitle()],
          ['状态', '视频已完成，正在打开考试页'],
        ], 'info');
        return enterExamByUrl();
      }
      if (!examButtonReady(examButton)) {
        log('exam button is not ready yet');
        return false;
      }

      log('enter exam');
      notifyMarkdownOnce('enter-exam', '准备进入考试', [
        ['课程', getCourseTitle()],
        ['状态', '视频已完成，正在打开考试页'],
      ], 'info');
      if (!callPageFunction('toExam') && !(examButton && clickElement(examButton))) {
        enterExamByUrl();
      }
      setTimeout(function() {
        if (isCoursePlayPage() && isVideoFinished()) enterExamByUrl();
      }, 2500);
      return true;
    } finally {
      await sleep(2000);
      STATE.enteringExam = false;
    }
  }

  async function handleQuiz() {
    if (STATE.answering) return;

    const container = findQuestionContainer();
    if (!container) return;

    STATE.answering = true;
    try {
      const questionData = collectQuestionData(container);
      if (!questionData || !questionData.options.length) return;
      if (!questionTextLooksValid(questionData)) {
        log('skip question because text extraction looks invalid:', questionData);
        return;
      }

      const questionKey = getQuestionKey(questionData);
      const now = Date.now();
      if (questionKey === STATE.lastQuestionKey && now - STATE.lastQuestionAt < 60000) {
        return;
      }
      STATE.lastQuestionKey = questionKey;
      STATE.lastQuestionAt = now;

      log('question detected:', questionData);
      const bankAnswers = getBankAnswers(questionData);
      const answers = bankAnswers || await askAi(questionData);
      if (!answers) {
        notify('JXGXKM', 'Question detected, but AI API did not return answers.');
        return;
      }

      const chosen = chooseAnswers(questionData, answers);
      if (chosen && !bankAnswers) putBankAnswers(questionData, answers, 'ai');
      if (chosen) savePendingExamAnswer(questionData, answers);
      if (chosen) await sleep(500);
    } catch (err) {
      console.error('[JXGXKM] answer failed:', err);
      notifyScriptError(err, '答题脚本报错');
    } finally {
      await sleep(2000);
      STATE.answering = false;
    }
  }

  async function handleFaceQr() {
    const qr = document.querySelector(SELECTORS.qrCode);
    if (!qr) return false;

    const src = qr.getAttribute('src') || '';
    if (!src || src === STATE.notifiedQrSrc) return true;

    STATE.notifiedQrSrc = src;
    GM_setValue('notifiedQrSrc', src);

    log('QR face verification detected');
    notify('JXGXKM', 'Face verification QR detected. Sending notification.');
    try {
      await sendWeComQr(src);
    } catch (err) {
      console.error('[JXGXKM] send QR notification failed:', err);
      notify('JXGXKM', `QR notification failed: ${err.message || err}`);
    }

    return true;
  }

  async function runCoursePlayPage() {
    GM_setValue('lastCourseUrl', location.href);
    getCourseInfoSnapshot();
    notifyCourseStarted();
    await handleSignIn();
    await ensurePlaying();
    await handleQuiz();
    await handleFaceQr();
    await enterExamIfReady();
    await advanceIfFinished();
  }

  async function runFaceValidPage() {
    await handleFaceQr();
  }

  async function runExamPage() {
    notifyExamStarted();
    await handleFaceQr();
    saveQuestionBankFromResult();
    await handleQuiz();
    await submitExamIfComplete();
  }

  function findContinueStudyLink() {
    return Array.from(document.querySelectorAll('span[onclick*="/train/courseware/cc?cwid="], a[href*="/train/courseware/cc?cwid="], [onclick*="/train/courseware/cc?cwid="]')).find(el => {
      if (!isVisible(el)) return false;
      return /\u7ee7\u7eed\u5b66\u4e60/.test(normalizeText(el.textContent || el.value || '')) ||
        (el.getAttribute('onclick') || el.getAttribute('href') || '').includes('/train/courseware/cc?cwid=');
    }) || null;
  }

  async function runExamPassPage() {
    const saved = promotePendingExamAnswers();
    if (saved) notify('JXGXKM', `Saved ${saved} passed exam answers.`);

    if (!CFG.autoContinueAfterPass || STATE.continuingAfterPass) return;
    const next = findContinueStudyLink();
    if (!next) return;

    STATE.continuingAfterPass = true;
    try {
      log('continue after passed exam');
      await sleep(2000);
      clickElement(next);
    } finally {
      await sleep(3000);
      STATE.continuingAfterPass = false;
    }
  }

  async function tick() {
    try {

      if (isCourseListPage()) {
        await runCourseListPage();
        return;
      }

      if (isFaceValidPage()) {
        await runFaceValidPage();
        return;
      }

      if (isExamPassPage()) {
        await runExamPassPage();
        return;
      }

      if (isExamPage()) {
        await runExamPage();
        return;
      }

      if (isCoursePlayPage()) {
        await runCoursePlayPage();
      }
    } catch (err) {
      console.error('[JXGXKM] tick failed:', err);
      notifyScriptError(err, '脚本循环报错');
    }
  }

  function registerMenus() {
    if (typeof GM_registerMenuCommand !== 'function') {
      log('GM_registerMenuCommand is not available, skipping menu registration');
      return;
    }
    GM_registerMenuCommand('Set WeCom Webhook', () => {
      const value = prompt('WeCom robot webhook URL:', CFG.webhookUrl || '');
      if (value !== null) {
        GM_setValue('webhookUrl', value.trim());
        location.reload();
      }
    });

    GM_registerMenuCommand('Set AI Answer API', () => {
      const value = prompt('AI answer API URL (POST JSON):', CFG.aiApiUrl || '');
      if (value !== null) {
        GM_setValue('aiApiUrl', value.trim());
        STATE.aiDisabled = false;
        location.reload();
      }
    });

    GM_registerMenuCommand('Set AI API Key', () => {
      const value = prompt('AI API key (optional):', CFG.aiApiKey || '');
      if (value !== null) {
        GM_setValue('aiApiKey', value.trim());
        STATE.aiDisabled = false;
        location.reload();
      }
    });

    GM_registerMenuCommand('Set AI Model', () => {
      const value = prompt('AI model name:', CFG.aiModel || 'gpt-4o-mini');
      if (value !== null) {
        GM_setValue('aiModel', value.trim() || 'gpt-4o-mini');
        STATE.aiDisabled = false;
        location.reload();
      }
    });

    GM_registerMenuCommand('Set AI Timeout Seconds', () => {
      const current = Math.round((Number(CFG.aiTimeoutMs) || 90000) / 1000);
      const value = prompt('AI request timeout seconds:', String(current));
      if (value !== null) {
        const seconds = Math.max(10, Number(value) || 90);
        GM_setValue('aiTimeoutMs', seconds * 1000);
        STATE.aiDisabled = false;
        location.reload();
      }
    });

    GM_registerMenuCommand('Reset AI Answer State', () => {
      STATE.aiDisabled = false;
      STATE.lastQuestionKey = '';
      STATE.lastQuestionAt = 0;
      notify('JXGXKM', 'AI answer state reset.');
    });

    GM_registerMenuCommand('Force Play Now', () => {
      if (typeof window.mutedPlay === 'function') {
        window.mutedPlay();
      }
    });

    GM_registerMenuCommand(`${CFG.autoSubmitAnswer ? 'Disable' : 'Enable'} Auto Submit Answer`, () => {
      GM_setValue('autoSubmitAnswer', !CFG.autoSubmitAnswer);
      location.reload();
    });

    GM_registerMenuCommand(`${CFG.autoSubmitExam ? 'Disable' : 'Enable'} Auto Submit Exam`, () => {
      GM_setValue('autoSubmitExam', !CFG.autoSubmitExam);
      location.reload();
    });

    GM_registerMenuCommand(`${CFG.saveQuestionBank ? 'Disable' : 'Enable'} Save Question Bank`, () => {
      GM_setValue('saveQuestionBank', !CFG.saveQuestionBank);
      location.reload();
    });

    GM_registerMenuCommand(`${CFG.autoContinueAfterPass ? 'Disable' : 'Enable'} Auto Continue After Pass`, () => {
      GM_setValue('autoContinueAfterPass', !CFG.autoContinueAfterPass);
      location.reload();
    });

    GM_registerMenuCommand('Export Question Bank', () => {
      const bank = GM_getValue('questionBank', '{}');
      console.log('[JXGXKM] question bank:', JSON.parse(bank || '{}'));
      notify('JXGXKM', 'Question bank printed to console.');
    });

    GM_registerMenuCommand('Clear Question Bank', () => {
      if (confirm('Clear local question bank?')) {
        GM_setValue('questionBank', '{}');
        notify('JXGXKM', 'Question bank cleared.');
      }
    });

    GM_registerMenuCommand('Clear Pending Exam Answers', () => {
      GM_setValue('pendingExamAnswers', '[]');
      notify('JXGXKM', 'Pending exam answers cleared.');
    });

    GM_registerMenuCommand(`${CFG.autoSignIn ? 'Disable' : 'Enable'} Auto Sign In`, () => {
      GM_setValue('autoSignIn', !CFG.autoSignIn);
      location.reload();
    });

    GM_registerMenuCommand(`${CFG.autoEnterExam ? 'Disable' : 'Enable'} Auto Enter Exam`, () => {
      GM_setValue('autoEnterExam', !CFG.autoEnterExam);
      location.reload();
    });

    GM_registerMenuCommand(`${CFG.forceUnlockExam ? 'Disable' : 'Enable'} Force Unlock Exam`, () => {
      GM_setValue('forceUnlockExam', !CFG.forceUnlockExam);
      location.reload();
    });

    GM_registerMenuCommand((BOOT.hidePluginMarkers ? 'Disable' : 'Enable') + ' Hide Plugin Markers', () => {
      GM_setValue('hidePluginMarkers', !BOOT.hidePluginMarkers);
      location.reload();
    });

    GM_registerMenuCommand((BOOT.blockPluginDestroy ? 'Disable' : 'Enable') + ' Block Plugin Destroy', () => {
      GM_setValue('blockPluginDestroy', !BOOT.blockPluginDestroy);
      location.reload();
    });

    GM_registerMenuCommand((BOOT.bypassQos ? 'Disable' : 'Enable') + ' QoS Bypass', () => {
      GM_setValue('bypassQos', !BOOT.bypassQos);
      location.reload();
    });

    GM_registerMenuCommand((BOOT.patchPlayerProtection ? 'Disable' : 'Enable') + ' Player Protection Patch', () => {
      GM_setValue('patchPlayerProtection', !BOOT.patchPlayerProtection);
      location.reload();
    });

    GM_registerMenuCommand(`${CFG.debug ? 'Disable' : 'Enable'} Debug Log`, () => {
      GM_setValue('debug', !CFG.debug);
      location.reload();
    });

    GM_registerMenuCommand('Reset QR Notification Cache', () => {
      GM_setValue('notifiedQrSrc', '');
      notify('JXGXKM', 'QR notification cache reset.');
    });
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      const signButton = document.querySelector(SELECTORS.signButton) || document.querySelector('.sign-in');
      if (signButton) {
        handleSignIn();
        return;
      }

      handleFaceQr();
      handleSignIn();
      handleQuiz();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class'],
    });
  }

  function md5(input) {
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) {
      return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    function gg(a, b, c, d, x, s, t) {
      return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    function hh(a, b, c, d, x, s, t) {
      return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function ii(a, b, c, d, x, s, t) {
      return cmn(c ^ (b | (~d)), a, b, x, s, t);
    }
    function md5cycle(state, block) {
      let [a, b, c, d] = state;

      a = ff(a, b, c, d, block[0], 7, -680876936);
      d = ff(d, a, b, c, block[1], 12, -389564586);
      c = ff(c, d, a, b, block[2], 17, 606105819);
      b = ff(b, c, d, a, block[3], 22, -1044525330);
      a = ff(a, b, c, d, block[4], 7, -176418897);
      d = ff(d, a, b, c, block[5], 12, 1200080426);
      c = ff(c, d, a, b, block[6], 17, -1473231341);
      b = ff(b, c, d, a, block[7], 22, -45705983);
      a = ff(a, b, c, d, block[8], 7, 1770035416);
      d = ff(d, a, b, c, block[9], 12, -1958414417);
      c = ff(c, d, a, b, block[10], 17, -42063);
      b = ff(b, c, d, a, block[11], 22, -1990404162);
      a = ff(a, b, c, d, block[12], 7, 1804603682);
      d = ff(d, a, b, c, block[13], 12, -40341101);
      c = ff(c, d, a, b, block[14], 17, -1502002290);
      b = ff(b, c, d, a, block[15], 22, 1236535329);

      a = gg(a, b, c, d, block[1], 5, -165796510);
      d = gg(d, a, b, c, block[6], 9, -1069501632);
      c = gg(c, d, a, b, block[11], 14, 643717713);
      b = gg(b, c, d, a, block[0], 20, -373897302);
      a = gg(a, b, c, d, block[5], 5, -701558691);
      d = gg(d, a, b, c, block[10], 9, 38016083);
      c = gg(c, d, a, b, block[15], 14, -660478335);
      b = gg(b, c, d, a, block[4], 20, -405537848);
      a = gg(a, b, c, d, block[9], 5, 568446438);
      d = gg(d, a, b, c, block[14], 9, -1019803690);
      c = gg(c, d, a, b, block[3], 14, -187363961);
      b = gg(b, c, d, a, block[8], 20, 1163531501);
      a = gg(a, b, c, d, block[13], 5, -1444681467);
      d = gg(d, a, b, c, block[2], 9, -51403784);
      c = gg(c, d, a, b, block[7], 14, 1735328473);
      b = gg(b, c, d, a, block[12], 20, -1926607734);

      a = hh(a, b, c, d, block[5], 4, -378558);
      d = hh(d, a, b, c, block[8], 11, -2022574463);
      c = hh(c, d, a, b, block[11], 16, 1839030562);
      b = hh(b, c, d, a, block[14], 23, -35309556);
      a = hh(a, b, c, d, block[1], 4, -1530992060);
      d = hh(d, a, b, c, block[4], 11, 1272893353);
      c = hh(c, d, a, b, block[7], 16, -155497632);
      b = hh(b, c, d, a, block[10], 23, -1094730640);
      a = hh(a, b, c, d, block[13], 4, 681279174);
      d = hh(d, a, b, c, block[0], 11, -358537222);
      c = hh(c, d, a, b, block[3], 16, -722521979);
      b = hh(b, c, d, a, block[6], 23, 76029189);
      a = hh(a, b, c, d, block[9], 4, -640364487);
      d = hh(d, a, b, c, block[12], 11, -421815835);
      c = hh(c, d, a, b, block[15], 16, 530742520);
      b = hh(b, c, d, a, block[2], 23, -995338651);

      a = ii(a, b, c, d, block[0], 6, -198630844);
      d = ii(d, a, b, c, block[7], 10, 1126891415);
      c = ii(c, d, a, b, block[14], 15, -1416354905);
      b = ii(b, c, d, a, block[5], 21, -57434055);
      a = ii(a, b, c, d, block[12], 6, 1700485571);
      d = ii(d, a, b, c, block[3], 10, -1894986606);
      c = ii(c, d, a, b, block[10], 15, -1051523);
      b = ii(b, c, d, a, block[1], 21, -2054922799);
      a = ii(a, b, c, d, block[8], 6, 1873313359);
      d = ii(d, a, b, c, block[15], 10, -30611744);
      c = ii(c, d, a, b, block[6], 15, -1560198380);
      b = ii(b, c, d, a, block[13], 21, 1309151649);
      a = ii(a, b, c, d, block[4], 6, -145523070);
      d = ii(d, a, b, c, block[11], 10, -1120210379);
      c = ii(c, d, a, b, block[2], 15, 718787259);
      b = ii(b, c, d, a, block[9], 21, -343485551);

      state[0] = add32(a, state[0]);
      state[1] = add32(b, state[1]);
      state[2] = add32(c, state[2]);
      state[3] = add32(d, state[3]);
    }
    function md5blk(str) {
      const block = [];
      for (let i = 0; i < 64; i += 4) {
        block[i >> 2] = str.charCodeAt(i) +
          (str.charCodeAt(i + 1) << 8) +
          (str.charCodeAt(i + 2) << 16) +
          (str.charCodeAt(i + 3) << 24);
      }
      return block;
    }
    function md51(str) {
      const n = str.length;
      const state = [1732584193, -271733879, -1732584194, 271733878];
      let i;
      for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(str.substring(i - 64, i)));
      str = str.substring(i - 64);
      const tail = Array(16).fill(0);
      for (i = 0; i < str.length; i++) tail[i >> 2] |= str.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) {
        md5cycle(state, tail);
        tail.fill(0);
      }
      tail[14] = n * 8;
      md5cycle(state, tail);
      return state;
    }
    function rhex(n) {
      let s = '';
      for (let j = 0; j < 4; j++) s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16);
      return s;
    }
    function hex(x) {
      return x.map(rhex).join('');
    }
    function add32(a, b) {
      return (a + b) & 0xffffffff;
    }
    return hex(md51(input));
  }

  function bootstrap() {
    try {
      registerMenus();
    } catch (e) {
      console.warn('[JXGXKM] registerMenus failed:', e);
    }

    try {
      observeDom();
    } catch (e) {
      console.warn('[JXGXKM] observeDom failed:', e);
    }

    try {
      if (isCoursePlayPage()) {
        observeVideoElement();
        setTimeout(startMutedAutoplay, 1000);
      }
    } catch (e) {
      console.warn('[JXGXKM] observe video/autoplay failed:', e);
    }

    try {
      tick();
      setInterval(tick, Math.max(1000, Number(CFG.scanIntervalMs) || 3000));
    } catch (e) {
      console.warn('[JXGXKM] start tick loop failed:', e);
    }
  }

  if (document.documentElement) {
    bootstrap();
  } else {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  }
})();
