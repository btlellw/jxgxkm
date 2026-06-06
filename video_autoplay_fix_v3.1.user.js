// ==UserScript==
// @name         江西省公需科目培训平台 - 视频自动播放修复 V3.1（永久静音）
// @namespace    http://tampermonkey.net/
// @version      3.2.0
// @description  全程静音播放，永久阻止pause()，完美解决自动播放问题
// @author       Your Name
// @match        https://*/train/courseware/cc*
// @match        http://*/train/courseware/cc*
// @match        *://jxgxkm.wsglw.net/*
// @icon         https://www.google.com/s2/favicons?domain=91huayi.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      qyapi.weixin.qq.com
// @connect      *
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[V3.1] 永久静音播放版本已加载', 'color: #00ff00; font-weight: bold; font-size: 14px;');

    var isPlaying = false;
    var videoElement = null;
    var pauseProtectionEnabled = false;
    var pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    var CFG = {
        webhookUrl: GM_getValue('webhookUrl', ''),
        autoSignIn: GM_getValue('autoSignIn', true),
        autoEnterExam: GM_getValue('autoEnterExam', true),
        saveQuestionBank: GM_getValue('saveQuestionBank', true),
        autoContinueAfterPass: GM_getValue('autoContinueAfterPass', true),
        debug: GM_getValue('debug', true)
    };

    var STATE = {
        signing: false,
        answering: false,
        submittingExam: false,
        enteringExam: false,
        continuingAfterPass: false,
        lastQuestionKey: '',
        lastQuestionAt: 0,
        lastExamSubmitAt: 0,
        lastSignNotifyAt: 0,
        lastSignKey: '',
        notifiedQrSrc: GM_getValue('notifiedQrSrc', '')
    };

    function bizLog() {
        if (!CFG.debug) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[JXGXKM-BIZ]');
        console.log.apply(console, args);
    }

    function normalizePageText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function isCoursePlayPage() { return /\/train\/courseware\/cc/i.test(location.pathname); }
    function isExamPage() { return /\/train\/courseware\/exam/i.test(location.pathname); }
    function isFaceValidPage() { return /\/train\/courseware\/facevalid/i.test(location.pathname); }
    function isExamPassPage() {
        var text = normalizePageText(document.body && document.body.textContent || '');
        return /\/train\/courseware\//i.test(location.pathname) &&
            /已经通过了本课件的考试|恭喜您/.test(text) &&
            /继续学习/.test(text);
    }

    // ==================== 核心：永久劫持video.pause() ====================
    function protectVideoFromPause() {
        var mediaProto = pageWindow.HTMLMediaElement && pageWindow.HTMLMediaElement.prototype || HTMLMediaElement.prototype;
        if (mediaProto.__jxgxkmPauseProtected) return;
        var originalPause = mediaProto.pause;

        mediaProto.pause = function() {
            if (pauseProtectionEnabled) {
                console.log('%c[V3.1] 🛡️ 永久阻止pause()！保持播放', 'color: #ff6600; font-weight: bold;');
                return; // 完全阻止暂停
            }
            // 只有用户点击暂停按钮时才允许
            console.log('[V3.1] pause()已被允许（保护未启用）');
            return originalPause.apply(this, arguments);
        };
        mediaProto.__jxgxkmPauseProtected = true;

        console.log('[V3.1] ✓ pause永久保护已就绪');
    }

    // ==================== 劫持播放器配置 ====================
    function hijackPlayerConfig() {
        var originalPolyvPlayer = pageWindow.polyvPlayer;
        var playerConfigured = false;

        Object.defineProperty(pageWindow, 'polyvPlayer', {
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
                    pageWindow.player = player;

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

    // ==================== 强制静音播放 ====================
    function startMutedAutoplay() {
        console.log('%c[V3.1] 🎬 启动静音自动播放', 'color: #00aaff; font-weight: bold;');

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
                    console.log('%c[V3.1] ✓ 静音播放成功！', 'color: #00ff00; font-weight: bold; font-size: 16px;');
                    isPlaying = true;
                    clearInterval(playInterval);

                    // 启动永久保护
                    pauseProtectionEnabled = true;
                    console.log('%c[V3.1] 🛡️ pause永久保护已启动（不会解除）', 'color: #ff6600; font-weight: bold;');

                    // 监听状态
                    monitorVideoState();

                    // 显示静音提示
                    showMutedNotification();

                }).catch(function(error) {
                    if (attempts >= maxAttempts) {
                        clearInterval(playInterval);
                        console.error('%c[V3.1] 达到最大尝试次数', 'color: #ff0000; font-weight: bold;');
                        showManualPlayButton();
                    }
                });
            }
        }, 400);
    }

    // ==================== 监控视频状态 ====================
    function monitorVideoState() {
        if (!videoElement) return;

        console.log('[V3.1] 开始监控视频状态（全程）');

        // 监听暂停事件（备用方案）
        videoElement.addEventListener('pause', function(e) {
            if (!pauseProtectionEnabled) return;
            if (videoElement && videoElement.ended) return; // 视频播放结束时不恢复播放

            console.warn('%c[V3.1] ⚠️ 检测到pause事件！立即恢复...', 'color: #ff9900; font-weight: bold;');

            setTimeout(function() {
                if (videoElement && videoElement.paused && !videoElement.ended) {
                    // 确保静音
                    videoElement.muted = true;
                    videoElement.volume = 0;

                    videoElement.play().then(function() {
                        console.log('[V3.1] ✓ 已恢复播放');
                    }).catch(function(err) {
                        console.error('[V3.1] 恢复失败:', err.name);
                        // 如果恢复失败，保持静音并重试
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
            console.log('[V3.1] ▶ 播放中');
            isPlaying = true;
            // 确保静音
            videoElement.muted = true;
            videoElement.volume = 0;
        });

        // 时间更新事件（确认播放进度）
        var lastTime = 0;
        videoElement.addEventListener('timeupdate', function() {
            var currentTime = Math.floor(videoElement.currentTime);
            if (currentTime > lastTime && currentTime % 60 === 0) {
                console.log('[V3.1] 播放进度: ' + Math.floor(currentTime / 60) + '分钟');
                lastTime = currentTime;
            }
        });

        // 定期检查（每2秒）
        setInterval(function() {
            if (videoElement && videoElement.paused && !videoElement.ended && isPlaying && pauseProtectionEnabled) {
                console.warn('[V3.1] 定期检查：检测到暂停，恢复播放');
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

            // 5秒后淡出
            setTimeout(function() {
                notification.fadeOut(500, function() {
                    $(this).remove();
                });
            }, 5000);
        }
    }

    // ==================== 手动播放按钮 ====================
    function showManualPlayButton() {
        var checkJquery = setInterval(function() {
            if (typeof $ !== 'undefined') {
                clearInterval(checkJquery);
                createButton();
            }
        }, 100);

        function createButton() {
            console.log('[V3.1] 显示手动播放按钮');

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
                console.log('[V3.1] 用户点击播放');
                $(this).fadeOut(300, function() { $(this).remove(); });

                if (videoElement) {
                    videoElement.muted = true;
                    videoElement.volume = 0;
                    videoElement.play().then(function() {
                        console.log('%c[V3.1] ✓ 用户交互后播放成功！', 'color: #00ff00; font-weight: bold;');
                        isPlaying = true;
                        pauseProtectionEnabled = true;
                        monitorVideoState();
                        showMutedNotification();
                    });
                }
            });
        }
    }

    // ==================== 禁用原有错误逻辑 ====================
    function disableBuggyCode() {
        Object.defineProperty(pageWindow, 's2j_onPlayerInitOver', {
            set: function(fn) {},
            get: function() {
                return function(params) {
                    console.log('[V3.1] 跳过s2j_onPlayerInitOver');
                };
            },
            configurable: true
        });

        Object.defineProperty(pageWindow, 's2j_onPlayStart', {
            set: function(fn) {},
            get: function() {
                return function() {
                    console.log('[V3.1] 延迟处理s2j_onPlayStart');

                    if (pageWindow.watch_start_time > 0 && pageWindow.player) {
                        setTimeout(function() {
                            console.log('[V3.1] 延迟seek到:', pageWindow.watch_start_time);
                            try {
                                pageWindow.player.j2s_seekVideo(pageWindow.watch_start_time);
                            } catch (e) {}
                        }, 2000);
                    }
                };
            },
            configurable: true
        });
    }

    // ==================== 监听video元素 ====================
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

    // ==================== 手动控制函数 ====================
    function manualMutedPlay() {
        console.log('[手动] 静音播放');
        var video = document.querySelector('video');
        if (video) {
            video.muted = true;
            video.volume = 0;
            video.play().then(function() {
                console.log('[手动] 播放成功');
                pauseProtectionEnabled = true;
                isPlaying = true;
            });
        }
    }
    window.mutedPlay = manualMutedPlay;
    pageWindow.mutedPlay = manualMutedPlay;

    function manualDisablePauseProtection() {
        pauseProtectionEnabled = false;
        console.log('[手动] pause保护已禁用');
    }
    window.disablePauseProtection = manualDisablePauseProtection;
    pageWindow.disablePauseProtection = manualDisablePauseProtection;

    function manualEnablePauseProtection() {
        pauseProtectionEnabled = true;
        console.log('[手动] pause保护已启用');
    }
    window.enablePauseProtection = manualEnablePauseProtection;
    pageWindow.enablePauseProtection = manualEnablePauseProtection;

    // ==================== 启动所有修复 ====================
    console.log('[V3.1] 部署所有修复方案...');

    if (isCoursePlayPage()) {
        protectVideoFromPause();
        hijackPlayerConfig();
        disableBuggyCode();
        observeVideoElement();

        pageWindow.addEventListener('load', function() {
        console.log('[V3.1] 页面加载完成');
        setTimeout(startMutedAutoplay, 1000);
        });

    console.log('%c[V3.1] ✓ 永久静音保护已启动', 'color: #00ff00; font-weight: bold;');
    console.log('%c命令: mutedPlay() - 手动播放 | disablePauseProtection() - 禁用保护', 'color: #ffaa00;');

    }

    // ==================== Business automation module ====================
    (function businessAutomation() {
        var SELECTORS = {
            qrCode: '#imgQRCode',
            signButton: '.signBtn',
            examButton: '#jrks',
            submitButtons: [
                '.but2_a[onclick*="tijiao"]',
                'span[onclick*="tijiao"]',
                '[onclick*="tijiao"]',
                'button[type="submit"]',
                'input[type="submit"]',
                'button[onclick*="submit"]',
                'a[onclick*="submit"]',
                '.submit',
                '.btn-submit'
            ]
        };

        function log() {
            if (!CFG.debug) return;
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[JXGXKM-BIZ]');
            console.log.apply(console, args);
        }

        function sleep(ms) {
            return new Promise(function(resolve) { setTimeout(resolve, ms); });
        }

        function notify(title, text) {
            try {
                GM_notification({ title: title, text: text, timeout: 5000 });
            } catch (e) {
                log(title, text);
            }
        }

        function normalizeText(text) {
            return (text || '').replace(/\s+/g, ' ').trim();
        }

        function absoluteUrl(url) {
            try {
                return new URL(url, location.origin).href;
            } catch (e) {
                return url || '';
            }
        }

        function isVisible(el) {
            if (!el) return false;
            var style = window.getComputedStyle(el);
            var rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }

        function clickElement(el) {
            if (!el) return false;
            var target = el.closest && el.closest('[onclick], button, a, input, span') || el;
            try {
                target.click();
                return true;
            } catch (e) {}
            try {
                var EventCtor = target.ownerDocument.defaultView.MouseEvent || MouseEvent;
                target.dispatchEvent(new EventCtor('mouseover', { bubbles: true, cancelable: true }));
                target.dispatchEvent(new EventCtor('mousedown', { bubbles: true, cancelable: true }));
                target.dispatchEvent(new EventCtor('mouseup', { bubbles: true, cancelable: true }));
                target.click();
                return true;
            } catch (err) {
                log('click failed:', err.message || err);
                return false;
            }
        }

        function requestJson(url, payload, headers, timeoutMs) {
            return new Promise(function(resolve, reject) {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: url,
                    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
                    data: JSON.stringify(payload),
                    timeout: timeoutMs || 30000,
                    onload: function(res) {
                        try {
                            resolve({ status: res.status, body: JSON.parse(res.responseText || '{}') });
                        } catch (e) {
                            resolve({ status: res.status, body: res.responseText });
                        }
                    },
                    onerror: reject,
                    ontimeout: function() { reject(new Error('request timeout')); }
                });
            });
        }

        function base64ToBytes(base64) {
            return Uint8Array.from(atob(base64), function(ch) { return ch.charCodeAt(0); });
        }

        function md5HexFromBytes(bytes) {
            var s = Array.from(bytes, function(byte) { return String.fromCharCode(byte); }).join('');
            return md5(s);
        }

        async function sendWeComText(content) {
            if (!CFG.webhookUrl) {
                notify('JXGXKM', 'QR detected, configure WeCom webhook first.');
                return;
            }
            var res = await requestJson(CFG.webhookUrl, {
                msgtype: 'text',
                text: { content: content }
            });
            log('WeCom text response:', res);
        }

        async function sendWeComImage(dataUrl) {
            var match = /^data:image\/\w+;base64,(.+)$/i.exec(dataUrl || '');
            if (!match || !CFG.webhookUrl) return;
            var base64 = match[1];
            var md5Value = md5HexFromBytes(base64ToBytes(base64));
            var res = await requestJson(CFG.webhookUrl, {
                msgtype: 'image',
                image: { base64: base64, md5: md5Value }
            });
            log('WeCom image response:', res);
        }

        async function sendWeComQr(imageSrc) {
            var content = [
                'JXGXKM needs APP face verification to continue.',
                'Page: ' + location.href,
                imageSrc.indexOf('data:image/') === 0 ? 'QR image is attached.' : 'QR: ' + absoluteUrl(imageSrc)
            ].join('\n');
            await sendWeComText(content);
            if (imageSrc.indexOf('data:image/') === 0) await sendWeComImage(imageSrc);
        }

        async function handleFaceQr() {
            var qr = document.querySelector(SELECTORS.qrCode);
            if (!qr) return false;
            var src = qr.getAttribute('src') || '';
            if (!src || src === STATE.notifiedQrSrc) return true;
            STATE.notifiedQrSrc = src;
            GM_setValue('notifiedQrSrc', src);
            log('QR detected');
            try {
                await sendWeComQr(src);
            } catch (err) {
                console.error('[JXGXKM-BIZ] QR notification failed:', err);
                notify('JXGXKM', 'QR notification failed: ' + (err.message || err));
            }
            return true;
        }

        async function completeSignIn(signButton) {
            var handled = false;
            try {
                if (typeof pageWindow.course_ware_sign === 'function') {
                    pageWindow.course_ware_sign();
                    handled = true;
                }
            } catch (err) {
                log('course_ware_sign failed:', err.message || err);
            }
            document.querySelectorAll('.sign-in-menu').forEach(function(el) { el.innerHTML = ''; });
            document.querySelectorAll('.sign-in').forEach(function(el) { el.remove(); });
            try {
                if (pageWindow.player && typeof pageWindow.player.j2s_resumeVideo === 'function') {
                    pageWindow.player.j2s_resumeVideo();
                    handled = true;
                }
            } catch (err) {
                log('resume after sign failed:', err.message || err);
            }
            if (!handled && signButton) handled = clickElement(signButton);
            return handled;
        }

        async function handleSignIn() {
            if (!CFG.autoSignIn || STATE.signing) return false;
            var signButton = Array.from(document.querySelectorAll(SELECTORS.signButton)).find(isVisible);
            if (!signButton) return false;
            var signText = normalizeText(document.querySelector('.sign-in-wrap_content') && document.querySelector('.sign-in-wrap_content').textContent || signButton.textContent || 'sign');
            var signKey = signText + '|' + location.href;
            if (STATE.lastSignKey === signKey && Date.now() - STATE.lastSignNotifyAt < 5000) return false;
            STATE.lastSignKey = signKey;
            STATE.lastSignNotifyAt = Date.now();
            STATE.signing = true;
            try {
                log('sign button detected');
                notify('JXGXKM', '检测到学习签到，正在确认并恢复播放。');
                sendWeComText('JXGXKM detected a course sign-in and is confirming it.\nPage: ' + location.href).catch(function(err) {
                    log('sign push failed:', err.message || err);
                });
                return await completeSignIn(signButton);
            } finally {
                await sleep(1500);
                STATE.signing = false;
            }
        }

        function getVisibleChoiceGroups() {
            var inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
                .filter(function(input) { return !input.disabled && isVisible(input); });
            var groups = new Map();
            inputs.forEach(function(input) {
                var key = input.name || input.value || 'choice-' + groups.size;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(input);
            });
            return Array.from(groups.values()).filter(function(group) { return group.length >= 2; });
        }

        function getInputLabel(input) {
            var id = input.getAttribute('id');
            var byFor = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
            var wrapper = input.closest('label, li, .option, .answer, dd, p, div');
            var text = normalizeText((byFor || wrapper || input).textContent);
            return text || input.value || '';
        }

        function nearestQuestionRoot(group) {
            var first = group[0];
            var node = first && first.closest('li, .question, .exam-question, .test-question, .paper-question, .topic, .tm, .item, .subject, .exam-item, .question-item, dl, div');
            while (node && node !== document.body) {
                var count = node.querySelectorAll('input[type="radio"], input[type="checkbox"]').length;
                if (count <= Math.max(group.length + 4, 8)) return node;
                node = node.parentElement;
            }
            return first ? first.closest('form') || first.parentElement : null;
        }

        function collectQuestionDataFromGroup(group) {
            var root = nearestQuestionRoot(group);
            if (!root) return null;
            var options = group.map(function(input, index) {
                return {
                    input: input,
                    value: input.value || '',
                    text: normalizeText(getInputLabel(input)).replace(/^[A-H][\.\u3001\s]+/i, '') || String.fromCharCode(65 + index)
                };
            });
            var question = normalizeText(root.textContent || '');
            options.forEach(function(option) {
                if (option.text) question = question.replace(option.text, ' ');
            });
            question = normalizeText(question).replace(/^[\d\s\.\u3001]+/, '');
            if (!question || !options.length) return null;
            return {
                root: root,
                text: question,
                options: options.map(function(option) { return { text: option.text, value: option.value }; }),
                inputs: group
            };
        }

        function getQuestionKey(questionData) {
            return md5(questionData.text + '\n' + questionData.options.map(function(option) { return option.text; }).join('|'));
        }

        function loadQuestionBank() {
            try {
                return JSON.parse(GM_getValue('questionBank', '{}') || '{}');
            } catch (e) {
                return {};
            }
        }

        function saveQuestionBank(bank) {
            GM_setValue('questionBank', JSON.stringify(bank));
        }

        function getBankAnswers(questionData) {
            var item = loadQuestionBank()[getQuestionKey(questionData)];
            return item && item.answers || null;
        }

        function loadPendingExamAnswers() {
            try {
                return JSON.parse(GM_getValue('pendingExamAnswers', '[]') || '[]');
            } catch (e) {
                return [];
            }
        }

        function savePendingExamAnswer(questionData, answers) {
            if (!answers || !answers.length) return false;
            var key = getQuestionKey(questionData);
            var pending = loadPendingExamAnswers().filter(function(item) { return item.key !== key; });
            pending.push({
                key: key,
                question: questionData.text,
                options: questionData.options.map(function(option) { return option.text; }),
                answers: answers,
                savedAt: new Date().toISOString()
            });
            GM_setValue('pendingExamAnswers', JSON.stringify(pending));
            return true;
        }

        function promotePendingExamAnswers() {
            var pending = loadPendingExamAnswers();
            if (!pending.length) return 0;
            GM_setValue('pendingExamAnswers', '[]');
            log('cleared pending exam selections after pass page:', pending.length);
            return pending.length;
        }

        async function handleQuiz() {
            if (STATE.answering) return;
            var groups = getVisibleChoiceGroups();
            if (!groups.length) return;
            STATE.answering = true;
            try {
                for (var i = 0; i < groups.length; i++) {
                    var questionData = collectQuestionDataFromGroup(groups[i]);
                    if (!questionData) continue;
                    var questionKey = getQuestionKey(questionData);
                    var checked = [];
                    questionData.inputs.forEach(function(input, index) {
                        if (input.checked) checked.push(String.fromCharCode(65 + index));
                    });
                    if (checked.length) {
                        savePendingExamAnswer(questionData, checked);
                    } else if (questionKey !== STATE.lastQuestionKey) {
                        STATE.lastQuestionKey = questionKey;
                        STATE.lastQuestionAt = Date.now();
                        var bankAnswers = getBankAnswers(questionData);
                        if (bankAnswers) log('question bank has saved answers for current question:', bankAnswers);
                    }
                    await sleep(300);
                }
            } catch (err) {
                console.error('[JXGXKM-BIZ] answer failed:', err);
            } finally {
                await sleep(1500);
                STATE.answering = false;
            }
        }

        function allQuestionsAnswered() {
            var groups = getVisibleChoiceGroups();
            return groups.length > 0 && groups.every(function(group) {
                return group.some(function(input) { return input.checked; });
            });
        }

        function snapshotAnsweredQuestions() {
            var saved = 0;
            getVisibleChoiceGroups().forEach(function(group) {
                var q = collectQuestionDataFromGroup(group);
                if (!q) return;
                var answers = [];
                q.inputs.forEach(function(input, index) {
                    if (input.checked) answers.push(String.fromCharCode(65 + index));
                });
                if (answers.length && savePendingExamAnswer(q, answers)) saved += 1;
            });
            if (saved) log('snapshot answered questions:', saved);
            return saved;
        }

        function findExamSubmitButton() {
            for (var i = 0; i < SELECTORS.submitButtons.length; i++) {
                var button = Array.from(document.querySelectorAll(SELECTORS.submitButtons[i])).find(isVisible);
                if (button) return button;
            }
            return Array.from(document.querySelectorAll('button, a, span, div, input[type="button"], input[type="submit"]')).find(function(el) {
                if (!isVisible(el)) return false;
                var text = normalizeText(el.textContent || el.value || el.getAttribute('title') || '');
                return /交卷|提交|提交试卷|提交答案|完成考试|submit|hand\s*in/i.test(text);
            }) || null;
        }

        async function remindManualSubmitIfComplete() {
            if (STATE.submittingExam || !isExamPage()) return false;
            if (Date.now() - STATE.lastExamSubmitAt < 60000) return false;
            if (!allQuestionsAnswered()) return false;
            var button = findExamSubmitButton();
            if (!button) return false;
            STATE.submittingExam = true;
            STATE.lastExamSubmitAt = Date.now();
            try {
                var saved = snapshotAnsweredQuestions();
                log('exam appears complete; waiting for manual submit, saved selections:', saved);
                notify('JXGXKM', '试题已答完，已保存已选项草稿；请手动点击交卷。');
                sendWeComText('JXGXKM exam appears complete. Saved selected options locally; please submit manually.\nPage: ' + location.href).catch(function(err) {
                    log('manual submit push failed:', err.message || err);
                });
                return true;
            } finally {
                await sleep(3000);
                STATE.submittingExam = false;
            }
        }

        function examButtonReady(button) {
            if (!button) return false;
            var wrapper = button.closest('.jrks');
            var bg = wrapper ? window.getComputedStyle(wrapper).backgroundColor : '';
            var disabledByAlert = /alert\s*\(/i.test(button.getAttribute('onclick') || '');
            var enabledByPage = typeof (pageWindow.toExam || window.toExam) === 'function' && !disabledByAlert;
            var enabledByColor = /34,\s*152,\s*239|#2298ef/i.test(bg);
            return enabledByPage || enabledByColor || button.getAttribute('href');
        }

        async function enterExamIfReady() {
            if (!CFG.autoEnterExam || STATE.enteringExam || !isCoursePlayPage()) return false;
            var examButton = document.querySelector('#jrks');
            if (!examButton || !examButtonReady(examButton)) return false;
            STATE.enteringExam = true;
            try {
                log('enter exam');
                if (typeof pageWindow.toExam === 'function') pageWindow.toExam();
                else clickElement(examButton);
                return true;
            } finally {
                await sleep(2000);
                STATE.enteringExam = false;
            }
        }

        function findContinueStudyLink() {
            return Array.from(document.querySelectorAll('span[onclick*="/train/courseware/cc?cwid="], a[href*="/train/courseware/cc?cwid="], [onclick*="/train/courseware/cc?cwid="]')).find(function(el) {
                if (!isVisible(el)) return false;
                return /继续学习/.test(normalizeText(el.textContent || el.value || '')) ||
                    (el.getAttribute('onclick') || el.getAttribute('href') || '').indexOf('/train/courseware/cc?cwid=') >= 0;
            }) || null;
        }

        async function runExamPassPage() {
            var cleared = promotePendingExamAnswers();
            if (cleared) notify('JXGXKM', '考试通过页已出现，已清理本次答题草稿。');
            if (!CFG.autoContinueAfterPass || STATE.continuingAfterPass) return;
            var next = findContinueStudyLink();
            if (!next) return;
            STATE.continuingAfterPass = true;
            try {
                await sleep(2000);
                clickElement(next);
            } finally {
                await sleep(3000);
                STATE.continuingAfterPass = false;
            }
        }

        function registerBizMenus() {
            if (typeof GM_registerMenuCommand !== 'function') return;
            GM_registerMenuCommand('Set WeCom Webhook', function() {
                var value = prompt('WeCom robot webhook URL:', CFG.webhookUrl || '');
                if (value !== null) { GM_setValue('webhookUrl', value.trim()); location.reload(); }
            });
            GM_registerMenuCommand('Export Question Bank', function() {
                console.log('[JXGXKM-BIZ] question bank:', loadQuestionBank());
                notify('JXGXKM', 'Question bank printed to console.');
            });
            GM_registerMenuCommand('Import Question Bank JSON', function() {
                var value = prompt('Paste question bank JSON:', '{}');
                if (value === null) return;
                try {
                    var parsed = JSON.parse(value);
                    GM_setValue('questionBank', JSON.stringify(parsed));
                    notify('JXGXKM', 'Question bank imported.');
                } catch (err) {
                    notify('JXGXKM', 'Invalid question bank JSON.');
                }
            });
            GM_registerMenuCommand('Export Pending Selections', function() {
                console.log('[JXGXKM-BIZ] pending selections:', loadPendingExamAnswers());
                notify('JXGXKM', 'Pending selections printed to console.');
            });
            GM_registerMenuCommand('Clear Question Bank', function() {
                if (confirm('Clear local question bank?')) { GM_setValue('questionBank', '{}'); notify('JXGXKM', 'Question bank cleared.'); }
            });
        }

        async function bizTick() {
            try {
                await handleFaceQr();
                if (isCoursePlayPage()) {
                    await handleSignIn();
                    await handleQuiz();
                    await enterExamIfReady();
                } else if (isFaceValidPage()) {
                    await handleFaceQr();
                } else if (isExamPassPage()) {
                    await runExamPassPage();
                } else if (isExamPage()) {
                    await handleQuiz();
                    await remindManualSubmitIfComplete();
                }
            } catch (err) {
                console.error('[JXGXKM-BIZ] tick failed:', err);
            }
        }

        function md5(input) {
            function cmn(q, a, b, x, s, t) {
                a = add32(add32(a, q), add32(x, t));
                return add32((a << s) | (a >>> (32 - s)), b);
            }
            function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
            function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
            function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
            function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
            function md5cycle(state, block) {
                var a = state[0], b = state[1], c = state[2], d = state[3];
                a = ff(a, b, c, d, block[0], 7, -680876936); d = ff(d, a, b, c, block[1], 12, -389564586);
                c = ff(c, d, a, b, block[2], 17, 606105819); b = ff(b, c, d, a, block[3], 22, -1044525330);
                a = ff(a, b, c, d, block[4], 7, -176418897); d = ff(d, a, b, c, block[5], 12, 1200080426);
                c = ff(c, d, a, b, block[6], 17, -1473231341); b = ff(b, c, d, a, block[7], 22, -45705983);
                a = ff(a, b, c, d, block[8], 7, 1770035416); d = ff(d, a, b, c, block[9], 12, -1958414417);
                c = ff(c, d, a, b, block[10], 17, -42063); b = ff(b, c, d, a, block[11], 22, -1990404162);
                a = ff(a, b, c, d, block[12], 7, 1804603682); d = ff(d, a, b, c, block[13], 12, -40341101);
                c = ff(c, d, a, b, block[14], 17, -1502002290); b = ff(b, c, d, a, block[15], 22, 1236535329);
                a = gg(a, b, c, d, block[1], 5, -165796510); d = gg(d, a, b, c, block[6], 9, -1069501632);
                c = gg(c, d, a, b, block[11], 14, 643717713); b = gg(b, c, d, a, block[0], 20, -373897302);
                a = gg(a, b, c, d, block[5], 5, -701558691); d = gg(d, a, b, c, block[10], 9, 38016083);
                c = gg(c, d, a, b, block[15], 14, -660478335); b = gg(b, c, d, a, block[4], 20, -405537848);
                a = gg(a, b, c, d, block[9], 5, 568446438); d = gg(d, a, b, c, block[14], 9, -1019803690);
                c = gg(c, d, a, b, block[3], 14, -187363961); b = gg(b, c, d, a, block[8], 20, 1163531501);
                a = gg(a, b, c, d, block[13], 5, -1444681467); d = gg(d, a, b, c, block[2], 9, -51403784);
                c = gg(c, d, a, b, block[7], 14, 1735328473); b = gg(b, c, d, a, block[12], 20, -1926607734);
                a = hh(a, b, c, d, block[5], 4, -378558); d = hh(d, a, b, c, block[8], 11, -2022574463);
                c = hh(c, d, a, b, block[11], 16, 1839030562); b = hh(b, c, d, a, block[14], 23, -35309556);
                a = hh(a, b, c, d, block[1], 4, -1530992060); d = hh(d, a, b, c, block[4], 11, 1272893353);
                c = hh(c, d, a, b, block[7], 16, -155497632); b = hh(b, c, d, a, block[10], 23, -1094730640);
                a = hh(a, b, c, d, block[13], 4, 681279174); d = hh(d, a, b, c, block[0], 11, -358537222);
                c = hh(c, d, a, b, block[3], 16, -722521979); b = hh(b, c, d, a, block[6], 23, 76029189);
                a = hh(a, b, c, d, block[9], 4, -640364487); d = hh(d, a, b, c, block[12], 11, -421815835);
                c = hh(c, d, a, b, block[15], 16, 530742520); b = hh(b, c, d, a, block[2], 23, -995338651);
                a = ii(a, b, c, d, block[0], 6, -198630844); d = ii(d, a, b, c, block[7], 10, 1126891415);
                c = ii(c, d, a, b, block[14], 15, -1416354905); b = ii(b, c, d, a, block[5], 21, -57434055);
                a = ii(a, b, c, d, block[12], 6, 1700485571); d = ii(d, a, b, c, block[3], 10, -1894986606);
                c = ii(c, d, a, b, block[10], 15, -1051523); b = ii(b, c, d, a, block[1], 21, -2054922799);
                a = ii(a, b, c, d, block[8], 6, 1873313359); d = ii(d, a, b, c, block[15], 10, -30611744);
                c = ii(c, d, a, b, block[6], 15, -1560198380); b = ii(b, c, d, a, block[13], 21, 1309151649);
                a = ii(a, b, c, d, block[4], 6, -145523070); d = ii(d, a, b, c, block[11], 10, -1120210379);
                c = ii(c, d, a, b, block[2], 15, 718787259); b = ii(b, c, d, a, block[9], 21, -343485551);
                state[0] = add32(a, state[0]); state[1] = add32(b, state[1]); state[2] = add32(c, state[2]); state[3] = add32(d, state[3]);
            }
            function md5blk(str) {
                var block = [];
                for (var i = 0; i < 64; i += 4) {
                    block[i >> 2] = str.charCodeAt(i) + (str.charCodeAt(i + 1) << 8) + (str.charCodeAt(i + 2) << 16) + (str.charCodeAt(i + 3) << 24);
                }
                return block;
            }
            function md51(str) {
                var n = str.length;
                var state = [1732584193, -271733879, -1732584194, 271733878];
                var i;
                for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(str.substring(i - 64, i)));
                str = str.substring(i - 64);
                var tail = Array(16).fill(0);
                for (i = 0; i < str.length; i++) tail[i >> 2] |= str.charCodeAt(i) << ((i % 4) << 3);
                tail[i >> 2] |= 0x80 << ((i % 4) << 3);
                if (i > 55) { md5cycle(state, tail); tail.fill(0); }
                tail[14] = n * 8;
                md5cycle(state, tail);
                return state;
            }
            function rhex(n) {
                var s = '';
                for (var j = 0; j < 4; j++) s += ((n >> (j * 8 + 4)) & 15).toString(16) + ((n >> (j * 8)) & 15).toString(16);
                return s;
            }
            function hex(x) { return x.map(rhex).join(''); }
            function add32(a, b) { return (a + b) & 0xffffffff; }
            return hex(md51(input));
        }

        registerBizMenus();
        bizTick();
        setInterval(bizTick, 2000);
        log('business module started');
    })();

})();
