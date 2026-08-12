/**
 * 아이콘 검색용 한국어 → 영어 키워드 사전.
 *
 * 아이콘 제공처(Iconify)는 **아이콘 이름과 별칭이 전부 영어**다. 스톡 사진은 `locale=ko-KR`을
 * 넘길 데라도 있었지만(`src/app/api/stock-photos/route.ts`) 여기엔 그런 것이 없다. 그래서
 * "배송"을 그대로 넘기면 0건이다 — 이 사전이 없으면 기능 자체가 안 쓰인다.
 *
 * 값은 **순서 있는 배열**이다. 앞이 1순위고, 결과가 모자랄 때만 뒤를 덧댄다(프록시가
 * 그렇게 쓴다). 그래서 "가장 그럴듯한 하나"를 맨 앞에 둔다.
 *
 * 수록 기준은 **상세페이지에서 실제로 찍히는 말**이다. 일반 한국어 사전이 아니다.
 * 여기 없는 말은 자동 생성분(`icon-keywords.generated.ts`)이 받고, 그것도 없으면
 * 국립국어원에 한 번 물어본다(`korean-dictionary.ts`).
 */

import { ICON_KEYWORDS_GENERATED } from "./icon-keywords.generated";

export const ICON_KEYWORDS_KO: Readonly<Record<string, readonly string[]>> = {
  // ── 배송·물류 ───────────────────────────────────────────────────────────────
  배송: ["truck", "package", "delivery"],
  무료배송: ["truck", "gift", "package"],
  당일발송: ["truck-fast", "clock", "package"],
  익일배송: ["truck-fast", "calendar", "package"],
  로켓배송: ["rocket", "truck-fast"],
  택배: ["package", "truck", "box"],
  발송: ["send", "package", "truck"],
  출고: ["package-export", "truck", "box"],
  입고: ["package-import", "box", "warehouse"],
  포장: ["package", "box", "gift"],
  박스: ["box", "package"],
  운송장: ["receipt", "barcode", "package"],
  물류: ["warehouse", "truck", "forklift"],
  창고: ["warehouse", "building-warehouse", "box"],
  해외배송: ["world", "plane", "truck"],
  항공: ["plane", "airplane"],
  선박: ["ship", "boat"],
  추적: ["map-pin", "route", "search"],
  도착: ["map-pin", "flag", "check"],

  // ── 주문·결제 ───────────────────────────────────────────────────────────────
  주문: ["shopping-cart", "clipboard-list", "receipt"],
  장바구니: ["shopping-cart", "shopping-bag"],
  구매: ["shopping-bag", "credit-card", "shopping-cart"],
  결제: ["credit-card", "wallet", "cash"],
  카드: ["credit-card", "wallet"],
  현금: ["cash", "coins", "banknote"],
  계좌이체: ["building-bank", "arrows-exchange", "cash"],
  간편결제: ["device-mobile", "credit-card", "wallet"],
  영수증: ["receipt", "file-invoice"],
  세금계산서: ["file-invoice", "receipt-tax"],
  가격: ["tag", "currency-won", "price-tag"],
  할인: ["discount", "tag", "percentage"],
  세일: ["discount", "tag", "flame"],
  특가: ["flame", "discount", "tag"],
  쿠폰: ["ticket", "coupon", "tag"],
  적립: ["coin", "gift", "star"],
  포인트: ["coin", "star", "diamond"],
  마일리지: ["coin", "award", "star"],
  무이자: ["percentage", "credit-card", "calendar"],
  할부: ["calendar", "credit-card", "divide"],
  환불: ["arrow-back-up", "receipt-refund", "cash"],
  반품: ["arrow-back-up", "package", "truck-return"],
  교환: ["arrows-exchange", "refresh", "repeat"],
  취소: ["x", "circle-x", "ban"],

  // ── 신뢰·인증 ───────────────────────────────────────────────────────────────
  정품: ["certificate", "rosette-discount-check", "shield-check"],
  인증: ["certificate", "badge-check", "shield-check"],
  검증: ["shield-check", "check", "search"],
  보증: ["shield", "certificate", "umbrella"],
  품질보증: ["shield-check", "award", "certificate"],
  특허: ["certificate", "award", "bulb"],
  상표: ["trademark", "copyright", "certificate"],
  공식: ["badge-check", "certificate", "building"],
  검사: ["microscope", "clipboard-check", "search"],
  시험성적서: ["file-certificate", "clipboard-check", "flask"],
  안전: ["shield-check", "helmet", "lock"],
  안심: ["shield-check", "heart-handshake", "lock"],
  신뢰: ["heart-handshake", "shield-check", "thumb-up"],
  수상: ["award", "trophy", "medal"],
  "1위": ["trophy", "medal", "crown"],
  베스트: ["trophy", "star", "flame"],
  추천: ["thumb-up", "star", "heart"],
  인기: ["flame", "trending-up", "heart"],
  신상품: ["sparkles", "star", "tag"],
  한정: ["clock", "flame", "lock"],
  품절: ["package-off", "x", "alert-circle"],
  재입고: ["refresh", "package", "bell"],

  // ── 제품 속성 ───────────────────────────────────────────────────────────────
  방수: ["droplet-off", "umbrella", "shield"],
  생활방수: ["droplet", "shield", "umbrella"],
  방진: ["wind", "shield", "filter"],
  방염: ["flame-off", "shield", "fire-extinguisher"],
  내구성: ["shield", "hammer", "armchair"],
  경량: ["feather", "wind", "scale"],
  초경량: ["feather", "wind"],
  가벼움: ["feather", "wind", "scale"],
  튼튼: ["shield", "hammer", "muscle"],
  통기성: ["wind", "air-conditioning", "grid-dots"],
  흡수: ["droplet", "sponge", "arrow-down"],
  건조: ["sun", "wind", "wash-dry"],
  세탁: ["wash-machine", "bubble", "shirt"],
  손세탁: ["hand-stop", "bubble", "wash"],
  드라이클리닝: ["wash-dry-clean", "shirt", "hanger"],
  다림질: ["ironing", "shirt"],
  소재: ["texture", "layers", "shirt"],
  원단: ["texture", "shirt", "layers"],
  면: ["plant", "shirt", "texture"],
  가죽: ["shirt", "texture", "bag"],
  스테인리스: ["tools-kitchen", "shine", "shield"],
  실리콘: ["droplet", "texture", "shield"],
  친환경: ["leaf", "recycle", "plant"],
  재활용: ["recycle", "refresh", "leaf"],
  무독성: ["leaf", "shield-check", "flask-off"],
  무향: ["wind", "flask-off"],
  저자극: ["feather", "heart", "shield"],
  국내생산: ["flag", "building-factory", "map-pin"],
  수입: ["world", "plane", "package-import"],
  원산지: ["map-pin", "world", "flag"],
  제조: ["building-factory", "tools", "settings"],
  성분: ["flask", "list-details", "leaf"],
  함량: ["chart-pie", "flask", "percentage"],
  용량: ["bottle", "ruler", "database"],
  중량: ["scale", "weight"],
  사이즈: ["ruler", "resize", "arrows-maximize"],
  치수: ["ruler", "dimensions", "resize"],
  규격: ["ruler", "dimensions", "clipboard-list"],
  색상: ["palette", "color-swatch", "droplet"],
  옵션: ["adjustments", "list", "settings"],
  구성품: ["box", "list", "package"],
  세트: ["boxes", "package", "layers"],
  유통기한: ["calendar-time", "clock", "hourglass"],
  제조일자: ["calendar", "building-factory"],
  보관: ["fridge", "box", "temperature"],
  냉장: ["fridge", "snowflake", "temperature"],
  냉동: ["snowflake", "fridge"],
  실온: ["temperature", "home", "sun"],

  // ── 사용·기능 ───────────────────────────────────────────────────────────────
  사용법: ["book", "list-numbers", "help"],
  설명서: ["book", "file-text", "help"],
  주의사항: ["alert-triangle", "info-circle", "exclamation-mark"],
  경고: ["alert-triangle", "alert-circle"],
  금지: ["ban", "circle-x", "hand-stop"],
  필수: ["asterisk", "alert-circle", "star"],
  간편: ["click", "wand", "bolt"],
  원터치: ["click", "hand-finger", "bolt"],
  자동: ["settings-automation", "robot", "bolt"],
  수동: ["hand-finger", "adjustments", "tool"],
  조절: ["adjustments", "settings", "sliders"],
  분리형: ["separator", "unlink", "layers-difference"],
  접이식: ["fold", "arrows-minimize", "layers"],
  휴대: ["briefcase", "backpack", "device-mobile"],
  거치: ["device-desktop", "stand", "anchor"],
  충전: ["battery-charging", "plug", "bolt"],
  배터리: ["battery", "battery-charging"],
  무선: ["wifi", "bluetooth", "antenna"],
  블루투스: ["bluetooth", "device-mobile"],
  방수등급: ["droplet-off", "shield", "certificate"],
  소음: ["volume", "wave-square", "ear"],
  저소음: ["volume-off", "moon", "ear-off"],
  절전: ["bolt-off", "leaf", "plug-off"],
  전력: ["bolt", "plug", "battery"],
  온도: ["temperature", "thermometer", "sun"],
  타이머: ["clock", "hourglass", "alarm"],
  방향: ["arrows-move", "compass", "navigation"],

  // ── 고객·응대 ───────────────────────────────────────────────────────────────
  고객센터: ["headset", "phone", "message-circle"],
  상담: ["message-circle", "headset", "user-question"],
  문의: ["message-question", "help-circle", "mail"],
  전화: ["phone", "phone-call"],
  카톡: ["message-circle", "brand-kakao"],
  카카오톡: ["message-circle", "brand-kakao"],
  채팅: ["message-circle", "messages"],
  이메일: ["mail", "at", "send"],
  운영시간: ["clock", "calendar", "building-store"],
  휴무: ["calendar-off", "moon", "door"],
  공지: ["speakerphone", "bell", "info-circle"],
  안내: ["info-circle", "help-circle", "book"],
  후기: ["star", "message-circle", "thumb-up"],
  리뷰: ["star", "message-circle", "pencil"],
  별점: ["star", "stars", "star-half"],
  평점: ["star", "chart-bar", "award"],
  질문: ["help-circle", "message-question", "question-mark"],
  답변: ["message-reply", "check", "message-circle"],

  // ── 브랜드·마케팅 ───────────────────────────────────────────────────────────
  브랜드: ["award", "diamond", "crown"],
  로고: ["copyright", "diamond", "award"],
  이벤트: ["confetti", "gift", "calendar-event"],
  증정: ["gift", "present", "sparkles"],
  선물: ["gift", "present", "heart"],
  사은품: ["gift", "package", "sparkles"],
  체험: ["hand-finger", "flask", "eye"],
  구독: ["repeat", "calendar", "bell"],
  회원: ["user", "id-badge", "users"],
  등급: ["award", "crown", "stairs"],
  신규: ["sparkles", "plus", "star"],
  재구매: ["repeat", "shopping-cart", "refresh"],
  공유: ["share", "send", "users"],
  링크: ["link", "external-link"],
  홈페이지: ["world", "home", "browser"],
  쇼핑몰: ["building-store", "shopping-bag", "world"],
  매장: ["building-store", "map-pin", "door"],
  지도: ["map", "map-pin", "navigation"],
  위치: ["map-pin", "navigation", "target"],

  // ── 수치·비교 ───────────────────────────────────────────────────────────────
  비교: ["arrows-left-right", "columns", "scale"],
  차이: ["arrows-diff", "minus", "chart-bar"],
  증가: ["trending-up", "arrow-up", "chart-line"],
  감소: ["trending-down", "arrow-down", "chart-line"],
  성장: ["trending-up", "plant", "chart-line"],
  통계: ["chart-bar", "chart-pie", "report-analytics"],
  그래프: ["chart-line", "chart-bar", "chart-area"],
  퍼센트: ["percentage", "chart-pie"],
  순위: ["trophy", "list-numbers", "medal"],
  누적: ["stack", "layers", "chart-bar"],
  판매량: ["chart-bar", "shopping-cart", "trending-up"],
  재고: ["package", "boxes", "database"],

  // ── 시간·일정 ───────────────────────────────────────────────────────────────
  시간: ["clock", "hourglass"],
  날짜: ["calendar", "calendar-event"],
  기간: ["calendar", "hourglass", "clock"],
  마감: ["clock", "hourglass-off", "flag"],
  즉시: ["bolt", "flash", "clock"],
  빠름: ["bolt", "rocket", "truck-fast"],
  "1년": ["calendar", "clock", "shield"],
  "1개월": ["calendar-month", "clock"],
  "24시간": ["clock-24", "clock", "moon"],
  연중무휴: ["calendar", "infinity", "clock"],

  // ── 사람·신체 ───────────────────────────────────────────────────────────────
  사람: ["user", "users", "mood-smile"],
  아기: ["baby-carriage", "mood-kid", "heart"],
  어린이: ["mood-kid", "school", "baby-carriage"],
  여성: ["gender-female", "user", "woman"],
  남성: ["gender-male", "user", "man"],
  가족: ["users", "home", "heart"],
  반려동물: ["dog", "cat", "paw"],
  강아지: ["dog", "paw"],
  고양이: ["cat", "paw"],
  피부: ["hand", "sparkles", "droplet"],
  머리카락: ["scissors", "user", "wind"],
  건강: ["heart", "heartbeat", "activity"],
  운동: ["barbell", "run", "activity"],
  수면: ["moon", "bed", "zzz"],
  다이어트: ["scale", "run", "salad"],

  // ── 생활·카테고리 ───────────────────────────────────────────────────────────
  주방: ["tools-kitchen", "chef-hat", "cooker"],
  요리: ["chef-hat", "cooker", "tools-kitchen"],
  음식: ["bowl", "meat", "salad"],
  음료: ["cup", "bottle", "glass"],
  커피: ["coffee", "cup"],
  침실: ["bed", "moon", "lamp"],
  욕실: ["bath", "shower", "droplet"],
  청소: ["spray", "brush", "trash"],
  수납: ["box", "archive", "layout-grid"],
  가구: ["armchair", "sofa", "table"],
  조명: ["bulb", "lamp", "sun"],
  전자제품: ["device-laptop", "plug", "cpu"],
  의류: ["shirt", "hanger", "jacket"],
  신발: ["shoe", "footprint"],
  가방: ["backpack", "briefcase", "shopping-bag"],
  화장품: ["perfume", "droplet", "sparkles"],
  문구: ["pencil", "notebook", "paperclip"],
  자동차: ["car", "steering-wheel"],
  캠핑: ["tent", "campfire", "mountain"],
  여행: ["plane", "luggage", "map"],
  사무실: ["building", "device-desktop", "briefcase"],

  // ── 식품·식자재 ─────────────────────────────────────────────────────────────
  // 상세페이지의 절반이 먹는 것이다. 여기가 비어 있어서 "사과"가 0건이었다 —
  // 영어로 `apple`을 치면 나오는데 한글로 치면 안 나오는 것은 그냥 고장이다.
  사과: ["apple"],
  바나나: ["banana"],
  딸기: ["strawberry", "cherry"],
  포도: ["grapes", "grape"],
  수박: ["watermelon", "melon"],
  오렌지: ["orange"],
  레몬: ["lemon"],
  복숭아: ["peach"],
  체리: ["cherry"],
  블루베리: ["blueberry", "cherry"],
  아보카도: ["avocado"],
  과일: ["apple", "cherry", "orange"],
  채소: ["broccoli", "carrot", "plant"],
  당근: ["carrot"],
  토마토: ["tomato"],
  감자: ["potato"],
  고구마: ["potato", "plant"],
  양파: ["onion"],
  마늘: ["garlic"],
  브로콜리: ["broccoli"],
  옥수수: ["corn"],
  고추: ["pepper", "chili"],
  버섯: ["mushroom"],
  콩: ["bean", "grain"],
  견과: ["nut", "peanut"],
  쌀: ["grain", "rice", "bowl"],
  곡물: ["grain", "wheat"],
  계란: ["egg"],
  빵: ["bread", "baguette"],
  치즈: ["cheese"],
  버터: ["butter"],
  고기: ["meat", "beef"],
  삼겹살: ["meat", "bacon"],
  닭고기: ["meat", "egg-fried"],
  생선: ["fish"],
  새우: ["shrimp", "fish"],
  해산물: ["fish", "shrimp"],
  우유: ["milk"],
  요거트: ["yogurt", "milk"],
  꿀: ["honey", "beehive"],
  국수: ["noodles", "bowl"],
  라면: ["noodles", "bowl"],
  피자: ["pizza"],
  햄버거: ["burger", "hamburger"],
  샐러드: ["salad", "bowl"],
  케이크: ["cake"],
  아이스크림: ["ice-cream"],
  쿠키: ["cookie"],
  사탕: ["candy"],
  초콜릿: ["chocolate", "candy"],
  와인: ["wine"],
  맥주: ["beer"],
  소주: ["bottle", "glass"],
  주스: ["juice", "cup"],
  물: ["droplet", "glass-water"],
  소금: ["salt", "shaker"],
  설탕: ["sugar", "candy"],
  기름: ["bottle", "droplet"],
  간식: ["cookie", "candy"],
  도시락: ["lunchbox", "bowl"],
  반려간식: ["bone", "cookie"],

  // ── 가전·가구(외래어가 많은 자리) ───────────────────────────────────────────
  냉장고: ["fridge", "refrigerator"],
  세탁기: ["wash-machine", "washing-machine"],
  건조기: ["wash-dry", "wind"],
  전자레인지: ["microwave"],
  에어컨: ["air-conditioning", "snowflake"],
  선풍기: ["fan", "propeller"],
  공기청정기: ["air-conditioning", "wind"],
  청소기: ["vacuum-cleaner"],
  정수기: ["glass-water", "droplet"],
  노트북: ["device-laptop", "laptop"],
  스마트폰: ["device-mobile", "phone"],
  태블릿: ["device-tablet", "tablet"],
  모니터: ["device-desktop", "monitor"],
  키보드: ["keyboard"],
  마우스: ["mouse"],
  이어폰: ["headphones", "earbuds"],
  헤드폰: ["headphones"],
  충전기: ["battery-charging", "plug"],
  텔레비전: ["device-tv", "television"],
  소파: ["sofa", "armchair"],
  침대: ["bed"],
  책상: ["desk", "table"],
  의자: ["armchair", "chair"],
  옷장: ["hanger", "door"],
  선반: ["shelf", "archive"],
  거울: ["mirror"],
  카펫: ["rug", "carpet"],
  커튼: ["curtains", "blinds"],
  화분: ["potted-plant", "plant"],

  // ── 범용 기호 ───────────────────────────────────────────────────────────────
  체크: ["check", "circle-check", "square-check"],
  확인: ["check", "circle-check", "eye"],
  완료: ["circle-check", "check", "flag"],
  별: ["star", "stars"],
  하트: ["heart", "heart-filled"],
  화살표: ["arrow-right", "arrow-narrow-right", "chevron-right"],
  플러스: ["plus", "circle-plus"],
  마이너스: ["minus", "circle-minus"],
  느낌표: ["exclamation-mark", "alert-circle"],
  물음표: ["question-mark", "help-circle"],
  전구: ["bulb", "bulb-filled"],
  자물쇠: ["lock", "lock-open"],
  검색: ["search", "zoom"],
  설정: ["settings", "adjustments"],
  다운로드: ["download", "arrow-down-circle"],
  업로드: ["upload", "arrow-up-circle"],
  인쇄: ["printer", "file"],
  카메라: ["camera", "photo"],
  동영상: ["video", "player-play"],
  음악: ["music", "headphones"],
  알림: ["bell", "bell-ringing"],
  달력: ["calendar", "calendar-event"],
  폴더: ["folder", "folder-open"],
  파일: ["file", "file-text"],
  휴지통: ["trash", "trash-x"],
  손: ["hand-finger", "hand-stop", "click"],
  눈: ["eye", "eye-off"],
  불꽃: ["flame", "fire"],
  물방울: ["droplet", "droplets"],
  나뭇잎: ["leaf", "plant"],
  태양: ["sun", "sunrise"],
  달: ["moon", "moon-stars"],
  구름: ["cloud", "cloud-rain"],
  눈송이: ["snowflake", "snowman"],
  지구: ["world", "globe"],
  왕관: ["crown", "trophy"],
  다이아몬드: ["diamond", "gem"],
  방패: ["shield", "shield-check"],
  깃발: ["flag", "flag-filled"],
  메달: ["medal", "award"],
  트로피: ["trophy", "award"],
  선물상자: ["gift", "package"],
  전화기: ["phone", "device-mobile"],
  컴퓨터: ["device-desktop", "device-laptop"],
  휴대폰: ["device-mobile", "phone"],
  프린터: ["printer"],
  마이크: ["microphone", "headset"],
  스피커: ["speakerphone", "volume"],
  시계: ["clock", "alarm"],
  열쇠: ["key", "lock"],
  톱니바퀴: ["settings", "gear"],
  망치: ["hammer", "tools"],
  가위: ["scissors", "cut"],
  자: ["ruler", "ruler-measure"],
  연필: ["pencil", "edit"],
  붓: ["brush", "palette"],
  책: ["book", "notebook"],
  지폐: ["banknote", "cash"],
  동전: ["coin", "coins"],
  저울: ["scale", "balance"],
  온도계: ["thermometer", "temperature"],
  플러그: ["plug", "bolt"],
  로켓: ["rocket", "trending-up"],
  로봇: ["robot", "cpu"],
  자석: ["magnet"],
  퍼즐: ["puzzle", "components"],
  타겟: ["target", "crosshair"],
  무한: ["infinity", "repeat"],
} as const;

