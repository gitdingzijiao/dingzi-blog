/**
 * 枪战 · Firefight —— Three.js 第一人称射击
 *
 * 全部程序化生成：几何、贴图、音效都不依赖外部资源。
 */
import * as THREE from "three";
import { Sound } from "./sound.js";
import { buildLevel, TILE } from "./level.js";

// ────────────────────────────────────────────────────────────
// 配置
// ────────────────────────────────────────────────────────────
const WEAPONS = [
  { id:"pistol",  name:"手枪",   dmg:26, rpm:330, mag:12, reserve:120, auto:false, spread:0.010, reload:1.00, recoil:0.030, snd:"pistol",  pellets:1 },
  { id:"smg",     name:"冲锋枪", dmg:15, rpm:840, mag:30, reserve:240, auto:true,  spread:0.024, reload:1.45, recoil:0.016, snd:"smg",     pellets:1 },
  { id:"rifle",   name:"步枪",   dmg:40, rpm:400, mag:20, reserve:160, auto:true,  spread:0.008, reload:1.65, recoil:0.040, snd:"rifle",   pellets:1 },
  { id:"shotgun", name:"霰弹枪", dmg:13, rpm:78,  mag:6,  reserve:48,  auto:false, spread:0.070, reload:2.10, recoil:0.085, snd:"shotgun", pellets:9 },
];

const PLAYER = {
  eye: 1.72, radius: 0.42, speed: 7.4, sprint: 11.4, accel: 52, friction: 12,
  jump: 6.2, gravity: 18, maxHp: 100,
};

// ────────────────────────────────────────────────────────────
// 渲染基础
// ────────────────────────────────────────────────────────────
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16203a);
scene.fog = new THREE.Fog(0x16203a, 50, 135);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = "YXZ";

// 灯光
scene.add(new THREE.HemisphereLight(0xcadcff, 0x3c4456, 1.15));
const sun = new THREE.DirectionalLight(0xffe9c4, 1.65);
sun.position.set(38, 62, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
const SS = 70;
Object.assign(sun.shadow.camera, { left:-SS, right:SS, top:SS, bottom:-SS });
sun.shadow.bias = -0.0008;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7fa0ff, 0.45);
fill.position.set(-30, 26, -34);
scene.add(fill);

// 枪口闪光灯（跟着相机）
const muzzleLight = new THREE.PointLight(0xffcc66, 0, 16, 2);
scene.add(muzzleLight);

// ────────────────────────────────────────────────────────────
// 关卡
// ────────────────────────────────────────────────────────────
const level = buildLevel(scene);
const { solid } = level;

// ────────────────────────────────────────────────────────────
// 玩家
// ────────────────────────────────────────────────────────────
const player = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: PLAYER.maxHp,
  onGround: true, vy: 0,
  bob: 0, stepAcc: 0,
  alive: true,
};
function spawnPlayer() {
  const s = level.spawns.player[Math.floor(Math.random() * level.spawns.player.length)];
  player.pos.set(s.x, PLAYER.eye, s.z);
  player.vel.set(0, 0, 0);
  player.vy = 0;
  player.hp = PLAYER.maxHp;
  player.alive = true;
  player.yaw = Math.atan2(-s.x, -s.z);
  player.pitch = 0;
}

// 输入
const keys = Object.create(null);
let mouseDown = false, rightDown = false, locked = false;

addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyR") reload();
  if (e.code === "Digit1") switchWeapon(0);
  if (e.code === "Digit2") switchWeapon(1);
  if (e.code === "Digit3") switchWeapon(2);
  if (e.code === "Digit4") switchWeapon(3);
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouseDown = false; });

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === "play") pause();
});
document.addEventListener("mousemove", (e) => {
  if (!locked || state !== "play") return;
  const s = 0.0022 * (aiming ? 0.62 : 1);
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch));
});
canvas.addEventListener("mousedown", (e) => {
  if (state !== "play") return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) { rightDown = true; setAim(true); }
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) { rightDown = false; setAim(false); }
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// 瞄准（右键）
let aiming = false, aimT = 0;
function setAim(on) { aiming = on; }

// ────────────────────────────────────────────────────────────
// 武器
// ────────────────────────────────────────────────────────────
let wi = 0;
const wpn = WEAPONS.map((w) => ({ ...w, inMag: w.mag, cool: 0, reloading: 0 }));
let recoil = 0, recoilV = 0, switchT = 0;

// 视图模型（枪）
const vm = new THREE.Group();
camera.add(vm);
scene.add(camera);

const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.55, metalness: 0.75 });
const gunMat2 = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.7, metalness: 0.5 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0xffb03a, roughness: 0.5, metalness: 0.4, emissive: 0x341c00 });

