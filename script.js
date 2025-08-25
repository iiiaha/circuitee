// 전역 상태 관리
let state = {
    mode: 'edit', // 'edit' 또는 'test'
    floorPlan: null,
    elements: [],
    connections: [], // 연결 정보 배열 [{from: id, to: id, type: 'circuit'|'control'}]
    circuits: {}, // 회로 그룹 {circuitId: [lightIds]}
    circuitCounter: 1, // 회로 번호 카운터
    selectedTool: null,
    selectedElement: null,
    connectingFrom: null,
    elementIdCounter: 1,
    dragListeners: new Map(), // 메모리 누수 방지를 위한 리스너 관리
    linearLightStart: null, // 라인 조명 첫 번째 클릭 지점
    circuitColors: {}, // 회로별 색상 저장 {circuitId: color}
    csvImportMode: false, // CSV 가져오기 모드
    csvData: null, // CSV 데이터 임시 저장
    referencePoints: [], // 참조점 [sketchup: {p1, p2}, circuitee: {p1, p2}]
    csvReferenceMode: false, // 참조점 선택 모드
    switchStates: {} // 3로 스위치를 위한 스위치별 회로별 상태 {switchId: {circuitId: boolean}}
};

// Undo/Redo 스택
let undoStack = [];
let redoStack = [];
const MAX_UNDO_STACK_SIZE = 50;

// DOM 요소들
const dom = {
    canvas: null,
    floorPlanLayer: null,
    connectionLayer: null,
    elementLayer: null,
    uploadBtn: null,
    fileInput: null,
    modeToggle: null,
    shareBtn: null,
    sidebar: null,
    shareModal: null,
    shareUrl: null,
    copyBtn: null,
    closeModal: null,
    clearBtn: null,
    deleteBtn: null,
    connectBtn: null
};

// 초기화
function init() {
    initDOM();
    setupEventListeners();
    loadFromURL();
}

// DOM 요소 초기화
function initDOM() {
    dom.canvas = document.getElementById('canvas');
    dom.floorPlanLayer = document.getElementById('floorPlanLayer');
    dom.connectionLayer = document.getElementById('connectionLayer');
    dom.elementLayer = document.getElementById('elementLayer');
    dom.uploadBtn = document.getElementById('uploadBtn');
    dom.fileInput = document.getElementById('fileInput');
    dom.csvUploadBtn = document.getElementById('csvUploadBtn');
    dom.csvInput = document.getElementById('csvInput');
    dom.modeToggle = document.getElementById('modeToggle');
    dom.shareBtn = document.getElementById('shareBtn');
    dom.sidebar = document.getElementById('sidebar');
    dom.shareModal = document.getElementById('shareModal');
    dom.shareUrl = document.getElementById('shareUrl');
    dom.copyBtn = document.getElementById('copyBtn');
    dom.closeModal = document.getElementById('closeModal');
    dom.clearBtn = document.getElementById('clearBtn');
    dom.connectBtn = document.getElementById('connectBtn');
    dom.undoBtn = document.getElementById('undoBtn');
    dom.redoBtn = document.getElementById('redoBtn');
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 파일 업로드
    dom.uploadBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleFileUpload);
    
    // CSV 업로드
    dom.csvUploadBtn.addEventListener('click', () => dom.csvInput.click());
    dom.csvInput.addEventListener('change', handleCSVUpload);
    
    // 도구 버튼들
    document.querySelectorAll('.tool-btn-modern[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            // 토글 로직: 같은 도구를 다시 클릭하면 선택 해제
            if (state.selectedTool === btn.dataset.tool) {
                selectTool(null);
            } else {
                selectTool(btn.dataset.tool);
            }
        });
    });
    
    // 연결 버튼
    dom.connectBtn.addEventListener('click', () => {
        // 토글 로직: 연결 모드가 활성화되어 있으면 해제
        if (state.selectedTool === 'connect') {
            selectTool(null);
        } else {
            selectTool('connect');
        }
    });
    
    // 캔버스 클릭
    dom.elementLayer.addEventListener('click', handleCanvasClick);
    
    // 모드 전환
    dom.modeToggle.addEventListener('click', toggleMode);
    
    // 공유
    dom.shareBtn.addEventListener('click', showShareModal);
    dom.copyBtn.addEventListener('click', copyShareURL);
    dom.closeModal.addEventListener('click', () => dom.shareModal.hidden = true);
    
    // 모달 바깥 클릭시 닫기
    dom.shareModal.addEventListener('click', (e) => {
        if (e.target === dom.shareModal) {
            dom.shareModal.hidden = true;
        }
    });
    
    
    // 초기화
    dom.clearBtn.addEventListener('click', () => {
        if (confirm('모든 요소를 삭제하시겠습니까?')) {
            clearAll();
        }
    });
    
    // Undo/Redo
    dom.undoBtn.addEventListener('click', undo);
    dom.redoBtn.addEventListener('click', redo);
    
    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    });
}

// 파일 업로드 처리
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        if (file.size > 5 * 1024 * 1024) { // 5MB 제한
            alert('이미지 크기는 5MB 이하여야 합니다.');
            return;
        }
        processImageFile(file);
    }
}


// 이미지 파일 처리
function processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // 이미지 크기 조정 (최대 1200px)
            const maxSize = 1200;
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = (height / width) * maxSize;
                    width = maxSize;
                } else {
                    width = (width / height) * maxSize;
                    height = maxSize;
                }
            }
            
            // Canvas를 사용해 이미지 리사이징 및 압축
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // JPEG로 압축 (품질 0.8)
            state.floorPlan = canvas.toDataURL('image/jpeg', 0.8);
            displayFloorPlan();
            saveState('평면도 업로드');
            saveToURL();
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        alert('이미지를 읽는 중 오류가 발생했습니다.');
    };
    reader.readAsDataURL(file);
}

// 평면도 표시
function displayFloorPlan() {
    if (state.floorPlan) {
        dom.floorPlanLayer.innerHTML = `<img src="${state.floorPlan}" alt="평면도">`;
    } else {
        dom.floorPlanLayer.innerHTML = '';
    }
}

// 도구 선택
function selectTool(tool) {
    state.selectedTool = tool;
    state.connectingFrom = null;
    state.selectedElement = null;
    state.linearLightStart = null; // 라인 조명 시작점 초기화
    
    // 라인 조명 마커 제거
    const marker = document.getElementById('linear-light-marker');
    if (marker) marker.remove();
    
    // 도구 버튼 상태 업데이트
    document.querySelectorAll('.tool-btn-modern').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (tool) {
        const activeBtn = document.querySelector(`[data-tool="${tool}"]`) || 
                         (tool === 'connect' ? dom.connectBtn : null) ||
                         (tool === 'delete' ? dom.deleteBtn : null);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }
    
    // 바디 클래스 업데이트
    document.body.classList.toggle('delete-mode', tool === 'delete');
    
    // 기존 선택 해제
    document.querySelectorAll('.element.selected').forEach(el => {
        el.classList.remove('selected');
    });
    document.querySelectorAll('.element.connecting').forEach(el => {
        el.classList.remove('connecting');
    });
    document.querySelectorAll('.element-info-container').forEach(container => {
        container.remove();
    });
}

