const grid = document.getElementById('grid');
const cellSize = parseInt(getComputedStyle(document.documentElement)
  .getPropertyValue('--cell'), 10);

function buildGrid() {
  grid.innerHTML = '';
  document.querySelectorAll('.wonky').forEach(el => el.remove());

  // +2 so the grid always overflows the screen edges
  const cols = Math.ceil(window.innerWidth / cellSize) + 2;
  const rows = Math.ceil(window.innerHeight / cellSize) + 2;
  grid.style.setProperty('--cols', cols);

  const frag = document.createDocumentFragment();
  for (let i = 0; i < cols * rows; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    frag.appendChild(cell);
  }
  grid.appendChild(frag);

  addWonkyLine(475, 5);    // slopes slightly down to the right
  addWonkyLine(1208, -8);  // slopes slightly up to the right
}

// y = start height, drop = how many px it rises/falls across the screen
function addWonkyLine(y, drop) {
  if (y > window.innerHeight) return;
  const line = document.createElement('div');
  line.className = 'wonky';
  line.style.top = y + 'px';
  const angle = Math.atan2(drop, window.innerWidth) * 180 / Math.PI;
  line.style.transform = `rotate(${angle}deg)`;
  document.body.appendChild(line);
}

buildGrid();
window.addEventListener('resize', buildGrid);
