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
    linearLightStart: null // 직선 조명 첫 번째 클릭 지점
};

// DOM 요소들
const dom = {
    canvas: null,
    floorPlanLayer: null,
    connectionLayer: null,
    elementLayer: null,
    uploadArea: null,
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
    dom.uploadArea = document.getElementById('uploadArea');
    dom.fileInput = document.getElementById('fileInput');
    dom.modeToggle = document.getElementById('modeToggle');
    dom.shareBtn = document.getElementById('shareBtn');
    dom.sidebar = document.getElementById('sidebar');
    dom.shareModal = document.getElementById('shareModal');
    dom.shareUrl = document.getElementById('shareUrl');
    dom.copyBtn = document.getElementById('copyBtn');
    dom.closeModal = document.getElementById('closeModal');
    dom.clearBtn = document.getElementById('clearBtn');
    dom.connectBtn = document.getElementById('connectBtn');
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 파일 업로드
    dom.uploadArea.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleFileUpload);
    
    // 드래그앤드롭
    dom.uploadArea.addEventListener('dragover', handleDragOver);
    dom.uploadArea.addEventListener('dragleave', handleDragLeave);
    dom.uploadArea.addEventListener('drop', handleDrop);
    
    // 도구 버튼들
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
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

// 드래그 오버 처리
function handleDragOver(e) {
    e.preventDefault();
    dom.uploadArea.classList.add('dragover');
}

// 드래그 리브 처리
function handleDragLeave() {
    dom.uploadArea.classList.remove('dragover');
}

// 드롭 처리
function handleDrop(e) {
    e.preventDefault();
    dom.uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
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
    state.linearLightStart = null; // 직선 조명 시작점 초기화
    
    // 직선 조명 마커 제거
    const marker = document.getElementById('linear-light-marker');
    if (marker) marker.remove();
    
    // 도구 버튼 상태 업데이트
    document.querySelectorAll('.tool-btn').forEach(btn => {
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
    if (state.mode !== 'edit') return;
    if (e.target.closest('.element')) return;
    
    const rect = dom.elementLayer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (state.selectedTool === 'switch' || state.selectedTool === 'light') {
        addElement(state.selectedTool, x, y);
    } else if (state.selectedTool === 'linear-light') {
        handleLinearLightClick(x, y);
    }
}

// 직선 조명 클릭 처리
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
        // 두 번째 클릭 - 직선 조명 생성
        const start = state.linearLightStart;
        
        // 시작점 마커 제거
        const marker = document.getElementById('linear-light-marker');
        if (marker) marker.remove();
        
        // 직선 조명 생성
        addLinearLight(start.x, start.y, x, y);
        
        // 상태 초기화
        state.linearLightStart = null;
    }
}

// 직선 조명 추가
function addLinearLight(x1, y1, x2, y2) {
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

// 요소 추가
function addElement(type, x, y) {
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
    } else if (element.type === 'light') {
        // 조명은 이제 텍스트 없이 CSS로만 표현
        if (element.state) {
            div.classList.add('on');
        }
    } else if (element.type === 'linear-light') {
        // 직선 조명 스타일 설정
        div.style.width = element.length + 'px';
        div.style.transform = `rotate(${element.angle}deg)`;
        if (element.state) {
            div.classList.add('on');
        }
    }
    
    if (state.mode === 'edit') {
        setupElementInteractions(div, element);
    } else if (state.mode === 'test' && element.type === 'switch') {
        div.addEventListener('click', (e) => handleSwitchToggle(e, element));
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
    
    if (state.selectedTool === 'connect') {
        handleConnectionClick(elementData);
        return;
    }
    
    // 일반 선택
    selectElement(elementData.id);
}

// 요소 삭제
function deleteElement(elementId) {
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
        
        element.appendChild(infoContainer);
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
            } else if ((isLight(fromElement) && toElement.type === 'switch') || 
                       (fromElement.type === 'switch' && isLight(toElement))) {
                // 조명-스위치 연결 (제어)
                connectLightToSwitch(fromElement, toElement);
            }
        }
        
        // 연결 완료 후 상태 초기화
        document.getElementById(state.connectingFrom).classList.remove('connecting');
        state.connectingFrom = null;
    }
}