/** 한글이 하나라도 있으면 사전을 태운다. */
const HANGUL = /[가-힣]/;

/** 조사·공백·기호를 털어 낸다. "배송은" "무료 배송!" 이 같은 자리로 가야 한다. */
const PARTICLES =
  /(?:은|는|이|가|을|를|에|에서|으로|로|와|과|의|도|만|까지|부터)$/;

function strip(token: string): string {
  return token.replace(/[^0-9A-Za-z가-힣]/g, "");
}

/**
 * 표제어 하나를 찾는다. **손으로 쓴 것이 언제나 먼저다.**
 *
 * 자동 생성분은 아이콘 이름에 실제로 있는 낱말만 담고 있어 넓지만, 어느 것이 1순위인지는
 * 모른다("배송"의 `truck`이 `delivery`보다 앞이라는 것은 사람만 안다). 그래서 사람이
 * 정해 둔 자리를 자동 생성이 밀어내지 못하게 순서를 고정한다.
 */
function lookupKeyword(key: string): readonly string[] | undefined {
  return ICON_KEYWORDS_KO[key] ?? ICON_KEYWORDS_GENERATED[key];
}

/** 부분일치용 키 목록. 긴 것부터, 손으로 쓴 것부터. 한 번만 만든다. */
let partialKeys: string[] | null = null;

