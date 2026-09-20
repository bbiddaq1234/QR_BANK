/* 계좌 QR — 모든 처리는 브라우저 메모리에서만. 저장소/서버 전송 없음. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('form'), bank = $('bank'), account = $('account'), owner = $('owner');
  var formCard = $('formCard'), resultCard = $('resultCard'), errorEl = $('error');
  var qrEl = $('qr'), toastEl = $('toast');
  var state = null;                       // { bank, owner, digits, shown }
  var toastTimer;

  // 스캔한 폰에서 '복사' 버튼으로 클립보드에 넣으려면, copy.html 이 https 주소에 올라가 있어야 한다.
  // QR은 클립보드에 직접 못 쓴다 — 웹페이지가 열려야만 쓸 수 있다.
  // 여기를 비워두면 QR에는 계좌번호 숫자만 들어간다(스캐너가 검색창으로 넘길 수 있음).
  var COPY_PAGE_URL = '';                 // 예: 'https://내아이디.github.io/gyejwa/copy.html'

  /* ---- 순수 로직 (셀프체크 대상) ---- */

  // 하이픈/공백만 제거한다. 그 외 문자는 남겨서 검증에서 걸리게 한다.
  function normalize(raw) { return String(raw).replace(/[\s-]/g, ''); }

  // 통과 시 null, 실패 시 에러 메시지.
  function validate(bankValue, digits) {
    if (!bankValue) return '은행을 선택해주세요.';
    if (!digits) return '계좌번호를 입력해주세요.';
    if (!/^[0-9]+$/.test(digits)) return '계좌번호는 숫자만 입력해주세요.';
    if (digits.length < 8) return '계좌번호가 너무 짧습니다. 다시 확인해주세요.';
    if (digits.length > 20) return '계좌번호가 너무 깁니다. 다시 확인해주세요.';
    return null;                          // 은행별 실제 규칙은 단정하지 않는다.
  }

  // 계좌정보는 # 뒤(fragment)에 넣는다. fragment는 서버로 전송되지 않는다.
  function qrText(o, base) {
    base = (base === undefined) ? COPY_PAGE_URL : base;
    if (!base) return o.digits;           // 호스팅 전 폴백: 숫자만
    return base + '#a=' + encodeURIComponent(o.digits) +
           '&b=' + encodeURIComponent(o.bank) +
           (o.owner ? '&o=' + encodeURIComponent(o.owner) : '');
  }

  function fileName(o) {
    var safe = function (s) { return String(s).replace(/[\\/:*?"<>|\s]/g, '_'); };
    // 파일명에 계좌번호를 넣지 않는다.
    return '계좌QR_' + safe(o.bank) + (o.owner ? '_' + safe(o.owner) : '') + '.png';
  }

  /* ---- QR ---- */

  // canvas에 직접 그린다. 여백(quiet zone) 4모듈은 QR 표준이고, 없으면 스캔이 안 된다.
  function renderQR(text) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];   // 한글은 UTF-8로
    var qr = qrcode(0, 'M');              // 0 = 데이터 길이에 맞춰 크기 자동 선택
    qr.addData(text);                     // 숫자만이면 Numeric 모드로 잡혀 QR이 작아진다
    qr.make();

    var count = qr.getModuleCount(), cell = 10, margin = cell * 4;
    var size = count * cell + margin * 2;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';            // 다크모드에서도 QR은 항상 흑/백
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
      }
    }

    qrEl.innerHTML = '';
    qrEl.appendChild(canvas);
    return canvas;
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('no blob')); }, 'image/png');
    });
  }

  /* ---- UI ---- */

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  function showResult(o) {
    state = o;
    $('outBank').textContent = o.bank;
    $('outOwner').textContent = o.owner || '-';
    $('outAccount').textContent = o.shown;
    renderQR(qrText(o));
    $('linkBtn').hidden = !COPY_PAGE_URL;  // 호스팅 전에는 복사할 링크가 없다
    formCard.hidden = true;
    resultCard.hidden = false;
    resultCard.scrollIntoView({ block: 'start' });
  }

  function reset(clearInputs) {
    state = null;
    qrEl.innerHTML = '';
    errorEl.textContent = '';
    resultCard.hidden = true;
    formCard.hidden = false;
    if (clearInputs) { form.reset(); bank.value = ''; }
  }

  function canvasOrNull() { return state ? qrEl.querySelector('canvas') : null; }

  /* ---- 이벤트 ---- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = account.value.trim();
    var digits = normalize(raw);
    var msg = validate(bank.value, digits);
    if (msg) { errorEl.textContent = msg; return; }
    errorEl.textContent = '';
    account.value = raw;
    // QR 생성이 실패해도 버튼이 말없이 죽지 않도록 이유를 화면에 띄운다.
    try {
      showResult({ bank: bank.value, owner: owner.value.trim(), digits: digits, shown: raw || digits });
    } catch (err) {
      reset(false);
      errorEl.textContent = 'QR 생성에 실패했습니다: ' + (err && err.message ? err.message : err);
    }
  });

  // file:// 과 http:// 에서는 navigator.clipboard 자체가 없다. execCommand로 떨어뜨린다.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);   // iOS는 select()만으로 선택되지 않는다
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand copy failed'));
    });
  }

  $('copyBtn').addEventListener('click', function () {
    if (!state) return;
    copyText(state.digits).then(
      function () { toast('계좌번호가 복사되었습니다.'); },
      function () { toast('복사에 실패했습니다. 계좌번호를 길게 눌러 복사해주세요.'); }
    );
  });

  // QR이 담고 있는 것과 똑같은 링크를 복사한다. 카톡 등에 붙여넣으면 상대는
  // QR을 찍지 않고도 copy.html 로 바로 이동한다.
  $('linkBtn').addEventListener('click', function () {
    if (!state || !COPY_PAGE_URL) return;
    copyText(qrText(state)).then(
      function () { toast('QR 링크가 복사되었습니다.'); },
      function () { toast('복사에 실패했습니다. 다시 시도해주세요.'); }
    );
  });

  $('saveBtn').addEventListener('click', function () {
    var canvas = canvasOrNull();
    if (!canvas) return;
    toBlob(canvas).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName(state);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('QR 이미지를 저장했습니다.');
    });
  });

  $('shareBtn').addEventListener('click', function () {
    var canvas = canvasOrNull();
    if (!canvas) return;
    toBlob(canvas).then(function (blob) {
      var file = new File([blob], fileName(state), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ title: '내 계좌 QR', files: [file] });
      }
      toast('QR 이미지 저장 후 공유해주세요.');
    }).catch(function (err) {
      if (err && err.name !== 'AbortError') toast('QR 이미지 저장 후 공유해주세요.');
    });
  });

  $('againBtn').addEventListener('click', function () { reset(false); account.focus(); });
  $('clearBtn').addEventListener('click', function () { reset(true); toast('입력한 정보를 모두 삭제했습니다.'); });

  // 저장소를 쓰지 않아도 브라우저가 새로고침 시 입력값을 되살리므로 직접 비운다.
  window.addEventListener('pageshow', function () { reset(true); });

  /* ---- 셀프체크: index.html?selftest ---- */
  if (location.search.indexOf('selftest') !== -1) {
    var eq = function (a, b, label) {
      if (a !== b) throw new Error(label + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    };
    eq(normalize('110-123-456789'), '110123456789', 'normalize hyphen');
    eq(normalize(' 3333 1234 56789 '), '3333123456789', 'normalize space');
    eq(validate('', '110123456789'), '은행을 선택해주세요.', 'no bank');
    eq(validate('카카오뱅크', ''), '계좌번호를 입력해주세요.', 'no account');
    eq(validate('카카오뱅크', '1101a3456'), '계좌번호는 숫자만 입력해주세요.', 'non digit');
    eq(validate('카카오뱅크', '1234567'), '계좌번호가 너무 짧습니다. 다시 확인해주세요.', 'short');
    eq(validate('카카오뱅크', '11111111111111111111111'), '계좌번호가 너무 깁니다. 다시 확인해주세요.', 'long');
    eq(validate('카카오뱅크', '3333123456789'), null, 'valid');
    var sample = { bank: '카카오뱅크', owner: '홍길동', digits: '3333123456789' };
    eq(qrText(sample, ''), '3333123456789', 'qr text falls back to digits');
    // 여기 깨지면 스캔해도 복사 페이지가 안 열린다.
    eq(qrText(sample, 'https://x.example/copy.html'),
       'https://x.example/copy.html#a=3333123456789' +
       '&b=%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%B1%85%ED%81%AC&o=%ED%99%8D%EA%B8%B8%EB%8F%99', 'qr text url');
    eq(qrText({ bank: '토스뱅크', owner: '', digits: '100012345678' }, 'https://x.example/copy.html'),
       'https://x.example/copy.html#a=100012345678&b=%ED%86%A0%EC%8A%A4%EB%B1%85%ED%81%AC',
       'qr text url without owner');
    eq(fileName({ bank: 'KB국민은행', owner: '홍길동' }), '계좌QR_KB국민은행_홍길동.png', 'file name');
    eq(renderQR(qrText({ bank: 'KB국민은행', owner: '홍길동', digits: '110123456789' })).width > 0,
       true, 'qr renders');
    qrEl.innerHTML = '';
    console.log('selftest: 13 passed');
  }
})();