function buildGunModels() {
  const groups = [];
  const mk = (parts) => {
    const g = new THREE.Group();
    parts.forEach(([w, h, d, x, y, z, mat]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || gunMat);
      m.position.set(x, y, z);
      g.add(m);
    });
    g.visible = false;
    vm.add(g);
    return g;
  };
  // 手枪
  groups.push(mk([
    [0.10, 0.14, 0.42, 0, 0, -0.22, gunMat],
    [0.09, 0.20, 0.13, 0, -0.14, -0.04, gunMat2],
    [0.05, 0.05, 0.16, 0, 0.02, -0.46, gunMat2],
  ]));
  // 冲锋枪
  groups.push(mk([
    [0.11, 0.13, 0.60, 0, 0, -0.30, gunMat],
    [0.09, 0.24, 0.12, 0, -0.16, -0.12, gunMat2],
    [0.07, 0.09, 0.26, 0, -0.09, -0.20, accentMat],
    [0.05, 0.05, 0.20, 0, 0.01, -0.66, gunMat2],
  ]));
  // 步枪
  groups.push(mk([
    [0.12, 0.14, 0.86, 0, 0, -0.40, gunMat],
    [0.10, 0.13, 0.28, 0, -0.06, 0.06, gunMat2],
    [0.08, 0.22, 0.14, 0, -0.16, -0.16, gunMat2],
    [0.07, 0.10, 0.30, 0, -0.08, -0.28, accentMat],
    [0.05, 0.05, 0.30, 0, 0.02, -0.92, gunMat2],
    [0.04, 0.10, 0.12, 0, 0.10, -0.36, gunMat2],
  ]));
  // 霰弹枪
  groups.push(mk([
    [0.14, 0.16, 0.92, 0, 0, -0.42, gunMat],
    [0.12, 0.16, 0.22, 0, -0.08, 0.04, gunMat2],
    [0.10, 0.10, 0.44, 0, -0.11, -0.46, accentMat],
    [0.10, 0.22, 0.14, 0, -0.20, -0.10, gunMat2],
  ]));
  return groups;
}
const gunModels = buildGunModels();

function  curW() { return wpn[wi]; }

function switchWeapon(i) {
  if (i === wi || i < 0 || i >= wpn.length || switchT > 0) return;
  wi = i;
  switchT = 0.28;
  wpn[wi].reloading = 0;
  Sound.reload();
  updateHud();
}

function startReload() {
  const w = curW();
  if (w.reloading > 0 || w.inMag >= w.mag || w.reserve <= 0) return;
  w.reloading = w.reload;
  Sound.reload();
}
function reload() { startReload(); }

function finishReload() {
  const w = curW();
  const need = w.mag - w.inMag;
  const take = Math.min(need, w.reserve);
  w.inMag += take;
  w.reserve -= take;
  updateHud();
}

// ────────────────────────────────────────────────────────────
// 特效
// ────────────────────────────────────────────────────────────
const fx = { tracers: [], sparks: [], decals: [] };

const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9 });

function spawnTracer(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 4, 1, true);
  geo.translate(0, len / 2, 0);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, tracerMat.clone());
  m.position.copy(from);
  m.lookAt(to);
  scene.add(m);
  fx.tracers.push({ m, t: 0.055 });
}

const sparkGeo = new THREE.BufferGeometry();
const SPARK_N = 260;
const sparkPos = new Float32Array(SPARK_N * 3);
const sparkVel = new Float32Array(SPARK_N * 3);
const sparkLife = new Float32Array(SPARK_N);
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  color: 0xffcc66, size: 0.14, transparent: true, opacity: 0.95, depthWrite: false,
}));
sparks.frustumCulled = false;
scene.add(sparks);
let sparkHead = 0;
function burst(p, n = 8, spread = 2.4, up = 1) {
  for (let i = 0; i < n; i++) {
    const k = sparkHead = (sparkHead + 1) % SPARK_N;
    sparkPos[k * 3] = p.x; sparkPos[k * 3 + 1] = p.y; sparkPos[k * 3 + 2] = p.z;
    sparkVel[k * 3] = (Math.random() - 0.5) * spread;
    sparkVel[k * 3 + 1] = Math.random() * spread * up;
    sparkVel[k * 3 + 2] = (Math.random() - 0.5) * spread;
    sparkLife[k] = 0.42 + Math.random() * 0.3;
  }
}
for (let i = 0; i < SPARK_N; i++) sparkPos[i * 3 + 1] = -999;

