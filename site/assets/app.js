/* 68 Property — public landing UI. The Telegram bot token is NEVER exposed here. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.DT_CONFIG || {};
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPlaceholder = (value) => !value || /REPLACE_|TEN-TAI-KHOAN|YOUR[_-]SUBDOMAIN|SUBDOMAIN_THAT|example\.invalid|<[^>]+>/i.test(String(value));
  // Accept the real Worker base URL or its canonical /api/lead endpoint.
  // Refuse example domains and incorrect paths before sending customer information.
  function resolveLeadApiEndpoint(raw) {
    if (isPlaceholder(raw)) return { error: 'Chưa nhập địa chỉ Worker thật. Mở site/config.js và thay TEN-TAI-KHOAN bằng subdomain Cloudflare của bạn.' };
    let url;
    try { url = new URL(String(raw).trim()); }
    catch { return { error: 'URL API không hợp lệ. Hãy dán URL Worker từ Cloudflare → Settings → Domains & Routes.' }; }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
        /(^|\.)(example\.(com|org|net)|invalid|test)$/.test(url.hostname)) {
      return { error: 'Địa chỉ Worker phải là URL HTTPS thật, không chứa tham số, tài khoản hoặc URL ví dụ.' };
    }
    const path = url.pathname.replace(/\/+$/,'') || '/';
    if (path === '/') url.pathname = '/api/lead';
    else if (path === '/api/lead') url.pathname = '/api/lead';
    else return { error: 'Sai đường dẫn API. Hãy dùng URL Worker gốc hoặc URL kết thúc bằng /api/lead.' };
    return { url: url.toString() };
  }
  const safeScroll = (el) => el?.scrollIntoView({ behavior: noMotion ? 'auto' : 'smooth', block: 'start' });

  // Mobile menu
  const toggle = $('nav-toggle');
  const nav = $('primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Đóng menu điều hướng' : 'Mở menu điều hướng');
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // Reveal only when IntersectionObserver is supported
  const revealables = [...document.querySelectorAll('[data-reveal]')];
  if ('IntersectionObserver' in window && !noMotion) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -30px 0px', threshold: .06 });
    revealables.forEach(el => io.observe(el));
    document.documentElement.classList.add('js-ready');
  } else {
    revealables.forEach(el => el.classList.add('is-visible'));
  }

  // A specific lot can be selected before requesting a verified quote
  const lotSelect = $('lead-lot');
  document.querySelectorAll('[data-lot]').forEach(card => card.addEventListener('click', () => {
    if (lotSelect) lotSelect.value = card.dataset.lot;
    safeScroll($('nhan-ho-so'));
  }));

  // Image lightbox
  const dialog = $('image-modal');
  const modalImg = $('modal-image');
  const caption = $('image-modal-caption');
  document.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => {
    if (!dialog || !modalImg || !caption) return;
    modalImg.src = button.dataset.image;
    modalImg.alt = button.querySelector('img')?.alt || 'Ảnh thực địa';
    caption.textContent = button.dataset.caption || 'Ảnh thực địa';
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }));
  $('modal-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  // Small, accessible toast for share feedback
  let toastTimer;
  const toast = (message) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('show'), 2500);
  };
  $('share-link')?.addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(location.href); toast('Đã sao chép liên kết'); }
      else toast('Sao chép đường dẫn trong thanh địa chỉ của trình duyệt');
    } catch (err) { if (err?.name !== 'AbortError') toast('Không thể chia sẻ liên kết trên trình duyệt này'); }
  });

  const form = $('lead-form');
  if (!form) return;
  const formStatus = $('lead-status');
  const submit = $('submit-lead');
  const note = $('turnstile-note');
  let widgetId = null;
  let turnstileLoaded = false;
  const setStatus = (message, kind = 'error') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.dataset.type = kind;
  };
  // GET /health never includes form fields or credentials. Used only after a
  // fetch failure, to separate old Worker code from a network/CORS problem.
  async function checkWorkerHealth(apiUrl) {
    const healthUrl = new URL('/health', apiUrl);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(healthUrl.toString(), {
        method: 'GET', mode: 'cors', credentials: 'omit',
        cache: 'no-store', signal: controller.signal
      });
      if (res.status === 404) return 'ROUTE-404';
      if (!res.ok) return 'HEALTH-HTTP';
      const data = await res.json().catch(() => null);
      if (data?.service === '68property-leads' && data?.ok === true) return 'POST-CORS';
      return 'WORKER-OLD';
    } catch { return 'NET-CORS'; }
    finally { window.clearTimeout(timeout); }
  }
  const isNetworkFailure = (error) =>
    error instanceof TypeError || /load failed|failed to fetch|networkerror|network request failed|fetch failed/i.test(String(error?.message || ''));

  // Turnstile public site key only. The secret key is checked server-side.
  function setupTurnstile() {
    if (isPlaceholder(config.turnstileSiteKey)) {
      if (note) note.textContent = 'Form chưa được kích hoạt. Vui lòng cấu hình Turnstile và đường dẫn API trước khi chạy quảng cáo.';
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (!window.turnstile) return;
      try {
        widgetId = window.turnstile.render('#turnstile-container', {
          sitekey: config.turnstileSiteKey,
          theme: 'light',
          language: 'vi',
          'expired-callback': () => setStatus('Phiên xác minh hết hạn. Vui lòng xác minh lại.'),
          action: 'lead',
          'error-callback': () => setStatus('Không thể xác minh chống spam. Hãy tải lại trang và thử lại.')
        });
        turnstileLoaded = true;
        if (note) note.hidden = true;
      } catch (_) {
        if (note) note.textContent = 'Không tải được hệ thống xác minh. Vui lòng thử lại sau.';
      }
    };
    s.onerror = () => {
      if (note) note.textContent = 'Kết nối đến Turnstile không thành công. Vui lòng thử lại sau.';
    };
    document.head.appendChild(s);
  }
  // Keep third-party code off the critical rendering path until the visitor approaches the form.
  if ('IntersectionObserver' in window) {
    const captchaObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) { setupTurnstile(); captchaObserver.disconnect(); }
    }, { rootMargin: '500px 0px' });
    captchaObserver.observe(form);
  } else { setupTurnstile(); }

  const readyApi = resolveLeadApiEndpoint(config.apiEndpoint);
  if (readyApi.error) {
    if (note) { note.hidden = false; note.textContent = 'Biểu mẫu tạm chưa kết nối hệ thống nhận hồ sơ. Vui lòng báo quản trị viên cấu hình URL Cloudflare Worker.'; }
    submit.disabled = true;
    setStatus('Biểu mẫu đang bảo trì (mã CONFIG-API). Vui lòng quay lại sau khi hệ thống được cấu hình.');
  }

  const normalizePhone = (input) => {
    let value = input.trim().replace(/[().\s-]/g, '');
    if (value.startsWith('+84')) value = '0' + value.slice(3);
    else if (value.startsWith('84')) value = '0' + value.slice(2);
    return value;
  };

  // The form sends a minimal, consented payload to the configured cross-origin Worker API.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    const name = $('lead-name').value.trim().replace(/\s+/g, ' ');
    const phone = normalizePhone($('lead-phone').value);
    const consent = $('lead-consent').checked;

    if (!/^[\p{L}\p{M} .'-]{2,70}$/u.test(name)) {
      setStatus('Họ tên cần từ 2–70 ký tự và không chứa số hoặc ký tự đặc biệt.');
      $('lead-name').focus();
      return;
    }
    if (!/^0[35789]\d{8}$/.test(phone)) {
      setStatus('Vui lòng nhập số điện thoại di động Việt Nam hợp lệ (10 chữ số).');
      $('lead-phone').focus();
      return;
    }
    if (!consent) {
      setStatus('Vui lòng xác nhận đồng ý để chúng tôi liên hệ và chuyển yêu cầu đến nhóm phụ trách.');
      $('lead-consent').focus();
      return;
    }
    const api = resolveLeadApiEndpoint(config.apiEndpoint);
    if (api.error) {
      setStatus(api.error);
      return;
    }
    if (isPlaceholder(config.turnstileSiteKey) || !turnstileLoaded || !window.turnstile) {
      setStatus('Biểu mẫu chưa được cấu hình xác minh chống spam. Vui lòng liên hệ đơn vị quản trị website.');
      return;
    }
    const token = window.turnstile.getResponse(widgetId);
    if (!token) {
      setStatus('Vui lòng hoàn thành bước xác minh trước khi gửi.');
      return;
    }

    const params = new URLSearchParams(location.search);
    const utm = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const value = params.get(key) || '';
      if (value) utm[key] = value.slice(0, 80);
    }
    const payload = {
      name, phone,
      need: $('lead-need').value,
      lot: $('lead-lot').value,
      consent,
      website: $('lead-website').value,
      turnstileToken: token,
      utm
    };
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    setStatus('Đang gửi thông tin đến bộ phận phụ trách...', 'success');
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      let res;
      try {
        res = await fetch(api.url, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          referrerPolicy: 'strict-origin',
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally { window.clearTimeout(timeout); }
      const result = await res.json().catch(() => ({}));
      if (res.status === 404) throw new Error('Không tìm thấy đường dẫn API trên Worker. Vào Cloudflare → Edit code, cập nhật worker.js mới, rồi kiểm tra /health.');
      if (!res.ok || !result.ok) throw new Error(result.message || `Hệ thống trả về HTTP ${res.status}. Vui lòng kiểm tra cấu hình Worker.`);
      setStatus(result.duplicate ? 'Yêu cầu của bạn đã được tiếp nhận trước đó. Bộ phận phụ trách sẽ liên hệ khi xử lý.' : 'Đã gửi yêu cầu thành công. Cảm ơn bạn! Bộ phận phụ trách sẽ liên hệ để trao đổi hồ sơ.', 'success');
      form.reset();
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStatus('Kết nối tư vấn quá thời gian chờ (TIMEOUT). Chưa thể xác nhận thông tin đã được tiếp nhận. Vui lòng báo bộ phận phụ trách trước khi gửi lại.');
      } else if (isNetworkFailure(error)) {
        const reason = await checkWorkerHealth(api.url);
        // Never show Safari's raw "Load failed" or leak name/phone in diagnostics.
        const messages = {
          'ROUTE-404': 'Worker chưa cập nhật mã mới: /health trả về 404.',
          'HEALTH-HTTP': 'Worker đang trả lỗi cho /health; cần xem trạng thái triển khai.',
          'WORKER-OLD': 'Đang kết nối nhầm Worker hoặc Worker chưa cập nhật mã mới.',
          'POST-CORS': 'Worker có phản hồi /health, nhưng POST bị chặn hoặc ngắt. Kiểm tra CORS/OPTIONS và ALLOWED_ORIGIN.',
          'NET-CORS': 'Không truy cập được Worker hoặc bị chặn bởi CORS/DNS/mạng. Kiểm tra URL API và ALLOWED_ORIGIN.'
        };
        // A failed POST might already have reached Telegram. Do not suggest immediate retries.
        setStatus('Không thể xác nhận đã gửi yêu cầu (mã ' + reason + '). Vui lòng liên hệ bộ phận tư vấn hoặc kiểm tra lại trước khi gửi lần nữa.');
        console.warn('[68Property lead transport]', reason, messages[reason]);
      } else {
        // Only controlled server messages should appear: do not show arbitrary raw browser errors.
        const message = String(error?.message || '');
        setStatus(/^(Không tìm thấy đường dẫn API|Hệ thống trả về HTTP|Gửi yêu cầu không thành công|Chưa |Vui lòng |Hệ thống |Xác minh |Quá nhiều )/.test(message)
          ? message : 'Không gửi được yêu cầu (mã API-ERROR). Vui lòng báo bộ phận tư vấn kiểm tra.');
      }
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      window.turnstile?.reset?.(widgetId);
    }
  });
})();
