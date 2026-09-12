/**
 * 关卡 —— 网格地图 + PBR 材质
 *
 * 贴图来自 Poly Haven（CC0），已下载到 ./assets/tex/<名称>/
 *   Diffuse.jpg  基础色（sRGB）
 *   nor_gl.jpg   法线
 *   arm.jpg      AO(红) / 粗糙度(绿) / 金属度(蓝) 打包在一张图里
 *
 * 地图字符：
 *   #  墙      .  地面      C  木箱（矮掩体）
 *   P  玩家出生点            E  敌人出生点
 */
import * as THREE from "three";

export const MAP = [
  "########################",
  "#......##..........##..#",
  "#.PP...##..........##..#",
  "#......##...CCCC...##..#",
  "#......##...CCCC...##..#",
  "#......##..........##..#",
  "#......#............#..#",
  "##..####............####",
  "#......................#",
  "#......................#",
  "#....EE...........EE...#",
  "#......................#",
  "#....####......####....#",
  "#....#..............#..#",
  "#....#....CCCC......#..#",
  "#....#....CCCC......#..#",
  "#....####......####....#",
  "#......................#",
  "#....EE...........EE...#",
  "#......................#",
  "#......................#",
  "##..####............####",
  "#......#............#..#",
  "#..PP..##..........##..#",
  "########################",
];

export const TILE = 4;
export const WALL_H = 4.6;
export const CRATE_H = 1.7;

const loader = new THREE.TextureLoader();
const texCache = new Map();

