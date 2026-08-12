import ko from "./ko.json";
import en from "./en.json";

/**
 * 편집기가 자기 문구를 들고 다닌다.
 *
 * 예전에는 소비자(leviosa-frontend)의 `public/locales` 안에 있었다. 셸이 패키지로
 * 나온 뒤에도 문구만 저쪽에 남으니, 설치만 한 소비자에게는 버튼마다
 * `detailPage.layers.group` 같은 키가 그대로 보였다. 문구는 편집기 것이다.
 *
 * **번역기(i18next 인스턴스)는 소비자 것이다.** 패키지가 자기 인스턴스를 만들면
 * 언어 전환·네임스페이스 로딩이 두 벌로 갈라지므로, 여기서는 등록만 한다.
 */
export type I18nLike = {
  addResourceBundle: (
    lng: string,
    ns: string,
    resources: unknown,
    deep?: boolean,
    overwrite?: boolean,
  ) => unknown;
};

/**
 * 두 네임스페이스(`branding`·`marketing`)에 편집기 문구를 얹는다.
 *
 * `deep=true, overwrite=false` 인 것이 요점이다. 소비자가 같은 키를 이미 들고 있으면
 * **소비자 값이 이긴다** — leviosa-frontend 처럼 자기 로케일 파일에 손댄 곳이 있어도
 * 패키지가 그 위에 덮어쓰지 않는다. 없는 자리만 채운다.
 *
 * 렌더보다 **먼저** 부르면 된다. 늦게 불러도 i18next 가 다시 그리지만, 그 사이 한 번은
 * 키가 보인다.
 */
export function registerDetailPageEditorTranslations(i18n: I18nLike): void {
  for (const [lng, bundle] of [
    ["ko", ko],
    ["en", en],
  ] as const) {
    for (const [ns, resources] of Object.entries(bundle)) {
      i18n.addResourceBundle(lng, ns, resources, true, false);
    }
  }
}

export { ko as detailPageEditorKo, en as detailPageEditorEn };
