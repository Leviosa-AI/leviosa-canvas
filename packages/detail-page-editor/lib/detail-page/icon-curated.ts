import type { IconStyle } from "./icon-search";

/**
 * 아이콘 격자의 **첫 화면**에 놓을 것들. 라우트(`/api/icons`)가 검색어 없이 불릴 때 쓴다.
 *
 * 라우트가 아니라 여기 있는 이유는 둘이다. 하나, 라우트 파일은 HTTP 메서드 말고 다른 것을
 * 내보낼 수 없어서 목록만 따로 테스트할 수 없다. 둘, 이건 로직이 아니라 **우리가 고른 것**이라
 * 손으로 늘어나는 자리다 — 늘릴 때 지켜야 할 규칙을 테스트가 지키게 두는 편이 낫다.
 */

/**
 * 우리가 쓰는 세트와 그 우선순위. 인터리브 순서가 이 순서다.
 *
 * 선(Lucide·Tabler)을 앞에 두는 것은 상세페이지 기본 축이 선이기 때문이다.
 * **이 목록은 편의일 뿐 보안 경계가 아니다** — 실제 판정은 SPDX가 한다.
 */
export const ICON_PREFIXES = ["lucide", "tabler", "ph", "ri", "material-symbols"] as const;

/**
 * 검색어가 없을 때 보여 줄 큐레이션. 상세페이지에서 손이 가장 자주 가는 것들이다.
 * 빈 격자를 보여주지 않는다(`/api/stock-photos`가 `curated`로 하는 것과 같은 처리).
 *
 * **선/채움 두 벌을 따로 둔다.** 큐레이션을 한 벌만 두면 선/채움 토글이 검색어를 넣기
 * 전까지 아무것도 안 바꾼다 — Lucide·Tabler는 세트 전체가 선이고 Phosphor `-fill`은
 * 세트 전체가 채움이라, 같은 목록에 스타일 필터를 걸면 한쪽이 통째로 빈다.
 *
 * 갈래 순서가 곧 격자 순서다(세트 인터리브가 그 안에서 한 번 더 섞는다). 앞쪽 몇 줄이
 * 검증·배송·결제인 것은 상세페이지에서 그 셋이 가장 먼저 필요하기 때문이다.
 *
 * **`conceptOf`가 같은 것을 하나로 접는다.** 그래서 두 벌 안에서 개념이 겹치면 조용히
 * 사라진다 — `lucide:star`와 `tabler:star-filled`를 한 벌에 같이 두면 안 된다.
 * 그리고 여기 적은 이름은 **전부 제공처에 실재하는 것으로 확인했다**. 오타는 404가
 * 아니라 조용한 결번으로 나타나니(마크업 배치에서 빠질 뿐이다) 손으로 늘릴 때 주의.
 */