function updateFx(dt) {
  // 曳光
  for (let i = fx.tracers.length - 1; i >= 0; i--) {
    const t = fx.tracers[i];
    t.t -= dt;
    t.m.material.opacity = Math.max(0, t.t / 0.055) * 0.9;
    if (t.t <= 0) { scene.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose(); fx.tracers.splice(i, 1); }
  }
  // 火花
  let live = false;
  for (let i = 0; i < SPARK_N; i++) {
    if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -999; continue; }
    live = true;
    sparkLife[i] -= dt;
    sparkVel[i * 3 + 1] -= 12 * dt;
    sparkPos[i * 3] += sparkVel[i * 3] * dt;
    sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
    sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparks.visible = live;
  // 枪口灯衰减
  if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 90);
}

// ────────────────────────────────────────────────────────────
// 敌人
// ────────────────────────────────────────────────────────────
const enemies = [];
const hittable = [];        // 用于射线检测的网格 → 反向引用
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a2230, roughness: 0.75, metalness: 0.25 });
const headMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.5 });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });

function makeEnemyModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.98, 0.44), bodyMat.clone());
  body.position.y = 1.05; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), headMat.clone());
  head.position.y = 1.78; head.castShadow = true;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.03), eyeMat.clone());
  eye.position.set(0, 1.80, 0.22);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), bodyMat.clone());
  armL.position.set(-0.44, 1.1, 0.06);
  const armR = armL.clone(); armR.position.x = 0.44;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.58, 0.22), bodyMat.clone());
  legL.position.set(-0.18, 0.29, 0);
  const legR = legL.clone(); legR.position.x = 0.18;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.5), headMat.clone());
  gun.position.set(0.42, 1.14, 0.3);
  g.add(body, head, eye, armL, armR, legL, legR, gun);
  return g;
}

function spawnEnemy() {
  const pts = level.spawns.enemy;
  let s = pts[Math.floor(Math.random() * pts.length)];
  // 尽量离玩家远一点
  for (let i = 0; i < 8; i++) {
    const c = pts[Math.floor(Math.random() * pts.length)];
    if (c.x === undefined) break;
    if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 16) { s = c; break; }
  }
  const model = makeEnemyModel();
  model.position.set(s.x, 0, s.z);
  scene.add(model);
  const hp = 58 + wave * 9;
  const e = {
    model, hp, maxHp: hp,
    pos: new THREE.Vector3(s.x, 0, s.z),
    yaw: 0, state: "idle", t: 0, fire: 1.2 + Math.random(),
    hitT: 0, dead: false, deadT: 0,
    speed: 2.5 + Math.min(1.8, wave * 0.14),
    dmg: 7 + wave * 0.7,
    acc: 0.055 + Math.min(0.05, wave * 0.004),
    parts: model.children,
  };
  model.children.forEach((c) => { c.userData.enemy = e; hittable.push(c); });
  enemies.push(e);
  return e;
}

function damageEnemy(e, dmg, point) {
  if (e.dead) return false;
  e.hp -= dmg;
  e.hitT = 0.12;
  Sound.flesh(e.pos);
  if (e.hp <= 0) {
    e.dead = true; e.deadT = 0.75;
    Sound.kill(e.pos);
    burst(new THREE.Vector3(e.pos.x, 1.2, e.pos.z), 16, 3.2, 1.4);
    score += 100;
    kills++;
    // 掉弹药
    const w = curW();
    w.reserve = Math.min(w.reserve + 12, WEAPONS[wi].reserve);
    updateHud();
    return true;
  }
  return false;
}

