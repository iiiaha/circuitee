# Circuitee Light Exporter for SketchUp

D5Render 조명과 스위치를 CSV로 내보내어 Circuitee에서 사용할 수 있게 해주는 SketchUp 확장 프로그램입니다.

## 설치 방법

### RBZ 파일 만들기
1. `circuitee_exporter` 폴더를 ZIP으로 압축
2. 확장자를 `.zip`에서 `.rbz`로 변경

### SketchUp에 설치
1. SketchUp 실행
2. Window > Extension Manager 열기
3. "Install Extension" 버튼 클릭
4. `circuitee_exporter.rbz` 파일 선택
5. SketchUp 재시작

## 사용 방법

### 메뉴에서 실행
Extensions > iiiaha > Circuitee 조명 내보내기

### 툴바에서 실행
Circuitee Exporter 툴바의 아이콘 클릭

## 기능

- D5RenderLight.Spot (점조명) 내보내기
- D5RenderLight.Strip (라인조명) 내보내기
- SW가 포함된 컴포넌트 (스위치) 내보내기
- 2점 참조 시스템으로 정확한 스케일 매칭
- 스케치업 파일명 기반 CSV 파일명 자동 생성

## 내보내기 과정

1. 모델에서 조명/스위치 컴포넌트 검색
2. 첫 번째 참조점 선택 (Circuitee와 매칭할 점)
3. 두 번째 참조점 선택
4. CSV 파일 저장 위치 선택
5. Circuitee에서 "조명 불러오기"로 CSV 파일 불러오기

## 주의사항

- 점조명은 1/2 스케일이 자동 적용됩니다
- 스위치는 원본 스케일을 유지합니다
- Y축은 Circuitee에 맞게 자동 반전됩니다