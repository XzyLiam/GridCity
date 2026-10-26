(() => {
  const msg = document.getElementById('msg');

  // If three.js failed to load you'd get a blank screen, so say so instead
  if (typeof THREE === 'undefined') {
    msg.textContent = 'Could not load three.js. Check your internet connection.';
    return;
  }

  /* ---------- Settings ---------- */
  const CELL = 2;          // size of one grid square (world units)
  const EYE = 1.7;         // camera height
  const WALK = 5;          // keyboard speed
  const RUN = 9;           // shift speed
  const TOUCH_MAX = 7;     // full-push joystick speed
  const JOY_RADIUS = 55;   // px the stick can travel
  const DEADZONE = 0.08;
  const LOOK_TOUCH = 0.0042;
  const LOOK_MOUSE = 0.0022;

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  /* ---------- Scene: white world, grid floor, nothing else ---------- */
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.Fog(0xffffff, 10, 100);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.rotation.order = 'YXZ';

  // Grid texture (one square, repeated)
  const tc = document.createElement('canvas');
  tc.width = tc.height = 256;
  const g = tc.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, 3, 256);
  g.fillRect(0, 0, 256, 3);

  const PLANE = 400;
  const tex = new THREE.CanvasTexture(tc);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(PLANE / CELL, PLANE / CELL);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE, PLANE),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- Input state ---------- */
  const keys = {};
  let yaw = 0, pitch = 0, yawT = 0, pitchT = 0;
  const joy = { id: null, x: 0, y: 0, mag: 0, ox: 0, oy: 0 };
  const look = { id: null, lx: 0, ly: 0 };

  /* Desktop: WASD + mouse look (click to lock the cursor) */
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('click', () => {
    if (!isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) fadeMsg();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    yawT -= e.movementX * LOOK_MOUSE;
    pitchT -= e.movementY * LOOK_MOUSE;
    pitchT = Math.max(-1.45, Math.min(1.45, pitchT));
    yaw = yawT; pitch = pitchT;   // mouse is applied instantly
  });

  /* Mobile: left thumb = joystick, right thumb = look */
  const touchLayer = document.getElementById('touch');
  const joyEl = document.getElementById('joy');
  const stickEl = document.getElementById('stick');

  touchLayer.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    touchLayer.setPointerCapture(e.pointerId);
    fadeMsg();
    if (e.clientX < window.innerWidth * 0.5 && joy.id === null) {
      joy.id = e.pointerId;
      joy.ox = e.clientX; joy.oy = e.clientY;
      joyEl.style.left = joy.ox + 'px';
      joyEl.style.top = joy.oy + 'px';
      stickEl.style.transform = 'translate(0px, 0px)';
      joyEl.classList.add('active');
    } else if (look.id === null) {
      look.id = e.pointerId;
      look.lx = e.clientX; look.ly = e.clientY;
    }
  });

  touchLayer.addEventListener('pointermove', e => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const len = Math.hypot(dx, dy) || 1;
      const r = Math.min(len, JOY_RADIUS);
      const nx = dx / len, ny = dy / len;
      stickEl.style.transform = `translate(${nx * r}px, ${ny * r}px)`;
      // deadzone, then a gentle curve so small pushes give fine control
      let m = Math.max(0, (r / JOY_RADIUS - DEADZONE) / (1 - DEADZONE));
      m = Math.pow(m, 1.35);
      joy.mag = m; joy.x = nx * m; joy.y = ny * m;
    } else if (e.pointerId === look.id) {
      yawT -= (e.clientX - look.lx) * LOOK_TOUCH;
      pitchT -= (e.clientY - look.ly) * LOOK_TOUCH;
      pitchT = Math.max(-1.45, Math.min(1.45, pitchT));
      look.lx = e.clientX; look.ly = e.clientY;
    }
  });

  function endTouch(e) {
    if (e.pointerId === joy.id) {
      joy.id = null; joy.x = joy.y = joy.mag = 0;
      joyEl.classList.remove('active');
    } else if (e.pointerId === look.id) {
      look.id = null;
    }
  }
  touchLayer.addEventListener('pointerup', endTouch);
  touchLayer.addEventListener('pointercancel', endTouch);
  touchLayer.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- Hint text ---------- */
  msg.textContent = isTouch
    ? 'Left thumb: move  ·  Right thumb: look'
    : 'Click to look around  ·  WASD to move  ·  Shift to run';
  let msgTimer = setTimeout(fadeMsg, 6000);
  function fadeMsg() {
    clearTimeout(msgTimer);
    msg.classList.add('hide');
  }

  /* ---------- Game loop ---------- */
  const pos = { x: 0, z: 0 };
  let vx = 0, vz = 0;          // local velocity (x = strafe, z = forward)
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // Smooth the look so touch drags feel silky
    if (isTouch) {
      const k = 1 - Math.exp(-dt * 28);
      yaw += (yawT - yaw) * k;
      pitch += (pitchT - pitch) * k;
    }

    // Wanted movement
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    let iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    let speed = keys.ShiftLeft || keys.ShiftRight ? RUN : WALK;
    const kl = Math.hypot(ix, iz);
    if (kl > 1) { ix /= kl; iz /= kl; }

    if (joy.id !== null) {       // joystick overrides keys while touching
      ix = joy.x; iz = -joy.y;
      speed = TOUCH_MAX;
    }

    // Accelerate / brake smoothly instead of snapping
    const k = 1 - Math.exp(-dt * (ix || iz ? 9 : 12));
    vx += (ix * speed - vx) * k;
    vz += (iz * speed - vz) * k;

    // Rotate local movement into the world
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    pos.x += (cos * vx - sin * vz) * dt;
    pos.z += (-sin * vx - cos * vz) * dt;

    // Floor follows the player in whole squares so it looks endless
    floor.position.x = Math.round(pos.x / CELL) * CELL;
    floor.position.z = Math.round(pos.z / CELL) * CELL;

    camera.position.set(pos.x, EYE, pos.z);
    camera.rotation.set(pitch, yaw, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