/** 玩家是否在敌人视线内（无墙阻挡） */
const losRay = new THREE.Raycaster();
losRay.far = 90;
function canSee(a, b) {
  const from = new THREE.Vector3(a.x, 1.2, a.z);
  const dir = new THREE.Vector3().subVectors(new THREE.Vector3(b.x, 1.2, b.z), from);
  const dist = dir.length();
  if (dist < 0.6) return true;
  dir.normalize();
  losRay.set(from, dir);
  losRay.far = dist;
  const hits = losRay.intersectObjects(level.meshes, false);
  return hits.length === 0;
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.dead) {
      e.deadT -= dt;
      e.model.rotation.x = Math.min(Math.PI / 2, (0.75 - e.deadT) * 3.2);
      e.model.position.y = -Math.max(0, (0.75 - e.deadT)) * 0.4;
      e.model.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, e.deadT / 0.75); } });
      if (e.deadT <= 0) {
        scene.remove(e.model);
        e.model.traverse((o) => { if (hittable.includes(o)) hittable.splice(hittable.indexOf(o), 1); });
        enemies.splice(i, 1);
      }
      continue;
    }

    // 受击闪白
    if (e.hitT > 0) {
      e.hitT -= dt;
      const on = e.hitT > 0 && Math.floor(e.hitT * 40) % 2 === 0;
      e.model.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.setHex(on ? 0xffffff : 0x000000); });
    }

    const toP = new THREE.Vector3().subVectors(player.pos, e.pos);
    const dist = Math.hypot(toP.x, toP.z);
    const sees = player.alive && dist < 46 && canSee(e.pos, player.pos);

    if (sees) {
      e.state = dist < 26 ? "attack" : "chase";
      e.lastSeen = new THREE.Vector3(player.pos.x, 0, player.pos.z);
      e.lostT = 0;
    } else if (player.alive && dist < 44) {
      // 「听声辨位」：看不见也会往玩家方向摸过去，不然会一直卡在墙后
      e.state = "chase";
      e.lastSeen = new THREE.Vector3(player.pos.x, 0, player.pos.z);
      e.lostT = 0;
    } else if (e.lastSeen) {
      e.lostT = (e.lostT || 0) + dt;
      e.state = e.lostT > 6 ? "idle" : "chase";
      if (e.state === "idle") e.lastSeen = null;
    }

    // 转向
    const face = sees ? toP : (e.lastSeen ? new THREE.Vector3().subVectors(e.lastSeen, e.pos) : toP);
    const wantYaw = Math.atan2(face.x, face.z);
    let dy = wantYaw - e.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += dy * Math.min(1, dt * 7);
    e.model.rotation.y = e.yaw;

    // 位移：朝目标走，撞墙就侧滑绕障
    const goal = e.lastSeen;
    if (e.state === "chase" && goal) {
      const d = new THREE.Vector3(goal.x - e.pos.x, 0, goal.z - e.pos.z);
      const dl = d.length();
      if (dl > 3.2) {
        d.normalize();
        const step = e.speed * dt;
        const move = (vx, vz) => {
          let ok = false;
          if (!solid(e.pos.x + vx, e.pos.z, 0.42)) { e.pos.x += vx; ok = true; }
          if (!solid(e.pos.x, e.pos.z + vz, 0.42)) { e.pos.z += vz; ok = true; }
          return ok;
        };
        if (!move(d.x * step, d.z * step)) {
          const sx = -d.z * step, sz = d.x * step;
          if (!move(sx, sz)) move(-sx, -sz);
        }
        e.model.position.y = Math.abs(Math.sin(performance.now() * 0.013)) * 0.09;
      } else {
        e.state = "attack";
      }
    } else if (e.state === "attack") {
      // 保持距离 + 侧向游走
      const dir = new THREE.Vector3(face.x, 0, face.z).normalize();
      const step = e.speed * 0.55 * dt;
      const sx = -dir.z * Math.sin(performance.now() * 0.0017 + e.pos.x) * step * 2.4;
      const sz = dir.x * Math.sin(performance.now() * 0.0017 + e.pos.x) * step * 2.4;
      if (!solid(e.pos.x + sx, e.pos.z, 0.42)) e.pos.x += sx;
      if (!solid(e.pos.x, e.pos.z + sz, 0.42)) e.pos.z += sz;
      if (dist < 6) {
        if (!solid(e.pos.x - dir.x * step * 1.6, e.pos.z, 0.42)) e.pos.x -= dir.x * step * 1.6;
        if (!solid(e.pos.x, e.pos.z - dir.z * step * 1.6, 0.42)) e.pos.z -= dir.z * step * 1.6;
      }
    }
    e.model.position.x = e.pos.x;
    e.model.position.z = e.pos.z;

    // 开火
    e.fire -= dt;
    if (sees && e.state === "attack" && e.fire <= 0 && player.alive) {
      e.fire = 0.85 + Math.random() * 0.7;
      enemyShoot(e, dist);
    }
  }
}

function enemyShoot(e, dist) {
  Sound.shoot("smg", new THREE.Vector3(e.pos.x, 1.3, e.pos.z));
  const from = new THREE.Vector3(e.pos.x + Math.sin(e.yaw) * 0.5, 1.3, e.pos.z + Math.cos(e.yaw) * 0.5);
  const target = new THREE.Vector3(player.pos.x, player.pos.y - 0.25, player.pos.z);
  const dir = new THREE.Vector3().subVectors(target, from).normalize();
  const spread = e.acc * (1 + dist / 34);
  dir.x += (Math.random() - 0.5) * spread * 3;
  dir.y += (Math.random() - 0.5) * spread * 2.2;
  dir.z += (Math.random() - 0.5) * spread * 3;
  dir.normalize();

  const end = from.clone().addScaledVector(dir, 90);
  spawnTracer(from, end);

  // 命中判定：射线到玩家球体的最近距离
  const toPlayer = new THREE.Vector3().subVectors(target, from);
  const t = toPlayer.dot(dir);
  let hit = false;
  if (t > 0) {
    const closest = from.clone().addScaledVector(dir, t);
    if (closest.distanceTo(target) < 0.62) hit = true;
  }
  if (hit) {
    hurtPlayer(e.dmg, e.pos);
  } else if (Math.random() < 0.35) {
    // 打空也有流弹声
    Sound.impact(end.clone().addScaledVector(dir, -6));
  }
}