// 캔버스 클릭 처리
function handleCanvasClick(e) {
    // 테스트 모드에서는 회로 토글 버튼 닫기
    if (state.mode === 'test') {
        if (!e.target.closest('.element') && !e.target.closest('.circuit-toggles')) {
            document.querySelectorAll('.circuit-toggles').forEach(el => el.remove());
        }
        return;
    }
    
    if (state.mode !== 'edit') return;
    if (e.target.closest('.element')) return;
    
    const rect = dom.canvas.getBoundingClientRect();
    const scrollLeft = dom.canvas.scrollLeft;
    const scrollTop = dom.canvas.scrollTop;
    const x = e.clientX - rect.left + scrollLeft;
    const y = e.clientY - rect.top + scrollTop;
    
    
    // CSV 참조점 모드
    if (state.csvReferenceMode) {
        handleCSVReferenceClick(x, y);
        return;
    }
    
    // 편집 모드에서 빈 공간 클릭 시 선택 해제
    if (!state.selectedTool) {
        document.querySelectorAll('.element.selected').forEach(el => {
            el.classList.remove('selected');
        });
        document.querySelectorAll('.element-info-container').forEach(container => {
            container.remove();
        });
        state.selectedElement = null;
    }
    
    if (state.selectedTool === 'switch' || state.selectedTool === 'light') {
        addElement(state.selectedTool, x, y);
    } else if (state.selectedTool === 'linear-light') {
        handleLinearLightClick(x, y);
    }
}

// 라인 조명 클릭 처리
function handleLinearLightClick(x, y) {
    if (!state.linearLightStart) {
        // 첫 번째 클릭 - 시작점 저장
        state.linearLightStart = { x, y };
        
        // 시작점 표시 (임시 마커)
        const marker = document.createElement('div');
        marker.id = 'linear-light-marker';
        marker.style.position = 'absolute';
        marker.style.left = (x - 3) + 'px';
        marker.style.top = (y - 3) + 'px';
        marker.style.width = '6px';
        marker.style.height = '6px';
        marker.style.borderRadius = '50%';
        marker.style.background = '#2196F3';
        marker.style.zIndex = '1000';
        dom.elementLayer.appendChild(marker);
    } else {
        // 두 번째 클릭 - 라인 조명 생성
        const start = state.linearLightStart;
        
        // 시작점 마커 제거
        const marker = document.getElementById('linear-light-marker');
        if (marker) marker.remove();
        
        // 라인 조명 생성
        addLinearLight(start.x, start.y, x, y);
        
        // 상태 초기화
        state.linearLightStart = null;
    }
}

// 라인 조명 추가
function addLinearLight(x1, y1, x2, y2) {
    saveState('라인 조명 추가');
    // 기존 조명 번호들 확인
    const existingNumbers = state.elements
        .filter(el => el.type === 'light' || el.type === 'linear-light')
        .map(el => parseInt(el.label.replace('L', '')))
        .sort((a, b) => a - b);
    
    let newNumber = 1;
    if (existingNumbers.length > 0) {
        // 1부터 시작해서 빈 번호 찾기
        for (let i = 1; i <= existingNumbers[existingNumbers.length - 1] + 1; i++) {
            if (!existingNumbers.includes(i)) {
                newNumber = i;
                break;
            }
        }
    }
    
    const label = `L${newNumber}`;
    
    // 길이와 각도 계산
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    
    const element = {
        id: `element-${state.elementIdCounter++}`,
        type: 'linear-light',
        x: x1,
        y: y1,
        x2: x2,
        y2: y2,
        length: length,
        angle: angle,
        state: false,
        label: label,
        circuit: null,
        switchId: null
    };
    
    state.elements.push(element);
    renderElement(element);
    saveToURL();
}

// 상태 저장 (Undo 스택에)
function saveState(description) {
    const stateSnapshot = {
        description: description,
        elements: JSON.parse(JSON.stringify(state.elements)),
        connections: JSON.parse(JSON.stringify(state.connections)),
        circuits: JSON.parse(JSON.stringify(state.circuits)),
        circuitCounter: state.circuitCounter,
        elementIdCounter: state.elementIdCounter,
        circuitColors: JSON.parse(JSON.stringify(state.circuitColors))
    };
    
    undoStack.push(stateSnapshot);
    
    // 스택 크기 제한
    if (undoStack.length > MAX_UNDO_STACK_SIZE) {
        undoStack.shift();
    }
    
    // Redo 스택 초기화
    redoStack = [];
    
    updateUndoRedoButtons();
}

// Undo 기능
function undo() {
    if (undoStack.length === 0) return;
    
    // 현재 상태를 redo 스택에 저장
    const currentState = {
        description: 'Current state',
        elements: JSON.parse(JSON.stringify(state.elements)),
        connections: JSON.parse(JSON.stringify(state.connections)),
        circuits: JSON.parse(JSON.stringify(state.circuits)),
        circuitCounter: state.circuitCounter,
        elementIdCounter: state.elementIdCounter,
        circuitColors: JSON.parse(JSON.stringify(state.circuitColors))
    };
    redoStack.push(currentState);
    
    // 이전 상태 복원
    const previousState = undoStack.pop();
    restoreState(previousState);
    
    updateUndoRedoButtons();
}

// Redo 기능
function redo() {
    if (redoStack.length === 0) return;
    
    // 현재 상태를 undo 스택에 저장
    const currentState = {
        description: 'Current state',
        elements: JSON.parse(JSON.stringify(state.elements)),
        connections: JSON.parse(JSON.stringify(state.connections)),
        circuits: JSON.parse(JSON.stringify(state.circuits)),
        circuitCounter: state.circuitCounter,
        elementIdCounter: state.elementIdCounter,
        circuitColors: JSON.parse(JSON.stringify(state.circuitColors))
    };
    undoStack.push(currentState);
    
    // 다음 상태 복원
    const nextState = redoStack.pop();
    restoreState(nextState);
    
    updateUndoRedoButtons();
}

// 상태 복원
function restoreState(snapshot) {
    state.elements = JSON.parse(JSON.stringify(snapshot.elements));
    state.connections = JSON.parse(JSON.stringify(snapshot.connections));
    state.circuits = JSON.parse(JSON.stringify(snapshot.circuits));
    state.circuitCounter = snapshot.circuitCounter;
    state.elementIdCounter = snapshot.elementIdCounter;
    state.circuitColors = JSON.parse(JSON.stringify(snapshot.circuitColors));
    
    renderAll();
    saveToURL();
}

// Undo/Redo 버튼 상태 업데이트
function updateUndoRedoButtons() {
    dom.undoBtn.disabled = undoStack.length === 0;
    dom.redoBtn.disabled = redoStack.length === 0;
}

// 요소 추가
function addElement(type, x, y) {
    saveState(`${type} 추가`);
    let label;
    
    if (type === 'switch') {
        // 기존 스위치 번호들 확인
        const existingNumbers = state.elements
            .filter(el => el.type === 'switch')
            .map(el => parseInt(el.label.replace('SW', '')))
            .sort((a, b) => a - b);
        
        // 빈 번호 찾기
        let newNumber = 1;
        if (existingNumbers.length > 0) {
            // 1부터 시작해서 빈 번호 찾기
            for (let i = 1; i <= existingNumbers[existingNumbers.length - 1] + 1; i++) {
                if (!existingNumbers.includes(i)) {
                    newNumber = i;
                    break;
                }
            }
        }
        
        label = `SW${newNumber}`;
        
    } else {
        // 조명도 같은 방식으로
        const existingNumbers = state.elements
            .filter(el => el.type === 'light')
            .map(el => parseInt(el.label.replace('L', '')))
            .sort((a, b) => a - b);
        
        let newNumber = 1;
        if (existingNumbers.length > 0) {
            // 1부터 시작해서 빈 번호 찾기
            for (let i = 1; i <= existingNumbers[existingNumbers.length - 1] + 1; i++) {
                if (!existingNumbers.includes(i)) {
                    newNumber = i;
                    break;
                }
            }
        }
        
        label = `L${newNumber}`;
    }
    
    const element = {
        id: `element-${state.elementIdCounter++}`,
        type: type,
        x: x - (type === 'switch' ? 16 : 4), // 중앙 정렬 (스위치 32px, 조명 8px)
        y: y - (type === 'switch' ? 8 : 4),
        state: type === 'light' ? false : null,
        label: label,
        circuit: null, // 조명의 회로 ID
        switchId: null // 조명을 제어하는 스위치 ID
    };
    
    state.elements.push(element);
    renderElement(element);
    saveToURL();
}