// 조명-조명 연결 (회로)
function connectLights(light1, light2) {
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
        // light1의 스위치 속성을 light2도 공유
        light2.switchId = light1.switchId;
        
        // 같은 회로의 모든 조명에 스위치 속성 전파
        if (light1.switchId) {
            const circuitLights = state.circuits[light1.circuit];
            circuitLights.forEach(lightId => {
                const light = state.elements.find(el => el.id === lightId);
                if (light) {
                    light.switchId = light1.switchId;
                }
            });
        }
    } else if (light2.circuit) {
        // light2가 회로를 가지고 있으면 light1도 같은 회로로
        light1.circuit = light2.circuit;
        if (!state.circuits[light2.circuit].includes(light1.id)) {
            state.circuits[light2.circuit].push(light1.id);
        }
        // light2의 스위치 속성을 light1도 공유
        light1.switchId = light2.switchId;
        
        // 같은 회로의 모든 조명에 스위치 속성 전파
        if (light2.switchId) {
            const circuitLights = state.circuits[light2.circuit];
            circuitLights.forEach(lightId => {
                const light = state.elements.find(el => el.id === lightId);
                if (light) {
                    light.switchId = light2.switchId;
                }
            });
        }
    } else {
        // 둘 다 회로가 없으면 새 회로 생성
        const newCircuitId = `c${state.circuitCounter++}`;
        light1.circuit = newCircuitId;
        light2.circuit = newCircuitId;
        state.circuits[newCircuitId] = [light1.id, light2.id];
        
        // 스위치 속성도 공유
        const switchId = light1.switchId || light2.switchId;
        if (switchId) {
            light1.switchId = switchId;
            light2.switchId = switchId;
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
    const isLight = (el) => el.type === 'light' || el.type === 'linear-light';
    const light = isLight(element1) ? element1 : element2;
    const switchEl = element1.type === 'switch' ? element1 : element2;
    
    // 이미 연결되어 있는지 확인
    const existingConnection = state.connections.find(
        conn => (conn.from === light.id && conn.to === switchEl.id) ||
                (conn.from === switchEl.id && conn.to === light.id)
    );
    
    if (existingConnection) return;
    
    // 조명이 회로에 속해있는 경우
    if (light.circuit) {
        // 같은 회로의 모든 조명들의 스위치 속성을 업데이트
        const circuitLights = state.circuits[light.circuit] || [];
        circuitLights.forEach(lightId => {
            const circuitLight = state.elements.find(el => el.id === lightId);
            if (circuitLight) {
                // 기존 스위치 연결 제거 (시각적 연결선만)
                if (circuitLight.switchId && circuitLight.switchId !== switchEl.id) {
                    state.connections = state.connections.filter(
                        conn => !(conn.from === lightId && conn.to === circuitLight.switchId) &&
                                !(conn.to === lightId && conn.from === circuitLight.switchId)
                    );
                }
                circuitLight.switchId = switchEl.id;
            }
        });
        
        // 직접 클릭한 조명과 스위치 사이에만 연결선 추가
        state.connections.push({
            from: light.id,
            to: switchEl.id,
            type: 'control'
        });
    } else {
        // 회로에 속하지 않은 단일 조명
        light.switchId = switchEl.id;
        
        // 연결 정보 저장
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
    
    let switchId1 = null;
    let switchId2 = null;
    
    // circuit1의 스위치 찾기
    for (const lightId of lights1) {
        const light = state.elements.find(el => el.id === lightId);
        if (light && light.switchId) {
            switchId1 = light.switchId;
            break;
        }
    }
    
    // circuit2의 스위치 찾기
    for (const lightId of lights2) {
        const light = state.elements.find(el => el.id === lightId);
        if (light && light.switchId) {
            switchId2 = light.switchId;
            break;
        }
    }
    
    // 병합할 스위치 결정 (circuit1의 스위치를 우선)
    const finalSwitchId = switchId1 || switchId2;
    
    // circuit2의 모든 조명을 circuit1로 이동
    lights2.forEach(lightId => {
        const light = state.elements.find(el => el.id === lightId);
        if (light) {
            light.circuit = circuit1;
            light.switchId = finalSwitchId;
            if (!state.circuits[circuit1].includes(lightId)) {
                state.circuits[circuit1].push(lightId);
            }
        }
    });
    
    // circuit1의 모든 조명에도 스위치 속성 적용
    if (finalSwitchId) {
        lights1.forEach(lightId => {
            const light = state.elements.find(el => el.id === lightId);
            if (light) {
                light.switchId = finalSwitchId;
            }
        });
    }
    
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
        // 직선 조명의 중심점
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
        // 직선 조명의 중심점
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
    
    const handleMouseDown = (e) => {
        if (state.selectedTool === 'connect') return;
        if (e.target.classList.contains('delete-button')) return;
        
        isDragging = true;
        startX = e.clientX - elementData.x;
        startY = e.clientY - elementData.y;
        
        element.style.cursor = 'grabbing';
        element.style.zIndex = '100';
        e.preventDefault();
    };
    
    const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        const rect = dom.elementLayer.getBoundingClientRect();
        let newX = e.clientX - startX;
        let newY = e.clientY - startY;
        
        // 경계 제한
        newX = Math.max(0, Math.min(newX, rect.width - element.offsetWidth));
        newY = Math.max(0, Math.min(newY, rect.height - element.offsetHeight));
        
        // 직선 조명의 경우 끝점도 같이 이동
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

// 스위치 토글 처리
function handleSwitchToggle(e, switchData) {
    e.stopPropagation();
    const switchEl = e.currentTarget;
    
    // 스위치 상태 토글
    switchEl.classList.toggle('active');
    const isActive = switchEl.classList.contains('active');
    
    // 이 스위치에 연결된 모든 조명 찾기
    const connectedLights = state.elements.filter(el => 
        (el.type === 'light' || el.type === 'linear-light') && el.switchId === switchData.id
    );
    
    // 연결된 조명 토글
    connectedLights.forEach(lightData => {
        const lightEl = document.getElementById(lightData.id);
        if (lightEl) {
            lightData.state = isActive;
            lightEl.classList.toggle('on', isActive);
        }
    });
    
    if (state.mode === 'edit') {
        saveToURL();
    }
}

// 모드 전환
function toggleMode() {
    state.mode = state.mode === 'edit' ? 'test' : 'edit';
    dom.modeToggle.textContent = state.mode === 'edit' ? '편집 모드' : '테스트 모드';
    document.body.classList.toggle('test-mode', state.mode === 'test');
    
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
    dom.modeToggle.textContent = state.mode === 'edit' ? '편집 모드' : '테스트 모드';
    document.body.classList.toggle('test-mode', state.mode === 'test');
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
        dragListeners: state.dragListeners
    };
    
    // localStorage에서도 평면도 제거
    localStorage.removeItem('circuitee-floorplan');
    
    renderAll();
    saveToURL();
}

// 시작
document.addEventListener('DOMContentLoaded', init);