function hurtPlayer(dmg, fromPos) {
  if (!player.alive) return;
  player.hp -= dmg;
  Sound.hurt();
  flashVig();
  if (fromPos) {
    // 受击方向提示：轻微视角冲击
    const a = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z);
    let d = a - player.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.yaw -= Math.sign(d) * Math.min(0.05, Math.abs(d) * 0.02);
  }
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    Sound.die();
    setTimeout(() => gameOver(), 700);
  }
  updateHud();
}

// ────────────────────────────────────────────────────────────
// 射击
// ────────────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
const shotDir = new THREE.Vector3();
let shotsFired = 0, shotsHit = 0;

function tryFire(dt) {
  const w = curW();
  // 松开扳机就复位，否则半自动武器只能打第一发
  if (!mouseDown) { for (const ww of wpn) ww.held = false; }
  if (w.cool > 0) w.cool -= dt;
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) { w.reloading = 0; finishReload(); }
    return;
  }
  // 打空后自动开始换弹
  if (w.autoReload > 0) {
    w.autoReload -= dt;
    if (w.autoReload <= 0) { w.autoReload = 0; startReload(); }
  }
  if (!mouseDown || switchT > 0) return;
  if (!w.auto && w.held) return;
  if (w.cool > 0) return;

  if (w.inMag <= 0) {
    Sound.empty();
    w.cool = 0.28;
    if (w.reserve > 0) startReload();
    return;
  }

  w.held = true;
  w.inMag--;
  w.cool = 60 / w.rpm;
  shotsFired++;
  // 打空自动换弹（不用再点一次）
  if (w.inMag <= 0 && w.reserve > 0) w.autoReload = 0.22;

  // 后坐力
  recoilV += w.recoil;
  player.pitch += w.recoil * 0.35;
  muzzleLight.position.copy(camera.position);
  muzzleLight.intensity = 4.5;

  Sound.shoot(w.snd);
  Sound.hitmark && 0;

  const origin = camera.position.clone();
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);

  let anyHit = false;
  for (let p = 0; p < w.pellets; p++) {
    shotDir.copy(baseDir);
    const sp = w.spread * (aiming ? 0.45 : 1) * (player.vel.length() > 5 ? 1.5 : 1);
    shotDir.x += (Math.random() - 0.5) * sp * 2;
    shotDir.y += (Math.random() - 0.5) * sp * 2;
    shotDir.z += (Math.random() - 0.5) * sp * 2;
    shotDir.normalize();

    ray.set(origin, shotDir);
    ray.far = 180;
    const eHits = ray.intersectObjects(hittable, false);
    const wHits = ray.intersectObjects(level.meshes, false);

    const eD = eHits.length ? eHits[0].distance : Infinity;
    const wD = wHits.length ? wHits[0].distance : Infinity;

    if (eD < wD && eHits.length) {
      const hit = eHits[0];
      const en = hit.object.userData.enemy;
      spawnTracer(origin.clone().addScaledVector(shotDir, 0.7), hit.point);
      if (en && !en.dead) {
        anyHit = true;
        damageEnemy(en, w.dmg, hit.point);
        burst(hit.point, 5, 1.6, 0.6);
      }
    } else if (wHits.length) {
      const hit = wHits[0];
      spawnTracer(origin.clone().addScaledVector(shotDir, 0.7), hit.point);
      burst(hit.point, 5, 2.0, 1.1);
      Sound.impact(hit.point);
    } else {
      spawnTracer(origin.clone().addScaledVector(shotDir, 0.7), origin.clone().addScaledVector(shotDir, 110));
    }
  }

  if (anyHit) { shotsHit++; hitMark(); }
  updateHud();
}

let hitT = 0;
function hitMark() {
  Sound.hitmark();
  const c = document.getElementById("cross");
  c.classList.add("hit");
  hitT = 0.12;
}

// ────────────────────────────────────────────────────────────
// 波次 / 状态
// ────────────────────────────────────────────────────────────
let state = "menu";     // menu | play | pause | dead
let wave = 0, score = 0, kills = 0;
let toSpawn = 0, spawnTimer = 0, waveBreak = 0, frozen = false;
const MAX_ALIVE = 9;

function startWave(n) {
  wave = n;
  toSpawn = 3 + Math.floor(n * 1.7);
  spawnTimer = 0.4;
  waveBreak = 0;
  Sound.blip(true);
  showMsg(`第 ${n} 波`, 1.6);
  updateHud();
}

