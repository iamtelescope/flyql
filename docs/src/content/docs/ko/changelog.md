---
title: 변경 로그
---

## 2026.08.23
버전: **1.2.0**

에디터 컴포넌트에 기존 아이콘과 나란히 놓이는 텍스트 라벨이 추가되었습니다. 위치는 필드 왼쪽. [에디터 컴포넌트](/ko/editor/)를 참고하세요.

새로운 기능:

- **`FlyqlEditor`와 `FlyqlColumns`의 `label` 프롭** (Vue와 React 패키지 모두). 라벨은 필드 안, 쿼리 텍스트 앞에 렌더링됩니다. 너무 긴 라벨은 입력을 좁히는 대신 필드 너비의 절반에서 말줄임표로 잘립니다. 클릭하면 입력에 포커스가 가고, 텍스트 라벨은 입력의 접근성 이름이 됩니다. Vue에서는 더 풍부한 내용을 위한 `label` 슬롯도 제공합니다.
- **Vue에서 `icon`이 이제 프롭입니다** (이전에는 슬롯 전용). 문자열(텍스트로 렌더링), 컴포넌트, 또는 내장 아이콘을 없애는 `false`를 받습니다. `icon` 슬롯은 여전히 프롭보다 우선합니다. React에서는 기존 `icon` 렌더 프롭도 `false`를 받습니다.

동작 변경:

- **아이콘과 라벨이 새로운 flex 접두 요소를 공유합니다.** `.flyql-<root>__icon`은 더 이상 absolute로 배치되지 않고 `.flyql-<root>__prefix` 안에 있으며, 입력의 왼쪽 패딩도 아이콘 자리를 비워 두지 않습니다. 아이콘을 직접 배치하던 스타일시트는 수정이 필요합니다. `--flyql-*` 변수만 바꾸는 오버라이드는 영향을 받지 않습니다.
- **`--flyql-code-font-family` 기본값이 실제 폰트 스택이 되었습니다** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. 기존의 단순한 `monospace`는 브라우저마다 다른 폰트로 해석되어(macOS Chrome에서는 Menlo, Safari에서는 Courier) 아이콘과 라벨이 맞추는 기준 메트릭이 달라졌습니다. 이전 동작을 유지하려면 변수를 명시적으로 지정하세요.
- **내장 돋보기 아이콘을 viewBox 기준 1단위 아래로 옮겼습니다.** 고리와 손잡이 전체가 아니라 고리가 텍스트에 맞춰 중앙에 오도록 했습니다.

