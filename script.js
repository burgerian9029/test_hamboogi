let currentStage = parseInt(localStorage.getItem('shikaku_stage')) || 1;
let gridWidth = 5;
let gridHeight = 5;

let puzzleData = [];
let targets = [];
let selectedTarget = null;
let isDrawing = false;
let isErasing = false; 

let historyStack = [];

const gridElement = document.getElementById('grid');
const activeBrushElement = document.getElementById('active-brush');
const stageInfo = document.getElementById('stage-info');
const clearModal = document.getElementById('clear-modal');
const tutorialModal = document.getElementById('tutorial-modal');

function generateDistinctColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = Math.floor((360 / count) * i);
        colors.push(`hsl(${hue}, 80%, 80%)`);
    }
    
    for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    return colors;
}

function generatePuzzle(width, height) {
    let attempt = 0;
    // 블록 최대 크기를 25로 고정
    const maxAllowedArea = Math.min(25, 8 + Math.floor((currentStage - 1) / 3) * 4);

    while (true) {
        attempt++;
        if (attempt > 3000) {
            console.error("퍼즐 생성 실패 (재시도 초과)");
            break;
        }

        const grid = Array(width * height).fill(0);
        const rects = [];
        let groupId = 1;
        let countOfOnes = 0;
        let isFailed = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (grid[idx] === 0) {
                    let maxW = 1;
                    while (x + maxW < width && grid[y * width + (x + maxW)] === 0) maxW++;
                    let maxH = 1;
                    while (y + maxH < height && grid[(y + maxH) * width + x] === 0) maxH++;

                    const validRects = [];
                    for (let h = 1; h <= maxH; h++) {
                        for (let w = 1; w <= maxW; w++) {
                            const area = w * h;
                            
                            if (area > maxAllowedArea) continue;
                            if (area === 1 && countOfOnes >= 2) continue;

                            let isEmpty = true;
                            for (let dy = 0; dy < h; dy++) {
                                for (let dx = 0; dx < w; dx++) {
                                    if (grid[(y + dy) * width + (x + dx)] !== 0) {
                                        isEmpty = false;
                                        break;
                                    }
                                }
                                if (!isEmpty) break;
                            }
                            if (isEmpty) {
                                validRects.push({w, h});
                            }
                        }
                    }

                    if (validRects.length === 0) {
                        isFailed = true;
                        break; 
                    }

                    const rect = validRects[Math.floor(Math.random() * validRects.length)];
                    
                    if (rect.w * rect.h === 1) {
                        countOfOnes++;
                    }

                    const rectCells = [];
                    for (let dy = 0; dy < rect.h; dy++) {
                        for (let dx = 0; dx < rect.w; dx++) {
                            const fillIdx = (y + dy) * width + (x + dx);
                            grid[fillIdx] = groupId;
                            rectCells.push(fillIdx);
                        }
                    }
                    
                    rects.push({
                        id: groupId,
                        area: rect.w * rect.h,
                        cells: rectCells
                    });
                    groupId++;
                }
            }
            if (isFailed) break; 
        }
        
        if (isFailed) continue; 

        const newPuzzleData = Array(width * height).fill(0);
        rects.forEach(rect => {
            const targetIdx = rect.cells[Math.floor(Math.random() * rect.cells.length)];
            newPuzzleData[targetIdx] = rect.area;
        });

        return newPuzzleData;
    }
}

function isValidMove(targetId) {
    const group = Array.from(document.querySelectorAll('.cell')).filter(c => c.dataset.groupId === targetId);
    const target = targets.find(t => t.id === targetId);

    const hasOtherNumbers = group.some(c => {
        const idx = parseInt(c.dataset.index);
        return puzzleData[idx] > 0 && idx !== parseInt(target.id);
    });
    if (hasOtherNumbers) return false;

    if (group.length > target.realNumber) return false;

    if (group.length === target.realNumber) {
        const hasOwnNumber = group.some(c => parseInt(c.dataset.index) === parseInt(target.id));
        if (!hasOwnNumber) return false;

        let minX = gridWidth, maxX = -1, minY = gridHeight, maxY = -1;
        group.forEach(c => {
            const index = parseInt(c.dataset.index);
            const x = index % gridWidth;
            const y = Math.floor(index / gridWidth);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        });
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        
        if (width * height !== group.length) return false;
    }
    
    return true;
}

function updateCompletionStatus() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('completed');
    });

    targets.forEach(target => {
        const group = Array.from(document.querySelectorAll('.cell')).filter(c => c.dataset.groupId === target.id);
        
        if (group.length === target.realNumber) {
            group.forEach(cell => cell.classList.add('completed'));
        }
    });
}

function updatePaletteSelection(targetId) {
    selectedTarget = targets.find(t => t.id === targetId);
    
    activeBrushElement.style.backgroundColor = selectedTarget.color;
    activeBrushElement.textContent = selectedTarget.displayNumber;

    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('active-target');
        if (parseInt(cell.dataset.index) === parseInt(targetId)) {
            cell.classList.add('active-target');
        }
    });
}

function saveHistory() {
    const snapshot = Array.from(document.querySelectorAll('.cell')).map(cell => ({
        index: cell.dataset.index,
        groupId: cell.dataset.groupId || null,
        backgroundColor: cell.style.backgroundColor || ''
    }));
    historyStack.push(snapshot);
    if (historyStack.length > 30) historyStack.shift();
}

function undo() {
    if (historyStack.length === 0) return;
    
    const previousState = historyStack.pop();
    const cells = document.querySelectorAll('.cell');
    
    previousState.forEach(state => {
        const cell = cells[state.index];
        if (state.groupId) {
            cell.dataset.groupId = state.groupId;
            cell.style.backgroundColor = state.backgroundColor;
        } else {
            delete cell.dataset.groupId;
            cell.style.backgroundColor = '';
        }
    });
    
    updateCompletionStatus();
}