// 요소 렌더링
function renderElement(element) {
    const div = document.createElement('div');
    div.className = `element ${element.type}`;
    div.id = element.id;
    div.style.left = element.x + 'px';
    div.style.top = element.y + 'px';
    
    if (element.type === 'switch') {
        div.textContent = element.label || 'SW';
        
        // 3로 스위치 표시: 이 스위치에 연결된 회로 확인
        const connectedCircuits = getSwitchCircuits(element.id);
        if (connectedCircuits.length > 0) {
            // 각 회로에 연결된 스위치 개수 확인
            let is3Way = false;
            connectedCircuits.forEach(circuitId => {
                const circuitLights = state.elements.filter(el => 
                    (el.type === 'light' || el.type === 'linear-light') && 
                    el.circuit === circuitId
                );
                
                // 회로에 연결된 스위치 수 계산
                const connectedSwitches = new Set();
                circuitLights.forEach(light => {
                    if (light.switchIds && light.switchIds.length > 0) {
                        light.switchIds.forEach(swId => connectedSwitches.add(swId));
                    } else if (light.switchId) {
                        connectedSwitches.add(light.switchId);
                    }
                });
                
                if (connectedSwitches.size > 1) {
                    is3Way = true;
                }
            });
            
            // 3로 스위치면 특별한 표시 추가
            if (is3Way) {
                div.classList.add('three-way');
                const indicator = document.createElement('span');
                indicator.className = 'three-way-indicator';
                indicator.textContent = '3';
                div.appendChild(indicator);
            }
        }
    } else if (element.type === 'light') {
        // 조명은 이제 텍스트 없이 CSS로만 표현
        if (element.state) {
            div.classList.add('on');
        }
    } else if (element.type === 'linear-light') {
        // 라인 조명 스타일 설정
        div.style.width = element.length + 'px';
        div.style.transform = `rotate(${element.angle}deg)`;
        if (element.state) {
            div.classList.add('on');
        }
    }
    
    if (state.mode === 'edit') {
        setupElementInteractions(div, element);
    } else if (state.mode === 'test' && element.type === 'switch') {
        div.addEventListener('click', (e) => handleSwitchClick(e, element));
    }
    
    dom.elementLayer.appendChild(div);
}

// 요소 상호작용 설정
function setupElementInteractions(elementDiv, elementData) {
    // 클릭 이벤트
    elementDiv.addEventListener('click', (e) => handleElementClick(e, elementData));
    
    // 드래그 설정
    setupDragging(elementDiv, elementData);
}

// 요소 클릭 처리
function handleElementClick(e, elementData) {
    e.stopPropagation();
    
    // 드래그가 막 끝났으면 선택하지 않음
    if (elementData._justFinishedDragging) {
        elementData._justFinishedDragging = false;
        return;
    }
    
    if (state.selectedTool === 'connect') {
        handleConnectionClick(elementData);
        return;
    }
    
    // 일반 선택
    selectElement(elementData.id);
}

// 요소 삭제
function deleteElement(elementId) {
    saveState('요소 삭제');
    const element = state.elements.find(el => el.id === elementId);
    if (!element) return;
    
    // 조명인 경우 회로에서 제거
    if ((element.type === 'light' || element.type === 'linear-light') && element.circuit) {
        const circuit = state.circuits[element.circuit];
        if (circuit) {
            state.circuits[element.circuit] = circuit.filter(id => id !== elementId);
            if (state.circuits[element.circuit].length === 0) {
                delete state.circuits[element.circuit];
            }
        }
    }
    
    // 다른 조명의 스위치 속성에서 이 요소 제거
    if (element.type === 'switch') {
        state.elements.forEach(el => {
            if ((el.type === 'light' || el.type === 'linear-light') && el.switchId === elementId) {
                el.switchId = null;
            }
        });
    }
    
    // 연결 정보에서 제거
    state.connections = state.connections.filter(
        conn => conn.from !== elementId && conn.to !== elementId
    );
    
    // 상태에서 제거
    state.elements = state.elements.filter(el => el.id !== elementId);
    
    // DOM에서 제거
    document.getElementById(elementId)?.remove();
    
    // 연결선 다시 그리기
    redrawConnections();
    saveToURL();
}

// 연결선용 색상 생성 (채도 80%, 명도 40%)
function generateFluorescentColor() {
    const fluorescents = [
        'hsl(120, 80%, 40%)', // 초록
        'hsl(300, 80%, 40%)', // 보라
        'hsl(180, 80%, 40%)', // 청록
        'hsl(60, 80%, 40%)',  // 노랑
        'hsl(30, 80%, 40%)',  // 주황
        'hsl(200, 80%, 40%)', // 하늘
        'hsl(340, 80%, 40%)', // 핑크
        'hsl(150, 80%, 40%)', // 민트
        'hsl(280, 80%, 40%)', // 진보라
        'hsl(90, 80%, 40%)',  // 연두
        'hsl(270, 80%, 40%)', // 남보라
        'hsl(210, 80%, 40%)', // 진하늘
        'hsl(160, 80%, 40%)', // 청록민트
        'hsl(40, 80%, 40%)',  // 골드
        'hsl(350, 80%, 40%)', // 진핑크
        'hsl(190, 80%, 40%)', // 스카이블루
        'hsl(130, 80%, 40%)', // 에메랄드
        'hsl(50, 80%, 40%)',  // 라임
        'hsl(320, 80%, 40%)', // 마젠타
        'hsl(170, 80%, 40%)', // 터콰이즈
    ];
    
    // 랜덤하게 미리 정의된 색상 선택
    return fluorescents[Math.floor(Math.random() * fluorescents.length)];
}

// 회로 색상 가져오기 (없으면 생성)
function getCircuitColor(circuitId) {
    if (!state.circuitColors[circuitId]) {
        state.circuitColors[circuitId] = generateFluorescentColor();
    }
    return state.circuitColors[circuitId];
}

// 스위치의 구수 계산
function calculateSwitchGang(switchId) {
    // 이 스위치에 연결된 모든 조명 찾기
    const connectedLights = state.elements.filter(el => 
        (el.type === 'light' || el.type === 'linear-light') && el.switchId === switchId
    );
    
    // 연결된 조명들의 회로를 중복 없이 수집
    const uniqueCircuits = new Set();
    connectedLights.forEach(light => {
        if (light.circuit) {
            uniqueCircuits.add(light.circuit);
        }
    });
    
    return uniqueCircuits.size;
}

// 스위치에 연결된 회로들 가져오기
function getSwitchCircuits(switchId) {
    // 이 스위치에 연결된 모든 조명 찾기
    const connectedLights = state.elements.filter(el => {
        if (el.type !== 'light' && el.type !== 'linear-light') return false;
        // 새로운 switchIds 배열 확인
        if (el.switchIds) {
            return el.switchIds.includes(switchId);
        }
        // 기존 switchId 속성도 확인 (하위 호환성)
        return el.switchId === switchId;
    });
    
    // 연결된 조명들의 회로를 중복 없이 수집
    const uniqueCircuits = new Set();
    connectedLights.forEach(light => {
        if (light.circuit) {
            uniqueCircuits.add(light.circuit);
        }
    });
    
    return Array.from(uniqueCircuits).sort();
}