function updateWaves(dt) {
  if (!player.alive || frozen) return;
  if (toSpawn > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < MAX_ALIVE) {
      spawnEnemy();
      toSpawn--;
      spawnTimer = Math.max(0.45, 1.5 - wave * 0.08);
    }
  } else if (enemies.length === 0) {
    waveBreak += dt;
    if (waveBreak > 2.6) startWave(wave + 1);
  }
}

// ────────────────────────────────────────────────────────────
// HUD
// ────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
function updateHud() {
  const w = curW();
  $("hpFill").style.width = `${(player.hp / PLAYER.maxHp) * 100}%`;
  $("hpFill").className = player.hp < 35 ? "low" : "";
  $("hpNum").textContent = Math.ceil(player.hp);
  $("ammoMag").textContent = w.inMag;
  $("ammoMag").className = w.inMag === 0 ? "empty" : "";
  $("ammoRes").textContent = `/ ${w.reserve}`;
  $("wpnName").textContent = w.name;
  $("waveNum").textContent = wave;
  $("scoreNum").textContent = score;
  $("leftNum").textContent = enemies.filter((e) => !e.dead).length + toSpawn;
}
let msgT = 0;
function showMsg(txt, dur = 1.4) { $("msg").textContent = txt; $("msg").classList.add("on"); msgT = dur; }
let vigT = 0;
function flashVig() { $("vig").style.opacity = "1"; vigT = 0.32; }

// 小地图
const mm = $("minimap");
const mmx = mm.getContext("2d");
const MM_SIZE = mm.width;
const baseMap = document.createElement("canvas");
baseMap.width = baseMap.height = MM_SIZE;
(function drawBaseMap() {
  const g = baseMap.getContext("2d");
  const rows = level.rows, cols = level.cols;
  const s = MM_SIZE / cols;
  g.fillStyle = "rgba(8,12,22,0.75)";
  g.fillRect(0, 0, MM_SIZE, MM_SIZE);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = level.grid[r][c];
    if (v) { g.fillStyle = "rgba(120,160,220,0.55)"; g.fillRect(c * s, r * s, s - 0.5, s - 0.5); }
  }
})();

function tileOf(x, z) {
  return {
    c: (x + level.halfW) / TILE,
    r: (z + level.halfH) / TILE,
  };
}
function drawMinimap() {
  const s = MM_SIZE / level.cols;
  mmx.clearRect(0, 0, MM_SIZE, MM_SIZE);
  mmx.drawImage(baseMap, 0, 0);
  // 敌人
  for (const e of enemies) {
    if (e.dead) continue;
    const t = tileOf(e.pos.x, e.pos.z);
    mmx.fillStyle = "#ff4b4b";
    mmx.beginPath();
    mmx.arc(t.c * s, t.r * s, 5.5, 0, Math.PI * 2);
    mmx.fill();
  }
  // 玩家 + 朝向
  const p = tileOf(player.pos.x, player.pos.z);
  mmx.save();
  mmx.translate(p.c * s, p.r * s);
  mmx.rotate(-player.yaw);
  mmx.fillStyle = "#5cc8ff";
  mmx.beginPath();
  mmx.moveTo(0, -10); mmx.lineTo(7, 8); mmx.lineTo(0, 4); mmx.lineTo(-7, 8);
  mmx.closePath();
  mmx.fill();
  mmx.restore();
}

// ────────────────────────────────────────────────────────────
// 覆盖层 / 状态切换
// ────────────────────────────────────────────────────────────
const ov = $("ov");
function showOverlay(kind) {
  ov.classList.remove("hide");
  const stats = $("ovStats");
  if (kind === "menu") {
    $("ovTitle").textContent = "枪 战";
    $("ovSub").textContent = "FIREFIGHT · 抵挡进攻的波次";
    $("ovKey").textContent = "点击开始";
    stats.style.display = "none";
  } else if (kind === "pause") {
    $("ovTitle").textContent = "已暂停";
    $("ovSub").textContent = "按 Esc 或点击继续";
    $("ovKey").textContent = "继续战斗";
    stats.style.display = "flex";
    fillStats();
  } else {
    $("ovTitle").textContent = "阵亡";
    $("ovSub").textContent = `你在第 ${wave} 波倒下了`;
    $("ovKey").textContent = "重新开始";
    stats.style.display = "flex";
    fillStats();
  }
}
function fillStats() {
  $("stScore").textContent = score;
  $("stWave").textContent = wave;
  $("stKills").textContent = kills;
  $("stAcc").textContent = shotsFired ? Math.round((shotsHit / shotsFired) * 100) + "%" : "0%";
}
function hideOverlay() { ov.classList.add("hide"); }