function paintCell(cell) {
    const previousGroupId = cell.dataset.groupId;

    if (previousGroupId === selectedTarget.id) return;

    cell.style.backgroundColor = selectedTarget.color;
    cell.dataset.groupId = selectedTarget.id;

    if (!isValidMove(selectedTarget.id)) {
        cell.classList.add('error');
        setTimeout(() => cell.classList.remove('error'), 300);

        if (previousGroupId) {
            const prevTarget = targets.find(t => t.id === previousGroupId);
            cell.style.backgroundColor = prevTarget.color;
            cell.dataset.groupId = previousGroupId;
        } else {
            cell.style.backgroundColor = '';
            delete cell.dataset.groupId;
        }
    } else {
        updateCompletionStatus();
        checkAllComplete();
    }
}

function eraseCell(cell) {
    if (puzzleData[cell.dataset.index] > 0) return;
    cell.style.backgroundColor = ''; 
    delete cell.dataset.groupId;       
    updateCompletionStatus();
}

function checkAllComplete() {
    const cells = Array.from(document.querySelectorAll('.cell'));
    const uncolored = cells.filter(c => !c.dataset.groupId);
    
    if (uncolored.length === 0) {
        setTimeout(() => {
            clearModal.classList.remove('hidden');
        }, 200);
    }
}

function createGrid() {
    gridElement.innerHTML = '';
    
    gridElement.style.gridTemplateColumns = `repeat(${gridWidth}, 1fr)`;
    gridElement.style.gridTemplateRows = `repeat(${gridHeight}, 1fr)`;

    const dynamicFontSize = Math.min(24, Math.max(10, Math.floor(260 / gridWidth)));

    puzzleData.forEach((number, index) => {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = index;
        cell.style.fontSize = `${dynamicFontSize}px`;
        
        if (number > 0) {
            const target = targets.find(t => parseInt(t.id) === index);
            cell.textContent = target.displayNumber; 
            cell.style.backgroundColor = target.color;
            cell.dataset.groupId = target.id;
        }

        cell.addEventListener('mousedown', () => {
            saveHistory(); 
            isDrawing = true;
            if (puzzleData[index] > 0) {
                updatePaletteSelection(cell.dataset.groupId);
                isErasing = false;
            } else if (cell.dataset.groupId === selectedTarget.id) {
                isErasing = true;
                eraseCell(cell);
            } else {
                isErasing = false;
                paintCell(cell);
            }
        });

        cell.addEventListener('mouseenter', () => {
            if (!isDrawing) return;
            if (isErasing) {
                eraseCell(cell);
            } else {
                paintCell(cell);
            }
        });

        gridElement.appendChild(cell);
    });

    updateCompletionStatus();
}

function loadStage() {
    historyStack = []; 
    
    gridWidth = Math.min(17, 4 + currentStage);
    gridHeight = Math.min(17, 4 + currentStage);

    puzzleData = generatePuzzle(gridWidth, gridHeight);
    
    const targetCount = puzzleData.filter(n => n > 0).length;
    const stageColors = generateDistinctColors(targetCount);
    
    targets = [];
    let colorIndex = 0;
    
    stageInfo.textContent = `Stage ${currentStage} (${gridWidth}x${gridHeight})`;

    puzzleData.forEach((number, i) => {
        if (number > 0) {
            targets.push({
                id: i.toString(),
                realNumber: number,
                displayNumber: number,
                color: stageColors[colorIndex]
            });
            colorIndex++;
        }
    });

    if (currentStage >= 3) {
        let blindCount = Math.min(Math.floor(currentStage / 3), targets.length - 1);
        let shuffledTargets = [...targets].sort(() => 0.5 - Math.random());
        for (let i = 0; i < blindCount; i++) {
            shuffledTargets[i].displayNumber = '?';
        }
    }

    createGrid();
    
    if (targets.length > 0) {
        updatePaletteSelection(targets[0].id);
    }
}

window.addEventListener('mouseup', () => { isDrawing = false; });

gridElement.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('cell')) {
        e.preventDefault();
        saveHistory(); 
        isDrawing = true;
        const cell = e.target;
        const index = parseInt(cell.dataset.index);
        
        if (puzzleData[index] > 0) {
            updatePaletteSelection(cell.dataset.groupId);
            isErasing = false;
        } else if (cell.dataset.groupId === selectedTarget.id) {
            isErasing = true;
            eraseCell(cell);
        } else {
            isErasing = false;
            paintCell(cell);
        }
    }
}, { passive: false });

gridElement.addEventListener('touchmove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    if (element && element.classList.contains('cell')) {
        if (isErasing) {
            eraseCell(element);
        } else {
            paintCell(element);
        }
    }
}, { passive: false });

gridElement.addEventListener('touchend', () => { isDrawing = false; });

document.getElementById('next-btn').addEventListener('click', () => {
    clearModal.classList.add('hidden');
    currentStage++;
    localStorage.setItem('shikaku_stage', currentStage);
    loadStage();
});

document.getElementById('start-btn').addEventListener('click', () => {
    tutorialModal.classList.add('hidden');
    localStorage.setItem('shikaku_tutorial_seen', 'true');
});

document.getElementById('rule-help-btn').addEventListener('click', () => {
    tutorialModal.classList.remove('hidden');
});

document.getElementById('undo-btn').addEventListener('click', undo);

document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm("현재 스테이지를 처음부터 다시 시작할까요?")) {
        createGrid();
        historyStack = [];
    }
});

if (localStorage.getItem('shikaku_tutorial_seen')) {
    tutorialModal.classList.add('hidden');
}

loadStage();