// 요소 선택
function selectElement(elementId) {
    // 기존 선택 해제 및 정보 컨테이너 제거
    document.querySelectorAll('.element.selected').forEach(el => {
        el.classList.remove('selected');
    });
    document.querySelectorAll('.element-info-container').forEach(container => {
        container.remove();
    });
    
    const element = document.getElementById(elementId);
    const elementData = state.elements.find(el => el.id === elementId);
    
    if (element && elementData) {
        element.classList.add('selected');
        state.selectedElement = elementId;
        
        // 정보 컨테이너 생성
        const infoContainer = document.createElement('div');
        infoContainer.className = 'element-info-container';
        infoContainer.dataset.elementId = elementId;
        
        if (elementData.type === 'light' || elementData.type === 'linear-light') {
            // 회로 정보
            const circuitRow = document.createElement('div');
            circuitRow.className = 'element-info-row';
            circuitRow.innerHTML = `
                <span class="element-info-label">회로:</span>
                <span class="element-info-value">${elementData.circuit || '없음'}</span>
            `;
            infoContainer.appendChild(circuitRow);
            
            // 스위치 정보
            const switchRow = document.createElement('div');
            switchRow.className = 'element-info-row';
            const switchData = elementData.switchId ? 
                state.elements.find(el => el.id === elementData.switchId) : null;
            const switchText = switchData ? switchData.label : '없음';
            switchRow.innerHTML = `
                <span class="element-info-label">스위치:</span>
                <span class="element-info-value">${switchText}</span>
            `;
            infoContainer.appendChild(switchRow);
        } else if (elementData.type === 'switch') {
            // 스위치의 구수 정보
            const gangCount = calculateSwitchGang(elementId);
            const gangRow = document.createElement('div');
            gangRow.className = 'element-info-row';
            gangRow.innerHTML = `
                <span class="element-info-label">구수:</span>
                <span class="element-info-value">${gangCount}구</span>
            `;
            infoContainer.appendChild(gangRow);
        }
        
        // 삭제 버튼
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'element-info-delete';
        deleteBtn.textContent = '삭제';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteElement(elementId);
        };
        infoContainer.appendChild(deleteBtn);
        
        // 화살표 추가
        const arrow = document.createElement('div');
        arrow.className = 'element-info-arrow';
        infoContainer.appendChild(arrow);
        
        // 위치 계산
        const rect = element.getBoundingClientRect();
        const canvasRect = dom.canvas.getBoundingClientRect();
        
        infoContainer.style.position = 'fixed';
        infoContainer.style.left = rect.left + rect.width / 2 + 'px';
        
        // 요소 타입에 따라 위치 조정 - 정보 컨테이너가 요소 위에 위치하도록
        if (elementData.type === 'switch') {
            infoContainer.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            infoContainer.style.top = 'auto';
        } else {
            // 조명 요소의 경우 요소 위에 표시
            infoContainer.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
            infoContainer.style.top = 'auto';
        }
        
        infoContainer.style.transform = 'translateX(-50%)';
        
        document.body.appendChild(infoContainer);
    }
}

// 연결 클릭 처리
function handleConnectionClick(elementData) {
    if (!state.connectingFrom) {
        // 첫 번째 클릭
        state.connectingFrom = elementData.id;
        document.getElementById(elementData.id).classList.add('connecting');
    } else {
        // 두 번째 클릭
        const fromElement = state.elements.find(el => el.id === state.connectingFrom);
        const toElement = elementData;
        
        if (state.connectingFrom !== elementData.id) {
            // 같은 요소가 아닐 때만 연결
            const isLight = (el) => el.type === 'light' || el.type === 'linear-light';
            
            if (isLight(fromElement) && isLight(toElement)) {
                // 조명-조명 연결 (회로)
                connectLights(fromElement, toElement);
                
                // 스위치가 아닌 경우, 두 번째 요소를 새로운 시작점으로
                document.getElementById(state.connectingFrom).classList.remove('connecting');
                state.connectingFrom = toElement.id;
                document.getElementById(toElement.id).classList.add('connecting');
                
            } else if ((isLight(fromElement) && toElement.type === 'switch') || 
                       (fromElement.type === 'switch' && isLight(toElement))) {
                // 조명-스위치 연결 (제어)
                connectLightToSwitch(fromElement, toElement);
                
                // 스위치에 도달했으므로 연결 종료
                document.getElementById(state.connectingFrom).classList.remove('connecting');
                state.connectingFrom = null;
            }
        } else {
            // 같은 요소를 다시 클릭하면 연결 취소
            document.getElementById(state.connectingFrom).classList.remove('connecting');
            state.connectingFrom = null;
        }
    }
}

// 조명-조명 연결 (회로)
function connectLights(light1, light2) {
    saveState('조명 연결');
    // 이미 연결되어 있는지 확인
    const existingConnection = state.connections.find(
        conn => (conn.from === light1.id && conn.to === light2.id) ||
                (conn.from === light2.id && conn.to === light1.id)
    );
    
    if (existingConnection) return;
    
    // 회로 할당
    if (light1.circuit && light2.circuit && light1.circuit !== light2.circuit) {
        // 두 조명이 다른 회로에 속해있으면 병합
        mergeCircuits(light1.circuit, light2.circuit);
    } else if (light1.circuit) {
        // light1이 회로를 가지고 있으면 light2도 같은 회로로
        light2.circuit = light1.circuit;
        if (!state.circuits[light1.circuit].includes(light2.id)) {
            state.circuits[light1.circuit].push(light2.id);
        }
        // light1의 스위치 속성을 light2도 공유 (3로 스위치 지원)
        if (light1.switchIds) {
            light2.switchIds = [...light1.switchIds];
        } else if (light1.switchId) {
            light2.switchIds = [light1.switchId];
        }
        
        // 같은 회로의 모든 조명에 스위치 속성 전파
        const switchIds = light1.switchIds || (light1.switchId ? [light1.switchId] : []);
        if (switchIds.length > 0) {
            const circuitLights = state.circuits[light1.circuit];
            circuitLights.forEach(lightId => {
                const light = state.elements.find(el => el.id === lightId);
                if (light) {
                    light.switchIds = [...switchIds];
                    delete light.switchId; // 기존 속성 제거
                }
            });
        }
    } else if (light2.circuit) {
        // light2가 회로를 가지고 있으면 light1도 같은 회로로
        light1.circuit = light2.circuit;
        if (!state.circuits[light2.circuit].includes(light1.id)) {
            state.circuits[light2.circuit].push(light1.id);
        }
        // light2의 스위치 속성을 light1도 공유 (3로 스위치 지원)
        if (light2.switchIds) {
            light1.switchIds = [...light2.switchIds];
        } else if (light2.switchId) {
            light1.switchIds = [light2.switchId];
        }
        
        // 같은 회로의 모든 조명에 스위치 속성 전파
        const switchIds = light2.switchIds || (light2.switchId ? [light2.switchId] : []);
        if (switchIds.length > 0) {
            const circuitLights = state.circuits[light2.circuit];
            circuitLights.forEach(lightId => {
                const light = state.elements.find(el => el.id === lightId);
                if (light) {
                    light.switchIds = [...switchIds];
                    delete light.switchId; // 기존 속성 제거
                }
            });
        }
    } else {
        // 둘 다 회로가 없으면 새 회로 생성
        const newCircuitId = `c${state.circuitCounter++}`;
        light1.circuit = newCircuitId;
        light2.circuit = newCircuitId;
        state.circuits[newCircuitId] = [light1.id, light2.id];
        
        // 스위치 속성도 공유 (3로 스위치 지원)
        const switchIds = light1.switchIds || light2.switchIds || 
                        (light1.switchId ? [light1.switchId] : null) || 
                        (light2.switchId ? [light2.switchId] : null);
        if (switchIds) {
            light1.switchIds = [...switchIds];
            light2.switchIds = [...switchIds];
            delete light1.switchId;
            delete light2.switchId;
        }
    }
    
    // 연결 정보 저장
    state.connections.push({
        from: light1.id,
        to: light2.id,
        type: 'circuit'
    });
    
    drawConnection(light1.id, light2.id);
    saveToURL();
}