function keysForPartialMatch(): string[] {
  if (partialKeys) return partialKeys;
  const byLength = (a: string, b: string) => b.length - a.length;
  // 한 글자 키는 뺀다 — "화면"이 "면"으로, "숫자"가 "자"로 걸린다.
  const hand = Object.keys(ICON_KEYWORDS_KO).filter((key) => key.length > 1).sort(byLength);
  const baked = Object.keys(ICON_KEYWORDS_GENERATED)
    .filter((key) => key.length > 1 && !ICON_KEYWORDS_KO[key])
    .sort(byLength);
  partialKeys = [...hand, ...baked];
  return partialKeys;
}

/**
 * 한국어 질의를 영어 키워드 배열로 편다. 앞이 1순위다.
 *
 * 세 겹으로 찾는다.
 *  1. 질의 전체가 사전에 있으면 그것(가장 정확하다).
 *  2. 없으면 어절 단위로 — 조사를 떼고 다시 본다.
 *  3. 그래도 없으면 사전 키가 질의 안에 들어 있는지 본다("무료배송" → "배송").
 *     긴 키부터 봐서 "무료배송"이 "배송"보다 먼저 걸리게 한다.
 *
 * 한글이 없으면 원문을 그대로 돌려준다 — 영어로 치는 사람을 막지 않는다.
 */
export function expandKoreanQuery(query: string): string[] {
  const text = query.trim();
  if (!text) return [];
  if (!HANGUL.test(text)) return [text];

  const out: string[] = [];
  const push = (words: readonly string[]) => {
    for (const word of words) if (!out.includes(word)) out.push(word);
  };

  const whole = strip(text);
  const exact = lookupKeyword(whole);
  if (exact) push(exact);

  if (!out.length) {
    for (const token of text.split(/\s+/)) {
      const bare = strip(token);
      const hit = lookupKeyword(bare) ?? lookupKeyword(bare.replace(PARTICLES, ""));
      if (hit) push(hit);
    }
  }

  if (!out.length) {
    for (const key of keysForPartialMatch()) {
      if (whole.includes(key)) {
        push(lookupKeyword(key) ?? []);
        break;
      }
    }
  }

  // 하나도 못 찾으면 원문이라도 넘긴다. 제공처가 별칭으로 걸러 줄 수도 있다.
  return out.length ? out : [text];
}