export const CURATED_STROKE: readonly string[] = [
  // 신뢰 · 인증
  "lucide:check", "lucide:circle-check", "lucide:square-check", "tabler:rosette-discount-check",
  "lucide:shield-check", "tabler:certificate", "lucide:award", "lucide:medal",
  "lucide:trophy", "lucide:crown", "lucide:star", "lucide:heart",
  "lucide:thumbs-up", "lucide:thumbs-down", "lucide:bookmark", "lucide:stamp",
  "tabler:ribbon-health", "lucide:diamond", "lucide:hand-heart", "tabler:hand-click",

  // 배송 · 물류
  "lucide:truck", "tabler:truck-delivery", "lucide:rocket", "lucide:package",
  "lucide:package-2", "tabler:package-import", "lucide:plane", "lucide:ship",
  "lucide:train", "lucide:forklift", "tabler:building-warehouse", "lucide:route",
  "lucide:map", "lucide:map-pin", "lucide:compass", "lucide:navigation",
  "tabler:package-export", "tabler:truck-return", "lucide:arrow-right-left", "lucide:radar",
  "lucide:flag", "lucide:globe",

  // 결제 · 가격
  "lucide:credit-card", "tabler:cash", "tabler:coin", "lucide:wallet",
  "lucide:receipt", "tabler:discount", "lucide:percent", "lucide:tag",
  "lucide:ticket", "lucide:gift", "lucide:shopping-cart", "lucide:shopping-bag",
  "tabler:shopping-cart-plus", "tabler:pig-money", "tabler:coin-bitcoin", "tabler:receipt-refund",
  "tabler:gift-card", "lucide:calculator", "tabler:file-invoice", "tabler:arrows-transfer-up",

  // 문의 · 응대
  "lucide:phone", "lucide:mail", "lucide:message-circle", "lucide:headset",
  "tabler:messages", "lucide:user", "lucide:users", "lucide:help-circle",
  "lucide:info", "lucide:alert-circle", "lucide:megaphone", "tabler:speakerphone",
  "lucide:bell", "tabler:message-2", "lucide:star-half", "tabler:hand-stop",
  "lucide:clipboard-check", "lucide:phone-call",

  // 치수 · 규격
  "lucide:ruler", "tabler:dimensions", "lucide:scale", "lucide:weight",
  "lucide:thermometer", "lucide:zoom-in", "lucide:zoom-out", "tabler:arrows-vertical",
  "tabler:arrows-horizontal", "lucide:angle", "lucide:grid-3x3", "lucide:layers",
  "tabler:align-center", "tabler:aspect-ratio", "tabler:cube",

  // 소재 · 관리
  "lucide:droplet", "tabler:wash-machine", "tabler:ironing", "lucide:wind",
  "tabler:bleach", "tabler:hand-sanitizer", "lucide:sun", "lucide:snowflake",
  "lucide:leaf", "lucide:recycle", "lucide:feather", "tabler:needle",
  "lucide:scissors", "tabler:needle-thread", "tabler:texture", "lucide:flower",
  "lucide:droplet-off", "tabler:air-balloon", "tabler:virus", "lucide:sparkles",

  // 안전 · 보증
  "lucide:shield", "lucide:lock", "lucide:key", "lucide:alert-triangle",
  "lucide:ban", "lucide:flame", "lucide:fire-extinguisher", "tabler:helmet",
  "lucide:hand-grab", "tabler:face-mask", "tabler:plant", "lucide:eye",
  "lucide:fingerprint", "lucide:list-check",

  // 의류 · 잡화
  "lucide:shirt", "tabler:shoe", "tabler:sock", "lucide:briefcase",
  "lucide:backpack", "tabler:zip", "lucide:circle-dot", "tabler:eyeglass",
  "tabler:sunglasses", "lucide:clock", "lucide:watch", "tabler:diamonds",
  "lucide:umbrella", "tabler:hanger-2",

  // 뷰티 · 욕실
  "lucide:sparkle", "tabler:spray", "tabler:perfume", "lucide:brush",
  "lucide:mirror-rectangular", "tabler:face-id", "tabler:hand-finger", "tabler:manual-gearbox",
  "tabler:bottle", "tabler:bowl", "tabler:sun-high", "tabler:massage",
  "lucide:bath", "tabler:dental",

  // 식음료
  "lucide:coffee", "tabler:cup", "lucide:wine", "lucide:beer",
  "lucide:bottle-wine", "lucide:apple", "lucide:carrot", "tabler:bread",
  "lucide:egg", "lucide:fish", "tabler:meat", "lucide:cake",
  "lucide:ice-cream", "lucide:cookie", "lucide:milk", "tabler:bubble-tea",
  "lucide:salad", "lucide:pizza", "lucide:chef-hat", "tabler:tools-kitchen-2",
  "tabler:bowl-spoon", "tabler:cooker", "tabler:cheese", "lucide:candy",
  "tabler:grain", "lucide:cherry", "lucide:broccoli", "lucide:nut",

  // 가전 · 디지털
  "tabler:device-tv", "lucide:monitor", "tabler:device-laptop", "tabler:device-mobile",
  "tabler:device-tablet", "lucide:headphones", "lucide:speaker", "lucide:camera",
  "lucide:printer", "lucide:keyboard", "lucide:mouse", "lucide:plug",
  "lucide:battery", "lucide:wifi", "lucide:bluetooth", "lucide:usb",
  "lucide:battery-charging", "tabler:propeller", "tabler:air-conditioning", "tabler:vacuum-cleaner",
  "tabler:bulb", "tabler:device-remote", "tabler:microphone", "tabler:device-gamepad",
  "lucide:drone", "tabler:robot", "lucide:cpu", "lucide:database",
  "lucide:power",

  // 가구 · 생활
  "lucide:sofa", "lucide:bed", "lucide:armchair", "tabler:desk",
  "tabler:door", "tabler:window", "lucide:home", "lucide:building",
  "tabler:building-store", "lucide:lamp", "tabler:photo", "lucide:trash",
  "tabler:basket", "lucide:broom", "lucide:hammer", "tabler:tool",
  "tabler:paint", "ri:brush-2-line", "tabler:ladder", "lucide:archive",
  "lucide:blinds", "tabler:stairs",

  // 반려 · 유아
  "tabler:paw", "lucide:dog", "lucide:cat", "lucide:bone",
  "lucide:bird", "tabler:fish-bone", "tabler:dog-bowl", "tabler:baby-carriage",
  "tabler:baby-bottle", "tabler:diaper", "lucide:puzzle", "lucide:blocks",
  "lucide:balloon",

  // 운동 · 야외
  "tabler:barbell", "lucide:bike", "tabler:run", "tabler:yoga",
  "tabler:ball-football", "tabler:ball-basketball", "tabler:ball-tennis", "tabler:swimming",
  "lucide:mountain", "lucide:tent", "tabler:trekking", "tabler:campfire",
  "tabler:fish-hook", "tabler:ski-jumping", "tabler:golf", "tabler:heartbeat",
  "ri:footprint-line",

  // 문구 · 사무
  "lucide:book", "lucide:notebook", "lucide:pen", "lucide:pencil",
  "lucide:paperclip", "lucide:folder", "lucide:file", "lucide:calendar",
  "lucide:clipboard", "tabler:note", "tabler:briefcase-2", "lucide:eraser",
  "tabler:file-certificate", "tabler:news", "tabler:id", "tabler:mail-opened",

  // 조작 · 표시
  "lucide:arrow-right", "lucide:arrow-up", "lucide:plus", "lucide:minus",
  "lucide:x", "tabler:refresh", "lucide:download", "lucide:upload",
  "lucide:share", "lucide:link", "lucide:copy", "tabler:filter",
  "lucide:search", "lucide:settings", "tabler:menu-2", "tabler:player-play",
  "tabler:player-pause", "lucide:lock-open", "tabler:trash-x", "lucide:eye-off",

  // 강조 · 지표
  "lucide:bolt", "lucide:trending-up", "lucide:trending-down", "lucide:chart-bar",
  "lucide:chart-pie", "lucide:chart-line", "lucide:target", "tabler:flag-2",
  "tabler:confetti", "tabler:gift-off", "tabler:circle-number-1", "lucide:podium",
  "lucide:hourglass", "tabler:stopwatch", "tabler:alarm", "tabler:calendar-event",
  "lucide:infinity",

  // 자연 · 계절
  "lucide:moon", "lucide:cloud", "lucide:cloud-rain", "lucide:cloud-snow",
  "tabler:windsock", "tabler:tree", "lucide:rose", "tabler:wave-sine",
  "lucide:glass-water", "tabler:world-longitude", "tabler:snowman",
];