// 조명-스위치 연결 (제어)
function connectLightToSwitch(element1, element2) {
    saveState('스위치 연결');
    const isLight = (el) => el.type === 'light' || el.type === 'linear-light';
    const light = isLight(element1) ? element1 : element2;
    const switchEl = element1.type === 'switch' ? element1 : element2;
    
    // 이미 연결되어 있는지 확인
    const existingConnection = state.connections.find(
        conn => (conn.from === light.id && conn.to === switchEl.id) ||
                (conn.from === switchEl.id && conn.to === light.id)
    );
    
    if (existingConnection) return;
    
    // 조명에 회로가 없으면 새로운 회로 생성
    if (!light.circuit) {
        const newCircuitId = `c${state.circuitCounter++}`;
        light.circuit = newCircuitId;
        state.circuits[newCircuitId] = [light.id];
    }
    
    // 조명이 회로에 속해있는 경우
    if (light.circuit) {
        // 같은 회로의 모든 조명들의 스위치 속성을 업데이트
        const circuitLights = state.circuits[light.circuit] || [];
        circuitLights.forEach(lightId => {
            const circuitLight = state.elements.find(el => el.id === lightId);
            if (circuitLight) {
                // 3로 스위치 지원: switchIds 배열로 관리
                if (!circuitLight.switchIds) {
                    // 기존 switchId를 배열로 변환
                    circuitLight.switchIds = circuitLight.switchId ? [circuitLight.switchId] : [];
                    delete circuitLight.switchId; // 기존 속성 제거
                }
                
                // 새 스위치를 배열에 추가 (중복 방지)
                if (!circuitLight.switchIds.includes(switchEl.id)) {
                    circuitLight.switchIds.push(switchEl.id);
                }
            }
        });
        
        // 직접 클릭한 조명과 스위치 사이에만 연결선 추가
        state.connections.push({
            from: light.id,
            to: switchEl.id,
            type: 'control'
        });
    }
    
    // 연결선 다시 그리기
    redrawConnections();
    saveToURL();
}

// 회로 병합
function mergeCircuits(circuit1, circuit2) {
    // 두 회로의 스위치 속성 확인
    const lights1 = state.circuits[circuit1] || [];
    const lights2 = state.circuits[circuit2] || [];
    
    let switchIds1 = [];
    let switchIds2 = [];
    
    // circuit1의 모든 스위치 수집
    for (const lightId of lights1) {
        const light = state.elements.find(el => el.id === lightId);
        if (light) {
            if (light.switchIds) {
                switchIds1 = [...new Set([...switchIds1, ...light.switchIds])];
            } else if (light.switchId) {
                switchIds1 = [...new Set([...switchIds1, light.switchId])];
            }
        }
    }
    
    // circuit2의 모든 스위치 수집
    for (const lightId of lights2) {
        const light = state.elements.find(el => el.id === lightId);
        if (light) {
            if (light.switchIds) {
                switchIds2 = [...new Set([...switchIds2, ...light.switchIds])];
            } else if (light.switchId) {
                switchIds2 = [...new Set([...switchIds2, light.switchId])];
            }
        }
    }
    
    // 병합할 스위치들 결정 (두 회로의 모든 스위치를 합침)
    const finalSwitchIds = [...new Set([...switchIds1, ...switchIds2])];
    
    // circuit2의 모든 조명을 circuit1로 이동
    lights2.forEach(lightId => {
        const light = state.elements.find(el => el.id === lightId);
        if (light) {
            light.circuit = circuit1;
            light.switchIds = finalSwitchIds.length > 0 ? [...finalSwitchIds] : [];
            delete light.switchId; // 기존 속성 제거
            if (!state.circuits[circuit1].includes(lightId)) {
                state.circuits[circuit1].push(lightId);
            }
        }
    });
    
    // circuit1의 모든 조명에도 병합된 스위치 속성 적용
    lights1.forEach(lightId => {
        const light = state.elements.find(el => el.id === lightId);
        if (light) {
            light.switchIds = finalSwitchIds.length > 0 ? [...finalSwitchIds] : [];
            delete light.switchId; // 기존 속성 제거
        }
    });
    
    // circuit2 삭제
    delete state.circuits[circuit2];
}

// 연결선 그리기
function drawConnection(fromId, toId) {
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    
    if (!fromEl || !toEl) return;
    
    const fromData = state.elements.find(el => el.id === fromId);
    const toData = state.elements.find(el => el.id === toId);
    
    if (!fromData || !toData) return;
    
    // 각 요소 타입에 따른 중심점 계산
    let x1, y1, x2, y2;
    
    if (fromData.type === 'switch') {
        x1 = fromData.x + 16;
        y1 = fromData.y + 8;
    } else if (fromData.type === 'light') {
        x1 = fromData.x + 4;
        y1 = fromData.y + 4;
    } else if (fromData.type === 'linear-light') {
        // 라인 조명의 중심점
        x1 = fromData.x + (fromData.x2 - fromData.x) / 2;
        y1 = fromData.y + (fromData.y2 - fromData.y) / 2;
    }
    
    if (toData.type === 'switch') {
        x2 = toData.x + 16;
        y2 = toData.y + 8;
    } else if (toData.type === 'light') {
        x2 = toData.x + 4;
        y2 = toData.y + 4;
    } else if (toData.type === 'linear-light') {
        // 라인 조명의 중심점
        x2 = toData.x + (toData.x2 - toData.x) / 2;
        y2 = toData.y + (toData.y2 - toData.y) / 2;
    }
    
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    
    // 연결 타입 확인
    const connection = state.connections.find(
        conn => (conn.from === fromId && conn.to === toId) || 
                (conn.from === toId && conn.to === fromId)
    );
    
    const line = document.createElement('div');
    line.className = 'connection-line';
    if (connection && connection.type) {
        line.classList.add(connection.type);
        
        // 연결된 요소들 찾기
        const fromElement = state.elements.find(el => el.id === fromId);
        const toElement = state.elements.find(el => el.id === toId);
        
        // 회로 연결인 경우 회로 색상 적용
        if (connection.type === 'circuit') {
            if (fromElement && fromElement.circuit) {
                const circuitColor = getCircuitColor(fromElement.circuit);
                line.style.background = circuitColor;
            }
        }
        // 제어 연결인 경우도 조명의 회로 색상 적용
        else if (connection.type === 'control') {
            // 조명 찾기 (fromElement나 toElement 중 조명인 것)
            const light = (fromElement.type === 'light' || fromElement.type === 'linear-light') ? fromElement : toElement;
            if (light && light.circuit) {
                const circuitColor = getCircuitColor(light.circuit);
                line.style.background = circuitColor;
            }
        }
    }
    line.style.left = x1 + 'px';
    line.style.top = y1 + 'px';
    line.style.width = distance + 'px';
    line.style.transform = `rotate(${angle}deg)`;
    line.dataset.from = fromId;
    line.dataset.to = toId;
    
    dom.connectionLayer.appendChild(line);
}

// 연결선 다시 그리기
function redrawConnections() {
    // 기존 연결선 모두 제거
    dom.connectionLayer.innerHTML = '';
    
    // 모든 연결 다시 그리기
    state.connections.forEach(conn => {
        drawConnection(conn.from, conn.to);
    });
}