function tex(base, file, { srgb = false, repeat = [1, 1], aniso = 8 } = {}) {
  const key = `${base}/${file}|${repeat[0]},${repeat[1]}|${srgb}`;
  if (texCache.has(key)) return texCache.get(key);
  const t = loader.load(`./assets/tex/${base}/${file}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.repeat = repeat;
  texCache.set(key, t);
  return t;
}

/** 用 ARM 打包图同时喂 aoMap / roughnessMap / metalnessMap（three 分别取 r/g/b 通道） */
function pbrMaterial(base, { repeat = [1, 1], roughness = 1, metalness = 1, normalScale = 1, color = 0xffffff, envInt = 0.55 } = {}) {
  const arm = tex(base, "arm", { repeat });
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: tex(base, "Diffuse", { srgb: true, repeat }),
    normalMap: tex(base, "nor_gl", { repeat }),
    aoMap: arm,
    aoMapIntensity: 0.9,
    roughnessMap: arm,
    metalnessMap: arm,
    roughness,
    metalness,
    envMapIntensity: envInt,
  });
  mat.normalScale.set(normalScale, normalScale);
  return mat;
}

export function buildLevel(scene) {
  const rows = MAP.length;
  const cols = MAP[0].length;
  const halfW = (cols * TILE) / 2;
  const halfH = (rows * TILE) / 2;

  const solidGrid = [];
  const spawns = { player: [], enemy: [] };
  const wallCells = [];
  const crateCells = [];

  for (let r = 0; r < rows; r++) {
    solidGrid[r] = [];
    for (let c = 0; c < cols; c++) {
      const ch = MAP[r][c];
      let solid = 0;
      if (ch === "#") { solid = 1; wallCells.push([c, r]); }
      else if (ch === "C") { solid = 1; crateCells.push([c, r]); }
      else if (ch === "P") spawns.player.push(tileToWorld(c, r, cols, rows));
      else if (ch === "E") { spawns.enemy.push(tileToWorld(c, r, cols, rows)); }
      solidGrid[r][c] = solid;
    }
  }
  if (!spawns.player.length) spawns.player.push(tileToWorld(1, 1, cols, rows));

  // ── 地面：磨损混凝土地砖 ──
  const floorGeo = new THREE.PlaneGeometry(cols * TILE, rows * TILE);
  const floor = new THREE.Mesh(floorGeo, pbrMaterial("concrete_floor_worn_001", {
    repeat: [cols / 2, rows / 2], roughness: 1.0, metalness: 1.0, normalScale: 1.35,
    color: 0x8f9095,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── 墙：抹灰墙 + 顶部压条 ──
  const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  const wallMat = pbrMaterial("beige_wall_001", {
    repeat: [1.6, 1.9], roughness: 1.0, metalness: 0.75, normalScale: 1.25,
    color: 0x9b9a96,
  });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  walls.castShadow = true;
  walls.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  wallCells.forEach(([c, r], i) => {
    const p = tileToWorld(c, r, cols, rows);
    m4.makeTranslation(p.x, WALL_H / 2, p.z);
    walls.setMatrixAt(i, m4);
  });
  walls.instanceMatrix.needsUpdate = true;
  scene.add(walls);

  // 墙顶压条（浅色，勾出轮廓，不再是纯立方体）
  const capGeo = new THREE.BoxGeometry(TILE * 1.02, 0.16, TILE * 1.02);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ae, roughness: 0.62, metalness: 0.25 });
  const caps = new THREE.InstancedMesh(capGeo, capMat, wallCells.length);
  wallCells.forEach(([c, r], i) => {
    const p = tileToWorld(c, r, cols, rows);
    m4.makeTranslation(p.x, WALL_H + 0.08, p.z);
    caps.setMatrixAt(i, m4);
  });
  caps.instanceMatrix.needsUpdate = true;
  caps.castShadow = true;
  scene.add(caps);

  // ── 木箱 ──
  const crateGeo = new THREE.BoxGeometry(TILE * 0.86, CRATE_H, TILE * 0.86);
  const crateMat = pbrMaterial("plywood", {
    repeat: [1, 1], roughness: 1.0, metalness: 0.35, normalScale: 1.3,
    color: 0xa08a70,
  });
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, crateCells.length);
  crates.castShadow = true;
  crates.receiveShadow = true;
  crateCells.forEach(([c, r], i) => {
    const p = tileToWorld(c, r, cols, rows);
    m4.makeTranslation(p.x, CRATE_H / 2, p.z);
    crates.setMatrixAt(i, m4);
  });
  crates.instanceMatrix.needsUpdate = true;
  scene.add(crates);

  // 木箱金属包角（细节）
  const edgeGeo = new THREE.BoxGeometry(TILE * 0.9, 0.1, TILE * 0.9);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.45, metalness: 0.85 });
  const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, crateCells.length * 2);
  crateCells.forEach(([c, r], i) => {
    const p = tileToWorld(c, r, cols, rows);
    m4.makeTranslation(p.x, CRATE_H - 0.06, p.z);
    edges.setMatrixAt(i * 2, m4);
    m4.makeTranslation(p.x, 0.06, p.z);
    edges.setMatrixAt(i * 2 + 1, m4);
  });
  edges.instanceMatrix.needsUpdate = true;
  scene.add(edges);

  // ── 场内立柱照明（工业灯）──
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f38, roughness: 0.5, metalness: 0.8,
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  const lampSpots = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
  for (const [lx, lz] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.2, 8), lampMat);
    pole.position.set(lx, 3.1, lz);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.5), lampMat);
    head.position.set(lx, 6.2, lz);
    scene.add(head);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.36), bulbMat);
    bulb.position.set(lx, 6.08, lz);
    scene.add(bulb);
    const pl = new THREE.PointLight(0xffe0a8, 22, 26, 2);
    pl.position.set(lx, 6.0, lz);
    scene.add(pl);
  }

  // ── 碰撞 ──
  const solid = (x, z, radius = 0) => {
    const pad = radius;
    for (const [ox, oz] of [[-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad], [0, 0]]) {
      const wx = x + ox, wz = z + oz;
      const c = Math.floor((wx + halfW) / TILE);
      const r = Math.floor((wz + halfH) / TILE);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
      if (solidGrid[r][c]) return true;
    }
    return false;
  };

  return {
    solid, cols, rows, TILE,
    worldW: cols * TILE, worldH: rows * TILE,
    halfW, halfH, spawns, grid: solidGrid,
    meshes: [floor, walls, crates, caps],
  };
}

function tileToWorld(c, r, cols, rows) {
  return {
    x: (c + 0.5) * TILE - (cols * TILE) / 2,
    z: (r + 0.5) * TILE - (rows * TILE) / 2,
  };
}