function startGame() {
  Sound.init();
  hideOverlay();
  state = "play";
  // 清场
  for (const e of enemies) scene.remove(e.model);
  enemies.length = 0;
  hittable.length = 0;
  score = 0; kills = 0; shotsFired = 0; shotsHit = 0;
  wpn.forEach((w) => { w.inMag = w.mag; w.reserve = w.mag * 8; w.reloading = 0; w.cool = 0; w.held = false; w.autoReload = 0; });
  wi = 0; switchT = 0;
  spawnPlayer();
  startWave(1);
  updateHud();
  // 操作提示开局后淡出，别一直挡着枪
  clearTimeout(hintTimer);
  $("hint").style.opacity = "1";
  hintTimer = setTimeout(() => { $("hint").style.transition = "opacity 1.2s"; $("hint").style.opacity = "0"; }, 14000);
  canvas.requestPointerLock();
}
let hintTimer = 0;
function pause() {
  if (state !== "play") return;
  state = "pause";
  if (document.pointerLockElement) document.exitPointerLock();
  showOverlay("pause");
}
function resume() {
  state = "play";
  hideOverlay();
  canvas.requestPointerLock();
}
function gameOver() {
  state = "dead";
  if (document.pointerLockElement) document.exitPointerLock();
  showOverlay("dead");
}
ov.addEventListener("click", () => {
  if (state === "menu" || state === "dead") startGame();
  else if (state === "pause") resume();
});
addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (state === "play") pause();
    else if (state === "pause") resume();
  }
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ────────────────────────────────────────────────────────────
// 主循环
// ────────────────────────────────────────────────────────────
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();
let last = performance.now();

function updatePlayer(dt) {
  if (!player.alive) return;
  // 输入方向（相对朝向）
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  wish.set(0, 0, 0);
  if (keys.KeyW) wish.add(fwd);
  if (keys.KeyS) wish.sub(fwd);
  if (keys.KeyD) wish.add(right);
  if (keys.KeyA) wish.sub(right);

  const sprinting = keys.ShiftLeft || keys.ShiftRight;
  const maxSpd = (sprinting && wish.lengthSq() > 0 ? PLAYER.sprint : PLAYER.speed) * (aiming ? 0.5 : 1);

  if (wish.lengthSq() > 0) {
    wish.normalize().multiplyScalar(PLAYER.accel * dt);
    player.vel.x += wish.x;
    player.vel.z += wish.z;
  }
  // 摩擦
  const damp = Math.exp(-PLAYER.friction * dt);
  if (wish.lengthSq() === 0) { player.vel.x *= damp; player.vel.z *= damp; }
  // 限速
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp > maxSpd) { player.vel.x *= maxSpd / sp; player.vel.z *= maxSpd / sp; }

  // 跳跃 / 重力
  if (keys.Space && player.onGround) { player.vy = PLAYER.jump; player.onGround = false; }
  player.vy -= PLAYER.gravity * dt;

  // 分轴碰撞
  const r = PLAYER.radius;
  const nx = player.pos.x + player.vel.x * dt;
  if (!solid(nx, player.pos.z, r)) player.pos.x = nx; else player.vel.x = 0;
  const nz = player.pos.z + player.vel.z * dt;
  if (!solid(player.pos.x, nz, r)) player.pos.z = nz; else player.vel.z = 0;

  let y = player.pos.y + player.vy * dt;
  if (y <= PLAYER.eye) { y = PLAYER.eye; player.vy = 0; player.onGround = true; }
  player.pos.y = y;

  // 头部起伏 + 脚步
  const moving = sp > 1.2 && player.onGround;
  if (moving) {
    player.bob += dt * sp * 1.5;
    player.stepAcc += dt * sp;
    if (player.stepAcc > 3.4) { player.stepAcc = 0; Sound.step(); }
  } else player.bob += dt * 1.2;

  // 落点/跨度限制在场地内
  const lim = level.halfW - 0.6;
  player.pos.x = Math.max(-lim, Math.min(lim, player.pos.x));
  player.pos.z = Math.max(-lim, Math.min(lim, player.pos.z));
}