// 드래그 설정
function setupDragging(element, elementData) {
    let isDragging = false;
    let startX, startY;
    let hasMoved = false;
    let initialX, initialY;
    
    const handleMouseDown = (e) => {
        if (state.selectedTool === 'connect') return;
        if (e.target.classList.contains('delete-button')) return;
        
        isDragging = true;
        const rect = dom.canvas.getBoundingClientRect();
        const scrollLeft = dom.canvas.scrollLeft;
        const scrollTop = dom.canvas.scrollTop;
        startX = e.clientX - rect.left + scrollLeft - elementData.x;
        startY = e.clientY - rect.top + scrollTop - elementData.y;
        initialX = elementData.x;
        initialY = elementData.y;
        hasMoved = false;
        
        element.style.cursor = 'grabbing';
        element.style.zIndex = '100';
        e.preventDefault();
    };
    
    const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        const rect = dom.canvas.getBoundingClientRect();
        const scrollLeft = dom.canvas.scrollLeft;
        const scrollTop = dom.canvas.scrollTop;
        let newX = e.clientX - rect.left + scrollLeft - startX;
        let newY = e.clientY - rect.top + scrollTop - startY;
        
        // 경계 제한은 나중에 처리
        
        // 실제로 움직였는지 확인
        if (Math.abs(newX - initialX) > 2 || Math.abs(newY - initialY) > 2) {
            hasMoved = true;
        }
        
        // 캔버스 크기 체크
        const canvasWidth = 1600;
        const canvasHeight = 900;
        newX = Math.max(0, Math.min(newX, canvasWidth - element.offsetWidth));
        newY = Math.max(0, Math.min(newY, canvasHeight - element.offsetHeight));
        
        // 라인 조명의 경우 끝점도 같이 이동
        if (elementData.type === 'linear-light') {
            const deltaX = newX - elementData.x;
            const deltaY = newY - elementData.y;
            elementData.x2 += deltaX;
            elementData.y2 += deltaY;
        }
        
        elementData.x = newX;
        elementData.y = newY;
        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
        
        // 연결선 업데이트
        redrawConnections();
    };
    
    const handleMouseUp = () => {
        if (!isDragging) return;
        
        isDragging = false;
        element.style.cursor = 'move';
        element.style.zIndex = '';
        
        // 실제로 움직였을 때만 플래그 설정
        if (hasMoved) {
            elementData._justFinishedDragging = true;
            saveState('요소 이동');
        }
        
        saveToURL();
    };
    
    // 이벤트 리스너 등록
    element.addEventListener('mousedown', handleMouseDown);
    
    // 문서 레벨 이벤트는 각 요소마다 필요함
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // cleanup 함수를 요소에 저장
    element._cleanupDrag = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
}

// 스위치 클릭 처리 (테스트 모드)
function handleSwitchClick(e, switchData) {
    e.stopPropagation();
    const switchEl = e.currentTarget;
    
    // 기존 회로 토글 버튼이 있으면 제거
    const existingToggles = document.querySelector('.circuit-toggles');
    if (existingToggles && existingToggles.dataset.switchId === switchData.id) {
        existingToggles.remove();
        return;
    }
    
    // 다른 스위치의 토글 버튼 제거
    document.querySelectorAll('.circuit-toggles').forEach(el => el.remove());
    
    // 이 스위치에 연결된 회로들 가져오기
    const circuits = getSwitchCircuits(switchData.id);
    
    if (circuits.length === 0) return;
    
    // 회로별 토글 버튼 컨테이너 생성
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'circuit-toggles';
    toggleContainer.dataset.switchId = switchData.id;
    
    // 스위치의 위치 가져오기
    const rect = switchEl.getBoundingClientRect();
    const canvasRect = dom.canvas.getBoundingClientRect();
    
    // 토글 컨테이너 위치 설정
    toggleContainer.style.position = 'fixed';
    toggleContainer.style.left = (rect.right + 5) + 'px';
    toggleContainer.style.top = (rect.top + rect.height / 2) + 'px';
    toggleContainer.style.transform = 'translateY(-50%)';
    
    // 각 회로별로 토글 버튼 생성
    circuits.forEach(circuitId => {
        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'circuit-toggle';
        toggleBtn.dataset.circuit = circuitId;
        // 회로 번호만 추출 (c1 -> 1)
        toggleBtn.dataset.circuitNum = circuitId.replace('c', '');
        
        // 스위치 상태 초기화 (없으면 생성)
        if (!state.switchStates[switchData.id]) {
            state.switchStates[switchData.id] = {};
        }
        
        // 현재 스위치의 해당 회로에 대한 상태 확인
        const switchState = state.switchStates[switchData.id][circuitId] || false;
        if (switchState) {
            toggleBtn.classList.add('active');
        }
        
        // 클릭 이벤트
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleCircuitToggle(switchData.id, circuitId, toggleBtn);
        });
        
        toggleContainer.appendChild(toggleBtn);
    });
    
    document.body.appendChild(toggleContainer);
}

// 회로별 토글 처리 (3로 스위치 지원)
function handleCircuitToggle(switchId, circuitId, toggleBtn) {
    // 스위치 상태 초기화
    if (!state.switchStates[switchId]) {
        state.switchStates[switchId] = {};
    }
    
    // 토글 버튼 상태 변경
    toggleBtn.classList.toggle('active');
    const isSwitchActive = toggleBtn.classList.contains('active');
    
    // 스위치 상태 저장
    state.switchStates[switchId][circuitId] = isSwitchActive;
    
    // 해당 회로에 연결된 모든 스위치의 상태를 확인하여 조명 상태 결정
    const circuitLights = state.elements.filter(el => 
        (el.type === 'light' || el.type === 'linear-light') && 
        el.circuit === circuitId
    );
    
    // 회로에 연결된 모든 스위치 찾기
    const circuitSwitches = new Set();
    circuitLights.forEach(light => {
        if (light.switchIds && light.switchIds.length > 0) {
            light.switchIds.forEach(swId => circuitSwitches.add(swId));
        } else if (light.switchId) {
            circuitSwitches.add(light.switchId);
        }
    });
    
    // 3로 스위치 로직: 켜진 스위치 개수가 홀수면 조명 켜짐
    let activeSwitchCount = 0;
    circuitSwitches.forEach(swId => {
        if (state.switchStates[swId] && state.switchStates[swId][circuitId]) {
            activeSwitchCount++;
        }
    });
    
    // 조명 상태 결정 (홀수개의 스위치가 켜져있으면 조명 켜짐)
    const shouldLightsBeOn = activeSwitchCount % 2 === 1;
    
    // 조명 상태 업데이트
    circuitLights.forEach(lightData => {
        const lightEl = document.getElementById(lightData.id);
        if (lightEl) {
            lightData.state = shouldLightsBeOn;
            lightEl.classList.toggle('on', shouldLightsBeOn);
        }
    });
}

// 모드 전환
function toggleMode() {
    state.mode = state.mode === 'edit' ? 'test' : 'edit';
    const modeText = document.getElementById('modeText');
    if (modeText) {
        modeText.textContent = state.mode === 'edit' ? '회로 테스트' : '편집 모드';
    }
    document.body.classList.toggle('test-mode', state.mode === 'test');
    
    // 회로 토글 버튼 제거
    document.querySelectorAll('.circuit-toggles').forEach(el => el.remove());
    
    // 테스트 모드로 전환 시 스위치 상태 초기화
    if (state.mode === 'test') {
        state.switchStates = {};
        // 모든 조명 끄기
        state.elements.forEach(el => {
            if (el.type === 'light' || el.type === 'linear-light') {
                el.state = false;
            }
        });
    }
    
    // 도구 선택 해제
    selectTool(null);
    
    // 요소들 다시 렌더링
    renderAll();
}

// 전체 렌더링
function renderAll() {
    // 레이어 초기화
    dom.elementLayer.innerHTML = '';
    dom.connectionLayer.innerHTML = '';
    
    // 평면도 표시
    displayFloorPlan();
    
    // 요소들 렌더링
    state.elements.forEach(element => {
        renderElement(element);
    });
    
    // 연결선 그리기
    state.connections.forEach(conn => {
        drawConnection(conn.from, conn.to);
    });
}

// URL에 저장
function saveToURL() {
    try {
        // 평면도를 제외한 상태만 저장 (성능 최적화)
        const stateToSave = {
            ...state,
            floorPlan: state.floorPlan ? 'has-floorplan' : null
        };
        
        const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(stateToSave));
        window.history.replaceState(null, null, '#' + compressed);
        
        // 평면도는 별도로 localStorage에 저장
        if (state.floorPlan) {
            try {
                localStorage.setItem('circuitee-floorplan', state.floorPlan);
            } catch (e) {
                console.warn('Failed to save floor plan to localStorage:', e);
            }
        }
    } catch (e) {
        console.error('Failed to save to URL:', e);
    }
}

