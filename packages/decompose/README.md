# leviosa-decompose

HTML을 편집 가능한 캔버스 조각 트리로 바꾸는 파이썬 패키지다.

```python
from leviosa_decompose import CAROUSEL, process_template

await process_template(browser, html_path, out_dir, profile=CAROUSEL)
```

기본 판형은 상세페이지다. 상세페이지는 `data-screen-label` 기준으로 화면을 묶고 `.ph`를 빈 사진 자리로 처리한다. 캐러셀은 파일 하나의 `body` 전체를 한 화면으로 처리하며 빈 사진 자리 경로를 타지 않는다.

```sh
python -m leviosa_decompose.decompose slide.html --profile carousel --out output
pytest
```

캐러셀 픽셀 검사는 `tests/fixtures/baseline.json`보다 `0.05%p` 넘게 나빠질 때 실패한다. `0.05%p` 넘게 좋아지면 기준선 갱신 경고를 낸다. 이 검사는 새 입력의 충실도 합격 판정이 아니라 변화 기록이므로 CI에서는 비차단으로 돈다.