function updateCamera(dt) {
  // 后坐力回弹
  recoil += recoilV;
  recoilV *= Math.exp(-14 * dt);
  recoil *= Math.exp(-9 * dt);

  const bobY = Math.sin(player.bob * 2) * 0.045 * (Math.hypot(player.vel.x, player.vel.z) > 1.2 ? 1 : 0.25);
  const bobX = Math.cos(player.bob) * 0.03 * (Math.hypot(player.vel.x, player.vel.z) > 1.2 ? 1 : 0.25);

  camera.position.set(player.pos.x + bobX * 0.3, player.pos.y + bobY, player.pos.z);
  camera.rotation.set(player.pitch + recoil * 0.6, player.yaw, Math.sin(player.bob) * 0.006);

  // 视图模型
  const gm = gunModels[wi];
  gunModels.forEach((g, i) => { g.visible = i === wi && state !== "menu"; });
  if (gm) {
    const aimOff = aiming ? -0.10 : 0;
    const zKick = recoil * 0.55;
    const drop = switchT > 0 ? (switchT / 0.28) * 0.42 : 0;
    gm.position.set(
      0.30 + (aiming ? -0.30 : 0),
      -0.20 + bobY * 0.5 - drop + (aiming ? 0.085 : 0),
      -0.60 + zKick + aimOff
    );
    gm.rotation.set(-recoil * 3.4 - drop * 1.4, 0.03, 0);
    gm.scale.setScalar(aiming ? 0.78 : 0.9);
  }
  if (switchT > 0) switchT = Math.max(0, switchT - dt);

  // 枪口灯跟枪
  muzzleLight.position.copy(camera.position).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), 0.9);
}

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  if (state === "play") {
    updatePlayer(dt);
    tryFire(dt);
    updateEnemies(dt);
    updateWaves(dt);
    if (locked) Sound.setListener(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), new THREE.Vector3(0, 1, 0));
  }
  updateFx(dt);

  // 准星命中反馈
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $("cross").classList.remove("hit"); }
  if (vigT > 0) { vigT -= dt; if (vigT <= 0) $("vig").style.opacity = "0"; }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $("msg").classList.remove("on"); }
  if (state === "play") { drawMinimap(); if (Math.floor(now / 250) % 2 === 0) updateHud(); }

  updateCamera(dt);
  renderer.render(scene, camera);
}

// 初始化
spawnPlayer();
updateCamera(0);
showOverlay("menu");
updateHud();
loop();

// 供自动化测试探查
window.__game = {
  get state() { return state; },
  get hp() { return player.hp; },
  get wave() { return wave; },
  get score() { return score; },
  get kills() { return kills; },
  get enemies() { return enemies.length; },
  get weapon() { return curW().id; },
  get ammo() { return { mag: curW().inMag, reserve: curW().reserve }; },
  get pos() { return { x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2) }; },
  get accuracy() { return shotsFired ? shotsHit / shotsFired : 0; },
  api: {
    start: startGame, pause, resume,
    move(x, z) { player.pos.x = x; player.pos.z = z; },
    look(yaw, pitch) { player.yaw = yaw; if (pitch !== undefined) player.pitch = pitch; },
    fire(on = true) { mouseDown = on; },
    switch: switchWeapon, reload: startReload,
    killAll() { let n = 0; enemies.forEach((e) => { if (!e.dead) { damageEnemy(e, 9999, e.pos); n++; } }); return n; },
    addEnemy() { spawnEnemy(); return enemies.length; },
    /** 在玩家正前方 dist 处放一个敌人（测试用） */
    enemyInFront(dist = 9) {
      const e = spawnEnemy();
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
      e.pos.set(player.pos.x + fx * dist, 0, player.pos.z + fz * dist);
      e.model.position.set(e.pos.x, 0, e.pos.z);
      e.state = "attack";
      e.lastSeen = new THREE.Vector3(player.pos.x, 0, player.pos.z);
      e.fire = 0.5;
      return enemies.length;
    },
    setHp(v) { player.hp = v; updateHud(); },
    /** 测试用：暂停刷怪 */
    freezeWaves(on = true) { frozen = !!on; },
    /** 测试用：把玩家放到场地中央的开阔地 */
    toCenter() { player.pos.set(0, PLAYER.eye, 0); player.yaw = 0; player.pitch = 0; },
    /** 测试用：精确瞄准第一个活着的敌人 */
    aimAtEnemy() {
      const e = enemies.find((x) => !x.dead);
      if (!e) return null;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(1.25 - player.pos.y, dist);
      return { dist: +dist.toFixed(2), ex: +e.pos.x.toFixed(2), ez: +e.pos.z.toFixed(2) };
    },
    /** 诊断：从相机打一条射线，看命中什么 */
    debugRay() {
      const o = camera.position.clone();
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      ray.set(o, d);
      ray.far = 200;
      const eh = ray.intersectObjects(hittable, false);
      const wh = ray.intersectObjects(level.meshes, false);
      return {
        hittable: hittable.length,
        enemies: enemies.length,
        enemyHits: eh.length,
        wallHits: wh.length,
        enemyDist: eh[0] ? +eh[0].distance.toFixed(2) : null,
        wallDist: wh[0] ? +wh[0].distance.toFixed(2) : null,
        cam: [+o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)],
        dir: [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)],
        yaw: +player.yaw.toFixed(3),
        enemyPos: enemies[0] ? [+enemies[0].pos.x.toFixed(2), +enemies[0].pos.z.toFixed(2)] : null,
      };
    },
    state: { get w() { return wpn; } },
  },
};
