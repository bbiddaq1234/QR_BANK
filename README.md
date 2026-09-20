# 계좌 QR

계좌정보를 QR 코드로 만들어 복사·저장·공유하는 웹앱. 서버 없음, 빌드 없음.

## 실행

`index.html`을 브라우저로 연다. 끝.

계좌번호 복사는 `file://`로 열어도 동작한다. `navigator.clipboard`는 `https://` 또는
`localhost`에서만 존재하므로, 없으면 `document.execCommand('copy')`로 떨어뜨린다.

공유(`navigator.share`) 기능만은 `https://`가 필요하다. 휴대폰 테스트 시에는
간단한 로컬 서버를 쓴다.

```
python -m http.server 8000
```

## 파일

```
index.html      화면 (QR 만드는 쪽)
style.css       스타일 (다크모드 포함)
app.js          로직
qrcode.min.js   QR 생성 라이브러리 (qrcode-generator, 프로젝트에 포함)
copy.html       QR을 스캔한 폰이 여는 복사 페이지 (이 파일만 https에 올린다)
```

QR 라이브러리로 **davidshimjs/qrcodejs 는 쓰지 않는다.** UTF-8 인코더가 바이트 배열을
재사용하면서 잘라내지 않아, 한글 뒤 ASCII 한 글자마다 쓰레기 바이트 2개가 붙는다.
70바이트 문자열이 117바이트로 부풀어 용량 초과 예외가 나고, 버튼이 말없이 죽는다.

## 보안 설계

- 서버 전송 없음, DB 없음, 로그인 없음 — 모든 처리는 브라우저 메모리에서만.
- `localStorage` / `sessionStorage` / 쿠키 사용하지 않음.
- 새로고침 시 브라우저가 입력값을 복원하지 못하도록 `pageshow`에서 폼을 비운다.
- PNG 파일명에 계좌번호를 넣지 않는다 (`계좌QR_은행명_예금주.png`).
- 외부 요청이 하나도 없으므로 개발자도구 Network 탭에 계좌정보가 남지 않는다.

## QR 데이터

**QR 코드는 스마트폰 클립보드에 직접 쓰지 못한다.** QR은 그냥 문자열이고, 클립보드에
쓰는 건 자바스크립트뿐이다. 그래서 QR 안에 `copy.html` 주소를 넣는다.

```
https://내아이디.github.io/gyejwa/copy.html#a=3333123456789&b=%EC%B9%B4…&o=%ED%99%8D…
```

스캔 → 브라우저가 `copy.html`을 염 → **[계좌번호 복사]** 한 번 탭 → 클립보드에 숫자만.

평문 QR은 이 자리에서 실패했다. 아이폰 기본 카메라는 평문 QR에 아예 반응하지 않고
(URL·와이파이·연락처만 처리), 안드로이드 스캐너는 검색창으로 넘겨버린다. URL이면
어느 폰이든 브라우저가 열린다.

- 계좌정보는 `#` 뒤(fragment)에 있다. **fragment는 서버로 전송되지 않으므로**
  호스팅 서버 로그·리퍼러에 계좌번호가 남지 않는다.
- `copy.html`은 외부 요청이 없고 저장소도 쓰지 않는다. 한 파일만 올리면 된다.
- 자동 복사는 안 된다. 모바일 브라우저는 사용자 제스처 없는 클립보드 쓰기를 막는다.
  버튼 한 번은 반드시 눌러야 한다.

## 호스팅 (한 번만)

`copy.html` 이 https 주소에 있어야 위가 동작한다. GitHub Pages 기준:

1. 새 저장소를 만들고 `copy.html` 하나만 올린다.
2. Settings → Pages → Source를 `main` 브랜치로 지정.
3. 나온 주소를 `app.js` 맨 위 `COPY_PAGE_URL` 에 붙여넣는다.

```js
var COPY_PAGE_URL = 'https://내아이디.github.io/gyejwa/copy.html';
```

`COPY_PAGE_URL` 이 비어 있으면 QR에 계좌번호 숫자만 담는다 — 호스팅 전에도 앱은
돌아가지만, 스캔했을 때 검색창으로 넘어갈 수 있다.

## 계좌번호 처리

- 하이픈과 공백은 자동 제거 (`110-123-456789` → `110123456789`).
- 숫자 8~20자리만 통과. 은행별 실제 규칙은 검증하지 않으므로
  "유효한 계좌번호"가 아니라 "입력 형식이 확인되었습니다."라고만 표시한다.
- 화면에는 입력한 그대로, 클립보드에는 숫자만 복사된다.

## 셀프체크

브라우저: `index.html?selftest` → 콘솔에 `selftest: 13 passed`.
`copy.html?selftest` → 콘솔에 `copy selftest: 4 passed`.