// URL에서 로드
function loadFromURL() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        try {
            const decompressed = LZString.decompressFromEncodedURIComponent(hash);
            if (decompressed) {
                const loadedState = JSON.parse(decompressed);
                state = { ...state, ...loadedState };
                
                // localStorage에서 평면도 로드
                if (loadedState.floorPlan === 'has-floorplan') {
                    const savedFloorPlan = localStorage.getItem('circuitee-floorplan');
                    if (savedFloorPlan) {
                        state.floorPlan = savedFloorPlan;
                    }
                }
                
                // URL 파라미터로 모드 확인
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('mode') === 'test') {
                    state.mode = 'test';
                    // 테스트 모드 전용 UI 설정
                    state.isSharedView = true;
                }
                
                renderAll();
                updateUI();
            }
        } catch (e) {
            console.error('Failed to load from URL:', e);
            alert('프로젝트를 불러오는 중 오류가 발생했습니다.');
        }
    }
}

// UI 업데이트
function updateUI() {
    const modeText = document.getElementById('modeText');
    if (modeText) {
        modeText.textContent = state.mode === 'edit' ? '회로 테스트' : '편집 모드';
    }
    document.body.classList.toggle('test-mode', state.mode === 'test');
    
    // 공유된 테스트 모드인 경우 헤더 버튼 숨기기
    if (state.isSharedView) {
        document.body.classList.add('shared-view');
        if (dom.modeToggle) dom.modeToggle.style.display = 'none';
        if (dom.shareBtn) dom.shareBtn.style.display = 'none';
    }
    
    selectTool(null);
}

// 공유 모달 표시
function showShareModal() {
    const currentURL = window.location.href.split('?')[0].split('#')[0];
    const shareURL = currentURL + '?mode=test#' + window.location.hash.substring(1);
    dom.shareUrl.value = shareURL;
    dom.shareModal.hidden = false;
}

// URL 복사
function copyShareURL() {
    dom.shareUrl.select();
    try {
        document.execCommand('copy');
        dom.copyBtn.textContent = '복사됨!';
        setTimeout(() => {
            dom.copyBtn.textContent = '복사';
        }, 2000);
    } catch (e) {
        alert('복사에 실패했습니다. 수동으로 복사해주세요.');
    }
}

// 전체 초기화
function clearAll() {
    state = {
        mode: 'edit',
        floorPlan: null,
        elements: [],
        connections: [],
        circuits: {},
        circuitCounter: 1,
        selectedTool: null,
        selectedElement: null,
        connectingFrom: null,
        elementIdCounter: 1,
        dragListeners: state.dragListeners,
        linearLightStart: null,
        circuitColors: {}
    };
    
    // localStorage에서도 평면도 제거
    localStorage.removeItem('circuitee-floorplan');
    
    // Undo/Redo 스택 초기화
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    
    renderAll();
    saveToURL();
}

// CSV 업로드 처리
function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'text/csv') {
        const reader = new FileReader();
        reader.onload = (e) => {
            parseCSV(e.target.result);
        };
        reader.readAsText(file);
    }
}

// CSV 파싱
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const header = lines[0].split(',');
    
    const lights = [];
    const references = {
        sketchup: { p1: null, p2: null }
    };
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const type = values[0];
        
        if (type === 'reference1') {
            references.sketchup.p1 = {
                x: parseFloat(values[1]),
                y: parseFloat(values[2]),
                z: parseFloat(values[3])
            };
        } else if (type === 'reference2') {
            references.sketchup.p2 = {
                x: parseFloat(values[1]),
                y: parseFloat(values[2]),
                z: parseFloat(values[3])
            };
        } else if (type === 'point') {
            lights.push({
                type: 'light',
                x: parseFloat(values[1]),
                y: parseFloat(values[2]),
                z: parseFloat(values[3]),
                name: values[7] || 'Light'
            });
        } else if (type === 'linear') {
            lights.push({
                type: 'linear-light',
                x1: parseFloat(values[1]),
                y1: parseFloat(values[2]),
                z1: parseFloat(values[3]),
                x2: parseFloat(values[4]),
                y2: parseFloat(values[5]),
                z2: parseFloat(values[6]),
                name: values[7] || 'LinearLight'
            });
        } else if (type === 'switch') {
            lights.push({
                type: 'switch',
                x: parseFloat(values[1]),
                y: parseFloat(values[2]),
                z: parseFloat(values[3]),
                name: values[7] || 'Switch'
            });
        }
    }
    
    // CSV 데이터 저장
    state.csvData = lights;
    state.referencePoints.sketchup = references.sketchup;
    
    // 참조점 선택 모드 시작
    startCSVReferenceMode();
}

// CSV 참조점 모드 시작
function startCSVReferenceMode() {
    state.csvReferenceMode = true;
    state.referencePoints.circuitee = { p1: null, p2: null };
    
    // 안내 메시지 표시
    showCSVMessage('첫 번째 참조점을 클릭하세요 (SketchUp에서 선택한 첫 번째 점과 동일한 위치)');
}

// CSV 참조점 클릭 처리
function handleCSVReferenceClick(x, y) {
    if (!state.referencePoints.circuitee.p1) {
        // 첫 번째 참조점
        state.referencePoints.circuitee.p1 = { x, y };
        
        // 마커 표시
        const marker = document.createElement('div');
        marker.className = 'reference-marker';
        marker.style.left = (x - 5) + 'px';
        marker.style.top = (y - 5) + 'px';
        marker.dataset.ref = '1';
        dom.elementLayer.appendChild(marker);
        
        showCSVMessage('두 번째 참조점을 클릭하세요 (SketchUp에서 선택한 두 번째 점과 동일한 위치)');
    } else {
        // 두 번째 참조점
        state.referencePoints.circuitee.p2 = { x, y };
        
        // 마커 표시
        const marker = document.createElement('div');
        marker.className = 'reference-marker';
        marker.style.left = (x - 5) + 'px';
        marker.style.top = (y - 5) + 'px';
        marker.dataset.ref = '2';
        dom.elementLayer.appendChild(marker);
        
        // 스케일 계산 및 조명 배치
        calculateScaleAndPlaceLights();
    }
}

