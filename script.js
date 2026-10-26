(function () {
  'use strict';

  const hint = document.getElementById('hint');

  if (typeof THREE === 'undefined') {
    hint.innerHTML = '<strong>Couldn\u2019t load the 3D library</strong><span>Check your connection and reload.</span>';
    return;
  }

  /* ---------- Settings (tweak these) ---------- */
  const CELL = 2;            // world size of one grid square
  const FLOOR = 400;         // size of the floor plane (it follows you, so it feels endless)
  const EYE = 1.7;           // camera height
  const WALK = 4.5;          // walk speed (units / second)
  const RUN = 1.8;           // run multiplier (Shift, or full-tilt joystick)
  const MOUSE_LOOK = 0.0022; // mouse sensitivity
  const TOUCH_LOOK = 0.0045; // touch-look sensitivity
  const STICK_R = 56;        // joystick radius in px
  const DEADZONE = 0.08;     // joystick dead zone (0-1)
  const LINE_COLOR = '#4a4d52';

  /* ---------- Renderer / scene ---------- */
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (err) {
    hint.innerHTML = '<strong>WebGL isn\u2019t available</strong><span>Try a different browser or device.</span>';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.Fog(0xffffff, 8, 70);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 120);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, EYE, 0);

  /* ---------- Floor with grid texture ---------- */
  const tc = document.createElement('canvas');
  tc.width = tc.height = 256;
  const g = tc.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = LINE_COLOR;
  g.fillRect(0, 0, 256, 4);   // top line
  g.fillRect(0, 0, 4, 256);   // left line

  const tex = new THREE.CanvasTexture(tc);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(FLOOR / CELL, FLOOR / CELL);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR, FLOOR),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  /* ---------- Resize ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 82 : 70;   // wider view in portrait
    camera.updateProjectionMatrix();
    if (!moveT) placeStick(HOME_X, homeY(), false);
  }

  /* ---------- Look state ---------- */
  let yaw = 0, pitch = -0.22;
  let tYaw = yaw, tPitch = pitch;     // targets (smoothed toward)
  const PITCH_MAX = 1.45;

  function applyLook(dx, dy, smooth, sens) {
    tYaw -= dx * sens;
    tPitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, tPitch - dy * sens));
    if (!smooth) { yaw = tYaw; pitch = tPitch; }
  }

  /* ---------- Input state ---------- */
  const keys = {};
  const joy = { x: 0, y: 0, m: 0 };
  const vel = { x: 0, z: 0 };
  let moveT = null;   // joystick touch
  let lookT = null;   // look touch
  let mouseDown = false;

  function dismissHint() { hint.classList.add('hide'); }

  /* ---------- Joystick UI ---------- */
  const stickEl = document.getElementById('stick');
  const thumbEl = stickEl.querySelector('.thumb');
  const HOME_X = 90;
  const homeY = () => window.innerHeight - 120;

  function placeStick(x, y, active) {
    stickEl.classList.toggle('active', active);
    stickEl.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }

  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    stickEl.classList.add('show');
  }

  function updateJoystick(e) {
    let dx = e.clientX - moveT.ox;
    let dy = e.clientY - moveT.oy;
    const d = Math.hypot(dx, dy);

    // If the finger goes past the edge, the base follows it (no need to re-center)
    if (d > STICK_R) {
      const k = (d - STICK_R) / d;
      moveT.ox += dx * k;
      moveT.oy += dy * k;
      dx = e.clientX - moveT.ox;
      dy = e.clientY - moveT.oy;
      placeStick(moveT.ox, moveT.oy, true);
    }

    thumbEl.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';

    const nx = dx / STICK_R, ny = dy / STICK_R;
    const len = Math.hypot(nx, ny);
    if (len < DEADZONE) {
      joy.x = joy.y = joy.m = 0;
    } else {
      const s = (Math.min(1, len) - DEADZONE) / (1 - DEADZONE);
      const shaped = Math.pow(s, 1.3);     // gentle curve: fine control at low tilt
      joy.x = (nx / len) * shaped;
      joy.y = -(ny / len) * shaped;        // up on screen = forward
      joy.m = shaped;
    }
  }

  /* ---------- Pointer input (mouse + touch) ---------- */
  canvas.addEventListener('pointerdown', function (e) {
    dismissHint();

    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      mouseDown = true;
      try {
        const p = canvas.requestPointerLock && canvas.requestPointerLock();
        if (p && p.catch) p.catch(function () {});
      } catch (err) {}
      return;
    }

    // Touch
    stickEl.classList.add('show');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}

    if (!moveT && e.clientX < window.innerWidth * 0.5) {
      moveT = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      placeStick(e.clientX, e.clientY, true);
      thumbEl.style.transform = 'translate3d(0,0,0)';
    } else if (!lookT) {
      lookT = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') return;
    if (moveT && e.pointerId === moveT.id) {
      updateJoystick(e);
    } else if (lookT && e.pointerId === lookT.id) {
      applyLook(e.clientX - lookT.x, e.clientY - lookT.y, true, TOUCH_LOOK);
      lookT.x = e.clientX;
      lookT.y = e.clientY;
    }
  });

  function endPointer(e) {
    if (moveT && e.pointerId === moveT.id) {
      moveT = null;
      joy.x = joy.y = joy.m = 0;
      thumbEl.style.transform = 'translate3d(0,0,0)';
      placeStick(HOME_X, homeY(), false);   // glides back home
    }
    if (lookT && e.pointerId === lookT.id) lookT = null;
    if (e.pointerType === 'mouse') mouseDown = false;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Mouse look (pointer-locked, or drag as a fallback)
  document.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement === canvas || mouseDown) {
      applyLook(e.movementX || 0, e.movementY || 0, false, MOUSE_LOOK);
    }
  });
  window.addEventListener('mouseup', function () { mouseDown = false; });

  /* ---------- Keyboard ---------- */
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    dismissHint();
    if (e.code.indexOf('Arrow') === 0 || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
    mouseDown = false;
  });

  /* ---------- Stop the browser from scrolling / zooming ---------- */
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 150); });

  /* ---------- Main loop ---------- */
  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);

    // Arrow keys also look around
    const turn = 1.8 * dt;
    if (keys.ArrowLeft)  tYaw += turn;
    if (keys.ArrowRight) tYaw -= turn;
    if (keys.ArrowUp)    tPitch = Math.min(PITCH_MAX, tPitch + turn);
    if (keys.ArrowDown)  tPitch = Math.max(-PITCH_MAX, tPitch - turn);

    // Smooth the look toward its target (frame-rate independent)
    const lk = 1 - Math.exp(-dt * 28);
    yaw += (tYaw - yaw) * lk;
    pitch += (tPitch - pitch) * lk;
    camera.rotation.set(pitch, yaw, 0);

    // Movement input: keyboard + joystick
    const kx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const ky = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    let ix = kx + joy.x, iy = ky + joy.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }

    let speed = WALK;
    if (keys.ShiftLeft || keys.ShiftRight) {
      speed *= RUN;
    } else if (joy.m > 0.85) {
      speed *= 1 + (RUN - 1) * Math.min(1, (joy.m - 0.85) / 0.15);  // full tilt = run
    }

    const s = Math.sin(yaw), c = Math.cos(yaw);
    const tx = (c * ix - s * iy) * speed;
    const tz = (-s * ix - c * iy) * speed;

    // Smooth acceleration / deceleration
    const vk = 1 - Math.exp(-dt * 10);
    vel.x += (tx - vel.x) * vk;
    vel.z += (tz - vel.z) * vk;
    camera.position.x += vel.x * dt;
    camera.position.z += vel.z * dt;

    // Floor follows the camera, snapped to the grid so lines never slide
    floor.position.x = Math.round(camera.position.x / CELL) * CELL;
    floor.position.z = Math.round(camera.position.z / CELL) * CELL;

    renderer.render(scene, camera);
  }

  resize();
  frame();
})();