/** 채움 큐레이션. 같은 개념을 채움 축에서 다시 고른 것이다. */
export const CURATED_FILL: readonly string[] = [
  // 신뢰 · 인증
  "ph:check-fill", "tabler:circle-check-filled", "tabler:square-check-filled", "tabler:rosette-discount-check-filled",
  "ph:shield-check-fill", "ph:certificate-fill", "ri:award-fill", "ph:medal-fill",
  "ph:trophy-fill", "ph:crown-fill", "ph:star-fill", "ph:heart-fill",
  "ph:thumbs-up-fill", "ph:thumbs-down-fill", "ph:bookmark-fill", "ph:stamp-fill",
  "ph:diamond-fill", "ph:hand-heart-fill", "ph:hands-clapping-fill",

  // 배송 · 물류
  "ph:truck-fill", "ph:rocket-fill", "ph:package-fill", "material-symbols:package-2",
  "ri:plane-fill", "ri:ship-fill", "ph:train-fill", "material-symbols:forklift",
  "ph:warehouse-fill", "ri:route-fill", "ri:map-fill", "ph:map-pin-fill",
  "ph:compass-fill", "ri:navigation-fill", "ri:exchange-fill", "ri:radar-fill",
  "ph:flag-fill", "ph:globe-fill",

  // 결제 · 가격
  "ph:credit-card-fill", "ri:cash-fill", "ph:coin-fill", "ph:wallet-fill",
  "ph:receipt-fill", "tabler:discount-filled", "ph:percent-fill", "ph:tag-fill",
  "ph:ticket-fill", "ph:gift-fill", "ph:shopping-cart-fill", "ph:shopping-bag-fill",
  "ph:trolley-fill", "ph:piggy-bank-fill", "tabler:coin-bitcoin-filled", "ri:refund-fill",
  "tabler:gift-card-filled", "ph:calculator-fill", "tabler:file-invoice-filled", "tabler:send-filled",

  // 문의 · 응대
  "ph:phone-fill", "ri:mail-fill", "tabler:message-circle-filled", "ph:headset-fill",
  "tabler:messages-filled", "ph:user-fill", "ph:users-fill", "tabler:help-circle-filled",
  "ph:info-fill", "tabler:alert-circle-filled", "ph:megaphone-fill", "ph:bell-fill",
  "ri:message-2-fill", "ph:star-half-fill", "ph:hand-fill", "tabler:clipboard-check-filled",
  "ph:phone-call-fill",

  // 치수 · 규격
  "ph:ruler-fill", "tabler:scale-filled", "ri:weight-fill", "ph:thermometer-fill",
  "ri:zoom-in-fill", "ri:zoom-out-fill", "ph:arrows-vertical-fill", "ph:arrows-horizontal-fill",
  "ph:angle-fill", "material-symbols:grid-3x3", "material-symbols:layers", "material-symbols:align-center",
  "ri:aspect-ratio-fill", "ph:cube-fill",

  // 소재 · 관리
  "tabler:droplet-filled", "ph:washing-machine-fill", "tabler:ironing-filled", "ph:wind-fill",
  "ph:flask-fill", "ri:hand-sanitizer-fill", "ph:sun-fill", "ph:snowflake-fill",
  "ph:leaf-fill", "ph:recycle-fill", "ph:feather-fill", "ph:needle-fill",
  "ph:scissors-fill", "material-symbols:texture", "ph:flower-fill", "tabler:air-balloon-filled",
  "ph:virus-fill", "tabler:sparkles-filled",

  // 안전 · 보증
  "ph:shield-fill", "ph:lock-fill", "ph:key-fill", "tabler:alert-triangle-filled",
  "ph:prohibit-fill", "ph:flame-fill", "ph:fire-extinguisher-fill", "ph:hard-hat-fill",
  "ph:boxing-glove-fill", "ph:face-mask-fill", "ph:plant-fill", "ph:eye-fill",
  "ph:fingerprint-fill", "tabler:list-check-filled",

  // 의류 · 잡화
  "ri:shirt-fill", "ph:hoodie-fill", "ph:pants-fill", "ph:dress-fill",
  "ph:boot-fill", "ph:sneaker-fill", "ph:sock-fill", "ph:baseball-cap-fill",
  "ph:briefcase-fill", "ph:backpack-fill", "tabler:circle-dot-filled", "tabler:eyeglass-filled",
  "ph:sunglasses-fill", "ph:clock-fill", "ph:watch-fill", "tabler:diamonds-filled",
  "ph:umbrella-fill", "ph:belt-fill", "tabler:hanger-2-filled",

  // 뷰티 · 욕실
  "ph:sparkle-fill", "ph:spray-bottle-fill", "ri:brush-fill", "ph:smiley-fill",
  "ph:hand-palm-fill", "ph:hair-dryer-fill", "tabler:manual-gearbox-filled", "ph:hand-soap-fill",
  "tabler:bottle-filled", "ph:jar-fill", "tabler:sun-high-filled", "material-symbols:massage",
  "tabler:bath-filled", "ph:tooth-fill",

  // 식음료
  "ph:coffee-fill", "ri:cup-fill", "ph:wine-fill", "ri:beer-fill",
  "ph:beer-bottle-fill", "ri:apple-fill", "ph:carrot-fill", "ph:bread-fill",
  "ph:egg-fill", "ph:fish-fill", "ph:cake-fill", "ph:ice-cream-fill",
  "ph:cookie-fill", "tabler:milk-filled", "tabler:salad-filled", "ph:pizza-fill",
  "ph:chef-hat-fill", "tabler:tools-kitchen-2-filled", "tabler:bowl-spoon-filled", "ph:cooking-pot-fill",
  "ph:cheese-fill", "material-symbols:grain", "tabler:cherry-filled", "ph:nut-fill",

  // 가전 · 디지털
  "tabler:device-tv-filled", "ph:monitor-fill", "ph:laptop-fill", "ph:device-mobile-fill",
  "ph:device-tablet-fill", "ph:headphones-fill", "ri:speaker-fill", "ph:camera-fill",
  "ph:printer-fill", "ph:keyboard-fill", "ph:mouse-fill", "ph:plug-fill",
  "ri:battery-fill", "ri:wifi-fill", "ph:bluetooth-fill", "ph:usb-fill",
  "ph:battery-charging-fill", "ph:fan-fill", "tabler:bulb-filled", "tabler:device-remote-filled",
  "ph:microphone-fill", "tabler:device-gamepad-filled", "ph:drone-fill", "ph:robot-fill",
  "ph:cpu-fill", "ph:database-fill", "ph:power-fill",

  // 가구 · 생활
  "ri:sofa-fill", "ph:bed-fill", "ph:armchair-fill", "ph:desk-fill",
  "ph:door-fill", "ri:window-fill", "ri:home-fill", "ph:building-fill",
  "ph:storefront-fill", "ph:lamp-fill", "ph:potted-plant-fill", "tabler:photo-filled",
  "ph:trash-fill", "ph:basket-fill", "ph:broom-fill", "ph:hammer-fill",
  "ph:wrench-fill", "ph:screwdriver-fill", "ri:paint-fill", "ri:brush-2-fill",
  "ph:ladder-fill", "ph:archive-fill", "material-symbols:curtains", "ph:rug-fill",
  "ph:stairs-fill",

  // 반려 · 유아
  "tabler:paw-filled", "ph:dog-fill", "ph:cat-fill", "ph:bone-fill",
  "ph:bird-fill", "tabler:fish-bone-filled", "ph:baby-carriage-fill", "ri:puzzle-fill",
  "ph:balloon-fill",

  // 운동 · 야외
  "ph:barbell-fill", "ri:bike-fill", "ri:run-fill", "ph:soccer-ball-fill",
  "ph:basketball-fill", "ph:tennis-ball-fill", "ph:person-simple-swim-fill", "tabler:mountain-filled",
  "ph:tent-fill", "material-symbols:hiking", "ph:campfire-fill", "ph:person-simple-ski-fill",
  "ph:golf-fill", "ph:heartbeat-fill", "ri:footprint-fill",

  // 문구 · 사무
  "ph:book-fill", "ph:notebook-fill", "ph:pen-fill", "ph:pencil-fill",
  "ph:paperclip-fill", "ph:folder-fill", "ph:file-fill", "ph:calendar-fill",
  "ph:clipboard-fill", "ph:note-fill", "ri:briefcase-2-fill", "ph:eraser-fill",
  "ri:file-check-fill", "ri:news-fill", "tabler:id-filled", "tabler:mail-opened-filled",

  // 조작 · 표시
  "ph:arrow-right-fill", "ph:arrow-up-fill", "ph:plus-fill", "ph:minus-fill",
  "ph:x-fill", "ri:refresh-fill", "ph:download-fill", "ph:upload-fill",
  "ph:share-fill", "ph:link-fill", "ph:copy-fill", "ri:filter-fill",
  "ri:search-fill", "ri:settings-fill", "ri:menu-2-fill", "tabler:player-play-filled",
  "tabler:player-pause-filled", "ph:lock-open-fill", "tabler:trash-x-filled", "ri:eye-off-fill",

  // 강조 · 지표
  "tabler:bolt-filled", "material-symbols:trending-up", "material-symbols:trending-down", "ph:chart-bar-fill",
  "ph:chart-pie-fill", "ph:chart-line-fill", "ph:target-fill", "ri:flag-2-fill",
  "ph:confetti-fill", "ri:gift-2-fill", "tabler:circle-number-1-filled", "ph:ranking-fill",
  "ph:hourglass-fill", "ph:alarm-fill", "ri:calendar-event-fill", "ph:infinity-fill",

  // 자연 · 계절
  "ph:moon-fill", "ph:cloud-fill", "ph:cloud-rain-fill", "ph:cloud-snow-fill",
  "tabler:windsock-filled", "ph:tree-fill", "ph:flower-lotus-fill", "ph:wave-sine-fill",
  "ph:drop-half-fill", "ph:planet-fill",
];

export function curatedFor(style: IconStyle | undefined): readonly string[] {
  if (style === "fill") return CURATED_FILL;
  if (style === "stroke") return CURATED_STROKE;
  return [...CURATED_STROKE, ...CURATED_FILL];
}