// 스케일 계산 및 조명 배치
function calculateScaleAndPlaceLights() {
    saveState('CSV 조명 가져오기');
    
    // SketchUp 참조점 거리 (mm 단위)
    const sketchupDist = Math.sqrt(
        Math.pow(state.referencePoints.sketchup.p2.x - state.referencePoints.sketchup.p1.x, 2) +
        Math.pow(state.referencePoints.sketchup.p2.y - state.referencePoints.sketchup.p1.y, 2)
    );
    
    // Circuitee 참조점 거리 (픽셀 단위)
    const circuiteeDist = Math.sqrt(
        Math.pow(state.referencePoints.circuitee.p2.x - state.referencePoints.circuitee.p1.x, 2) +
        Math.pow(state.referencePoints.circuitee.p2.y - state.referencePoints.circuitee.p1.y, 2)
    );
    
    // 스케일 비율
    // 실제 측정 결과 2배 크게 나오므로 0.5를 곱함
    const scale = (circuiteeDist / sketchupDist) * 0.5;
    
    // 디버깅을 위한 로그
    console.log('SketchUp distance:', sketchupDist, 'mm');
    console.log('Circuitee distance:', circuiteeDist, 'px');
    console.log('Original scale factor:', circuiteeDist / sketchupDist);
    console.log('Adjusted scale factor (x0.5):', scale);
    
    // 회전 각도 계산 (스케치업의 Y축은 반전)
    const sketchupAngle = Math.atan2(
        -(state.referencePoints.sketchup.p2.y - state.referencePoints.sketchup.p1.y),
        state.referencePoints.sketchup.p2.x - state.referencePoints.sketchup.p1.x
    );
    
    const circuiteeAngle = Math.atan2(
        state.referencePoints.circuitee.p2.y - state.referencePoints.circuitee.p1.y,
        state.referencePoints.circuitee.p2.x - state.referencePoints.circuitee.p1.x
    );
    
    let rotation = circuiteeAngle - sketchupAngle;
    
    console.log('Original rotation angle (degrees):', rotation * 180 / Math.PI);
    
    // 1도 미만의 회전은 무시 (참조점 선택 오차 보정)
    if (Math.abs(rotation * 180 / Math.PI) < 1.0) {
        rotation = 0;
        console.log('Small rotation ignored, set to 0');
    }
    
    // 조명 배치
    let lightIndex = 0;
    state.csvData.forEach(lightData => {
        if (lightData.type === 'light') {
            // 디버깅: 처음 2개 점조명 좌표 출력
            if (lightIndex < 2) {
                console.log(`Point Light ${lightIndex + 1} - SketchUp coords: (${lightData.x}, ${lightData.y}) mm`);
            }
            
            // 점조명 변환 - 스케치업에서 이미 1/2 적용했으므로 원래 스케일 사용
            const pointScale = (circuiteeDist / sketchupDist); // 원래 스케일
            const transformed = transformPoint(
                lightData.x, lightData.y,
                state.referencePoints.sketchup.p1,
                state.referencePoints.circuitee.p1,
                pointScale, rotation
            );
            
            // 디버깅: 변환된 좌표 출력
            if (lightIndex < 2) {
                console.log(`Point Light ${lightIndex + 1} - Circuitee coords: (${transformed.x}, ${transformed.y}) px`);
                console.log(`Point Light ${lightIndex + 1} - Final position: (${transformed.x - 4}, ${transformed.y - 4}) px`);
            }
            lightIndex++;
            
            // 기존 점조명 추가 로직 활용
            const label = getNextLightLabel();
            const element = {
                id: `element-${state.elementIdCounter++}`,
                type: 'light',
                x: Math.round(transformed.x - 4),
                y: Math.round(transformed.y - 4),
                state: false,
                label: label,
                circuit: null,
                switchId: null
            };
            
            state.elements.push(element);
            renderElement(element);
            
        } else if (lightData.type === 'linear-light') {
            // 라인조명 변환 - 원래 스케일 사용 (0.5배 적용 안함)
            const linearScale = (circuiteeDist / sketchupDist); // 원래 스케일
            
            const start = transformPoint(
                lightData.x1, lightData.y1,
                state.referencePoints.sketchup.p1,
                state.referencePoints.circuitee.p1,
                linearScale, rotation
            );
            
            const end = transformPoint(
                lightData.x2, lightData.y2,
                state.referencePoints.sketchup.p1,
                state.referencePoints.circuitee.p1,
                linearScale, rotation
            );
            
            // 라인조명 추가
            addLinearLight(start.x, start.y, end.x, end.y);
            
        } else if (lightData.type === 'switch') {
            // 디버깅
            console.log(`Switch - SketchUp coords: (${lightData.x}, ${lightData.y}) mm`);
            
            // 스위치 변환 - 점조명과 동일한 스케일 사용 (스케치업에서 이미 1/2 적용)
            const switchScale = (circuiteeDist / sketchupDist); // 원래 스케일
            const transformed = transformPoint(
                lightData.x, lightData.y,
                state.referencePoints.sketchup.p1,
                state.referencePoints.circuitee.p1,
                switchScale, rotation
            );
            
            console.log(`Switch - Circuitee coords: (${transformed.x}, ${transformed.y}) px`);
            console.log(`Switch - Final position: (${transformed.x - 16}, ${transformed.y - 8}) px`);
            console.log(`Switch - Label: ${getNextSwitchLabel()}`);
            
            // 스위치 추가
            const label = getNextSwitchLabel();
            // Y 좌표 반올림 (부동소수점 오차 제거)
            const finalX = Math.round(transformed.x - 16);
            const finalY = Math.round(transformed.y - 8);
            
            const element = {
                id: `element-${state.elementIdCounter++}`,
                type: 'switch',
                x: finalX,
                y: finalY,
                state: null,
                label: label
            };
            
            console.log(`Switch ${label} - Element position: x=${element.x}, y=${element.y}`);
            
            state.elements.push(element);
            renderElement(element);
        }
    });
    
    // 참조점 마커 제거
    document.querySelectorAll('.reference-marker').forEach(marker => marker.remove());
    
    // CSV 메시지 제거
    const msgEl = document.querySelector('.csv-message');
    if (msgEl) msgEl.remove();
    
    // 상태 초기화
    state.csvReferenceMode = false;
    state.csvData = null;
    
    saveToURL();
}

// 좌표 변환 함수
function transformPoint(x, y, oldOrigin, newOrigin, scale, rotation) {
    // 원점 이동
    const dx = x - oldOrigin.x;
    const dy = -(y - oldOrigin.y); // Y축 반전 (스케치업의 Y는 위로, circuitee의 Y는 아래로)
    
    // 스케일 적용
    const scaledX = dx * scale;
    const scaledY = dy * scale;
    
    // 회전 적용
    const rotatedX = scaledX * Math.cos(rotation) - scaledY * Math.sin(rotation);
    const rotatedY = scaledX * Math.sin(rotation) + scaledY * Math.cos(rotation);
    
    // 새 원점으로 이동
    return {
        x: rotatedX + newOrigin.x,
        y: rotatedY + newOrigin.y
    };
}

// 다음 조명 라벨 가져오기
function getNextLightLabel() {
    const existingNumbers = state.elements
        .filter(el => el.type === 'light' || el.type === 'linear-light')
        .map(el => parseInt(el.label.replace('L', '')))
        .sort((a, b) => a - b);
    
    let newNumber = 1;
    if (existingNumbers.length > 0) {
        for (let i = 1; i <= existingNumbers[existingNumbers.length - 1] + 1; i++) {
            if (!existingNumbers.includes(i)) {
                newNumber = i;
                break;
            }
        }
    }
    
    return `L${newNumber}`;
}

// CSV 메시지 표시
function showCSVMessage(message) {
    // 기존 메시지 제거
    const existingMsg = document.querySelector('.csv-message');
    if (existingMsg) existingMsg.remove();
    
    // 새 메시지 생성
    const msgEl = document.createElement('div');
    msgEl.className = 'csv-message';
    msgEl.textContent = message;
    document.body.appendChild(msgEl);
}

// 다음 스위치 라벨 가져오기
function getNextSwitchLabel() {
    const existingNumbers = state.elements
        .filter(el => el.type === 'switch')
        .map(el => parseInt(el.label.replace('SW', '')))
        .sort((a, b) => a - b);
    
    let newNumber = 1;
    if (existingNumbers.length > 0) {
        for (let i = 1; i <= existingNumbers[existingNumbers.length - 1] + 1; i++) {
            if (!existingNumbers.includes(i)) {
                newNumber = i;
                break;
            }
        }
    }
    
    return `SW${newNumber}`;
}

// 디버깅 함수: 모든 스위치의 Y 좌표 출력
function debugSwitchPositions() {
    const switches = state.elements.filter(el => el.type === 'switch');
    console.log('=== All Switch Positions ===');
    switches.forEach((sw, index) => {
        const domEl = document.getElementById(sw.id);
        if (domEl) {
            const rect = domEl.getBoundingClientRect();
            console.log(`${sw.label}: state.y=${sw.y}, DOM.style.top=${domEl.style.top}, offsetTop=${domEl.offsetTop}, getBoundingClientRect.top=${rect.top}`);
        }
    });
    
    // Y 좌표 차이 확인
    if (switches.length > 1) {
        console.log('\n=== Y Coordinate Differences ===');
        for (let i = 1; i < switches.length; i++) {
            const diff = switches[i].y - switches[i-1].y;
            console.log(`${switches[i].label} - ${switches[i-1].label}: ${diff}px`);
        }
    }
}

// window에 노출 (브라우저 콘솔에서 호출 가능)
window.debugSwitchPositions = debugSwitchPositions;

// 시작
document.addEventListener('DOMContentLoaded', init);