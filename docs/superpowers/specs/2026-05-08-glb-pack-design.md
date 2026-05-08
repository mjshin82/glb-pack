# glb-pack — Texture Bbox Crop & UV Remap CLI

**Date:** 2026-05-08
**Status:** Design approved

## Purpose

외부 툴에서 만들어진 GLB 모델에서 텍스처 atlas의 *빈 공간*을 제거한다.
UV가 차지하는 영역만 잘라내고, 그에 맞춰 GLB 안의 UV 좌표를 0~1 공간에
재배치한 결과를 새 GLB와 별도 PNG, 그리고 둘을 묶은 zip으로 출력한다.

## Inputs / Outputs

```
Input:
  models/<name>.glb

Outputs:
  outputs/<name>.glb     # UV 재배치 + 모든 텍스처 cropped (모두 임베드)
  outputs/<name>.png     # baseColor cropped 결과 (별도 파일)
  outputs/<name>.zip     # 위 두 파일을 평탄하게 담은 zip
```

CLI:
```
$ glb-pack <name>
$ glb-pack ./path/to/model.glb
$ glb-pack <name> --no-zip
```

## Key Decisions (Approved)

1. **Packing 전략:** 단순 bounding-box crop (UV island repack 아님). 사용 영역의 사각형 bbox만 잘라내고 UV를 그 영역에 맞춰 scale/translate.
2. **기술 스택:** Node.js + TypeScript + [`gltf-transform`](https://gltf-transform.dev/) + [`sharp`](https://sharp.pixelplumbing.com/). `gltf-transform`은 glTF/GLB 수정의 사실상 표준이고, `sharp`는 native libvips 기반 빠른 이미지 처리.
3. **처리 스코프:** 모든 primitive가 *같은 단일 material*을 참조하는 모델 (mesh가 여러 개여도 OK, primitive가 여러 개여도 OK — 단 material만은 모두 동일). 그 material에 연결된 모든 PBR 텍스처(baseColor / normal / ORM / emissive 등)를 같은 픽셀 bbox로 동시 crop. 서로 다른 material을 가진 primitive가 하나라도 있으면 V1 미지원(에러).
4. **출력 크기:** Bbox 픽셀 크기 그대로 (NPOT 허용), padding 없음.
5. **Out-of-range UV:** UV가 [0,1] 밖이면 명확한 에러로 종료 (반복/타일링 모델은 bbox crop이 의미 없음).

## Processing Flow

```
[1] Load GLB                    gltf-transform Document
[2] Validate
      - 모든 primitive가 같은 material을 참조 (단일 material)
      - 그 material에 baseColor texture 존재
      - 모든 primitive의 UV (TEXCOORD_0) ∈ [0, 1]
      - TEXCOORD_1 가진 primitive 없음 (V1 제한)
[3] Compute UV bbox             모든 primitive의 모든 UV 점에서 (uMin, vMin, uMax, vMax)
[4] Crop textures               같은 픽셀 영역(bbox * 원본 해상도)을
                                material에 연결된 모든 texture에 적용
[5] Remap UVs                   u' = (u - uMin) / (uMax - uMin)
                                v' = (v - vMin) / (vMax - vMin)
                                accessor buffer 직접 갱신
[6] Replace textures + write    outputs/<name>.glb  (모든 texture 임베드)
                                outputs/<name>.png  (baseColor만 별도)
                                outputs/<name>.zip  (위 둘을 zip)
```

## Module Structure

```
src/
├─ cli.ts              # argv 파싱, 경로 추론, 메인 orchestration, exit code
├─ pipeline.ts         # 6단계 흐름 조립
│
├─ load.ts             # GLB → gltf-transform Document
├─ validate.ts         # 단일 material / texture 존재 / UV in [0,1] / no TEXCOORD_1
├─ uv-bbox.ts          # UV 좌표 → {uMin, vMin, uMax, vMax}     (pure)
├─ crop-textures.ts    # bbox × 원본 해상도 → sharp로 모든 texture crop
├─ remap-uv.ts         # accessor 안의 UV 좌표를 새 0~1 공간으로 변환  (pure)
├─ write-glb.ts        # 수정된 Document → outputs/<name>.glb
├─ write-png.ts        # baseColor cropped → outputs/<name>.png
├─ pack-zip.ts         # 위 둘을 zip으로 묶기
│
└─ errors.ts           # ValidationError 등 사용자용 에러 클래스/메시지
```

**경계 규칙:**
- `pipeline.ts`만 단계들을 알고, 단계 간 데이터는 명시적 인자/반환값으로만 전달 (전역 상태 없음)
- `validate.ts`만 throw하고, 다른 단계는 값 반환 (조기 종료는 `cli.ts` 한 곳에서 처리)
- `uv-bbox.ts`, `remap-uv.ts`는 순수 함수 — 단위 테스트 대상
- I/O 단계 (`load`, `crop-textures`, `write-*`, `pack-zip`)는 통합 테스트 대상

## CLI Interface

**입력 인자 해석:**
- `glb-pack <name>` → `models/<name>.glb` 자동 추론
- `<name>`이 `.glb`로 끝나면 그대로 경로로 사용 (예: `glb-pack ./foo/bar.glb`)
- 출력 디렉터리는 항상 `outputs/` (cwd 기준)

**옵션 (V1):**
- `--help`, `-h`
- `--version`, `-V`
- `--no-zip` — zip 생성 생략

**예시 실행:**
```
$ glb-pack JerseyBarrierB
✓ Loaded models/JerseyBarrierB.glb
✓ UV bbox: [0.10, 0.20] – [0.50, 0.40]
✓ Cropped 1 texture (1024×1024 → 410×205)
✓ Wrote outputs/JerseyBarrierB.glb
✓ Wrote outputs/JerseyBarrierB.png
✓ Wrote outputs/JerseyBarrierB.zip
```

**에러 종료 코드:**
- `0` — 성공
- `1` — 검증 실패 (멀티 material, 텍스처 부재, OOB UV, TEXCOORD_1 존재 등)
- `2` — 입력 파일 없음 / 입출력 에러

**검증 실패 메시지 (stderr) 예시:**
- `Multiple materials detected (got 3). V1 supports single-material models only (all primitives must share one material).`
- `No baseColor texture on material "X".`
- `UV out of [0,1] range on primitive of mesh "X" (min=-0.12, max=1.45). Wrap/repeat models are not supported.`
- `Primitive of mesh "X" has TEXCOORD_1. V1 supports TEXCOORD_0 only.`
- `Input not found: models/JerseyBarrierB.glb`

**패키징:**
- `package.json`의 `bin` 필드로 `glb-pack` 명령 등록
- `npm i -g .` 로 즉시 전역 설치 가능

## Output File Spec

| File | Content |
|---|---|
| `outputs/<name>.glb` | UV가 새 0~1 공간으로 재배치되고 모든 텍스처가 cropped 버전으로 교체된 GLB. baseColor 외 텍스처도 모두 임베드. |
| `outputs/<name>.png` | baseColor 텍스처의 cropped 결과. 다른 PBR 채널이 있어도 별도 PNG로는 baseColor만 (명세상 .png 한 장). |
| `outputs/<name>.zip` | 위 두 파일을 평탄하게(디렉터리 없이) 담은 zip. |

기존 출력 파일은 별도 prompt 없이 덮어쓴다.

## Edge Cases Handled

- 외부 텍스처 참조 (.glb 옆에 별도 PNG가 놓인 형태) — gltf-transform이 자동 resolve
- bbox가 매우 작은 경우 (1×1 미만) — 최소 1×1 픽셀로 round up
- UV가 정확히 1.0 — `≤ 1` 으로 inclusive 검증

## Out of Scope (V1)

명시적으로 V1에서 지원하지 않으며 입력으로 들어오면 에러 종료한다:

- Tiling/wrap UV (UV ∈ [0,1] 외)
- 여러 material / 텍스처 atlas 공유
- TEXCOORD_1 (multi UV channel)
- 진짜 UV island repack 알고리즘
- Padding (mip-bleed 방지)
- Power-of-two 강제 출력
- `--input-dir` / `--output-dir` 같은 입출력 디렉터리 커스터마이징

## Future Improvements (V2+)

필요해질 때 추가:

- 멀티 material 지원 (각 material 별 bbox crop 또는 atlas repack)
- UV island repack (`rectpack` / MaxRects 등)
- Padding 옵션 (`--padding <px>`)
- Power-of-two 강제 옵션
- 입출력 디렉터리 옵션
- Tiling UV 모델에 대한 별도 워크플로우

## Testing Strategy

**단위 테스트 (Vitest, 빠르게 실행)**
- `uv-bbox.ts` — fixture UV 좌표 배열 → 기대 bbox
  - 모든 점이 같은 곳: zero-area bbox → 1×1 픽셀로 round up
  - 0~1 boundary 포함
- `remap-uv.ts` — bbox + UV 입력 → 모든 출력 UV가 [0,1] 안
- `validate.ts` — 멀티 material / OOB UV / 텍스처 부재 / TEXCOORD_1 각각이 적절한 에러 throw

**통합 테스트 (실제 GLB)**
- Fixture: `tests/fixtures/JerseyBarrierB.glb` (사용자 제공 모델 복사)
- 파이프라인 실행 후:
  - 출력 GLB 다시 로드 → 모든 UV가 [0,1] 안
  - 출력 PNG 크기가 기대 bbox 픽셀 크기와 일치
  - zip 내용이 두 파일 (glb + png)
- 추가 fixture (직접 생성):
  - `multi-material.glb` (검증 실패 확인)
  - `oob-uv.glb` (검증 실패 확인)

**수동 검증 체크리스트** (자동화 안 함)
- 출력 GLB를 GLB 뷰어(예: gltf.report, Babylon viewer)에 띄워 시각이 원본과 동일한지
- 출력 PNG가 원본 텍스처에서 사용 영역만 잘려 있는지

**툴체인**
- TypeScript (strict mode)
- Vitest (단위 + 통합)
- ESLint + Prettier (기본 룰만)
- CI는 V1 미포함 (로컬 개발 위주로 시작)