새 테마 변수 — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset`, `--flyql-label-offset` — 는 라벨 색상, 입력 줄 상자, 아이콘·라벨·텍스트 사이 간격, 두 가지 시각 보정을 제어합니다. [테마](/ko/editor/theming/)를 참고하세요.

## 2026.08.14
버전: **1.1.1**

버그 수정:

- **PostgreSQL 생성기의 JSON 경로 boolean 비교.** JSON 경로에 대한 따옴표 없는 boolean 리터럴(`jsonb_column.enabled = true`)이 기본 텍스트 비교로 처리되어 잘못된 SQL(`text = boolean`)을 생성했고, 따옴표로 감싼 boolean(`= 'true'`)은 `jsonb_typeof = 'string'` 가드로 보호되어 JSON boolean과는 조용히 아무것도 일치하지 않았습니다. 이제 따옴표 없는 boolean은 숫자 처리와 동일하게 `jsonb_typeof(...) = 'boolean'` 가드와 `::boolean` 캐스트를 생성합니다 (Go, Python, JavaScript 공통).

## 2026.08.12
버전: **1.1.0**

컬럼의 `values` 허용 목록이 이제 SQL 생성기, 인메모리 매처, 검증기 전반에서 일관되게 — 그리고 의미가 있는 곳에서만 — 적용됩니다. 전체 의미론은 [값 허용 목록](/ko/syntax/values/#값-허용-목록)을 참조하세요.

동작 변경:

- **`in` / `not in` 리스트가 허용 목록을 기준으로 검증됩니다.** 허용 목록이 있는 컬럼의 각 리스트 요소는 SQL 생성 중에 검사되며, 허용 목록에 없는 요소는 이제 조용히 0개의 행과 일치하는 대신 `unknown value`로 실패합니다. null 요소와 컬럼 참조는 예외입니다. 이전에 오타가 있는 리스트 요소로 SQL을 생성하던 쿼리는 이제 거부됩니다.
- **인메모리 매처가 허용 목록을 적용합니다.** 컬럼이 `values`를 선언한 스키마로 평가할 때, 허용 목록에 없는 `=` / `!=` 값이나 `in` 리스트 요소는 `unknown value`를 발생시킵니다 (이전에는 생성기와 달리 조용히 평가되어 동작 일치가 깨져 있었습니다). 스키마 없는 평가는 변경되지 않았습니다.
- **새 검증기 진단 `value_not_allowed`.** 이제 `diagnose()`는 동등 비교 값이나 in 리스트 요소가 컬럼의 허용 목록을 벗어나면 위치 정보가 포함된 오류를 내보냅니다. 방언-코어 스키마 브리지(`ToFlyQLSchema` / `toFlyQLSchema`)가 이제 `values`를 전달하므로, 브리지된 스키마도 이 진단에 참여합니다.

특정 컬럼에 대한 적용을 해제하려면 스키마에서 해당 컬럼의 `values` 목록을 제거하세요.

버그 수정:

- **허용 목록이 있는 컬럼에서 `= null`이 동작합니다.** null은 도메인 값이 아니라 존재 여부 술어입니다: `values` 허용 목록이 있는 컬럼에 대한 `col = null` / `col != null`은 이제 `unknown value`로 실패하는 대신 `IS NULL` / `IS NOT NULL`을 생성합니다.
- **패턴은 더 이상 허용 목록으로 검사되지 않습니다.** 허용 목록이 있는 컬럼의 `like` / `ilike` / `~` / `!~` 패턴은 정상적으로 생성됩니다. 이전에는 허용 목록에 문자 그대로 존재하지 않는 패턴이 모두 거부되어 이런 컬럼에서 패턴 매칭이 불가능했습니다.
- **Go PostgreSQL 생성기가 허용 목록 검사 전에 RHS 컬럼 참조를 해석합니다.** 허용 목록이 있는 컬럼에 대한 `col = other_column`은 이제 모든 생성기에서 컬럼-컬럼 비교를 생성합니다. 이전에는 ClickHouse와 StarRocks는 이를 허용했지만 Go PostgreSQL 생성기는 `unknown value`로 거부했습니다.

문서:

- 새 [값 허용 목록](/ko/syntax/values/#값-허용-목록) 섹션과 3치 논리에 대한 [NOT IN과 SQL NULL](/ko/syntax/lists/#not-in과-sql-null) 노트가 11개 로케일 전체에 추가되었습니다.

## 2026.07.21
버전: **1.0.2**

버그 수정:

- **비ASCII 입력에 대한 일관된 문자 오프셋.** 이제 파서는 세 언어 모두에서 입력을 유니코드 코드 포인트 단위로 스캔하므로 (Go는 `[]rune`으로, JavaScript는 `Array.from(text)`로 스캔), `Range` 오프셋이 바이트나 UTF-16 폭과 무관하게 문자당 한 단계씩 증가합니다. 이전에는 키릴 문자를 비롯한 멀티바이트/astral 문자가 Go, JavaScript, Python 포트 간에 오프셋 불일치를 일으켰습니다.
- **`tokenize()`의 코드 포인트 토큰 오프셋.** 이제 `tokenize()`는 모든 언어에서 `start`/`end`를 유니코드 코드 포인트 오프셋으로 보고하며, 모든 입력에 대해 Python, Go, JavaScript에서 동일합니다. 이전에는 비ASCII(및 astral) 문자에 대해 Go는 바이트 폭 토큰 범위를, JavaScript는 UTF-16 코드 유닛 범위를 내보내 간격 없는 오프셋 불변식이 깨졌습니다.
- **유효한 PostgreSQL 문자열 이스케이프.** 이제 PostgreSQL 생성기는 따옴표나 줄바꿈 같은 백슬래시 이스케이프를 포함하는 값에 대해 escape-string 리터럴(`E'...'`)을 내보냅니다. 일반 `'...'` 리터럴은 `standard_conforming_strings`(기본값)에서 백슬래시를 문자 그대로 처리하므로 잘못된 SQL이 생성될 수 있었습니다. 이스케이프가 필요 없는 값은 여전히 일반 `'...'`로 렌더링됩니다.

## 2026.05.08
버전: **1.0.0**

최초 공개 릴리스.
