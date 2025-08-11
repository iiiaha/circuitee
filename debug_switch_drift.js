// 스위치 Y좌표 드리프트 버그 해결됨!

// 문제: 스위치가 16px씩 아래로 내려가며 배치됨
// 원인: style.css에서 .element.switch에 position: relative가 설정되어 있었음
// 해결: position: relative 제거 (부모의 position: absolute 상속)

// === 버그 분석 ===
// 1. .element 클래스는 position: absolute로 설정
// 2. 하지만 .element.switch가 position: relative로 오버라이드
// 3. relative 포지션으로 인해 스위치들이 서로 상대적으로 배치됨
// 4. 각 스위치(높이 16px)가 이전 스위치 아래에 배치되어 16px씩 내려감

// === 디버깅 팁 ===
// offsetTop과 style.top이 다르면 CSS 포지셔닝 문제 의심
// getBoundingClientRect()로 실제 화면 위치 확인
// 개발자 도구의 Computed 탭에서 실제 적용된 CSS 확인