/**
 * 关卡 —— 网格地图 + 程序化几何与贴图
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

export const TILE = 4;          // 每格世界单位
export const WALL_H = 4.6;      // 墙高
export const CRATE_H = 1.7;     // 木箱高

/** 程序化贴图（不依赖外部文件） */
function makeTexture(kind) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");

  if (kind === "wall") {
    g.fillStyle = "#6b7280";
    g.fillRect(0, 0, S, S);
    // 砖块
    const bh = 16, bw = 32;
    for (let y = 0; y < S; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S; x += bw) {
        const v = 0.82 + Math.random() * 0.3;
        g.fillStyle = `rgb(${Math.floor(108 * v)},${Math.floor(116 * v)},${Math.floor(128 * v)})`;
        g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    // 噪点
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.10})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
  } else if (kind === "floor") {
    g.fillStyle = "#3f4652";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? `rgba(255,255,255,${v * 0.05})` : `rgba(0,0,0,${v * 0.14})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    // 地砖缝
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, S, S);
  } else {
    // crate
    g.fillStyle = "#8a5a2b";
    g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.lineWidth = 4;
    g.strokeRect(3, 3, S - 6, S - 6);
    g.beginPath();
    g.moveTo(3, 3); g.lineTo(S - 3, S - 3);
    g.moveTo(S - 3, 3); g.lineTo(3, S - 3);
    g.stroke();
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2, 3);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 搭建关卡
 * @returns {{solid:Function, size:number, spawns:{player:Array,enemy:Array}, meshes:Array}}
 */
export function buildLevel(scene) {
  const rows = MAP.length;
  const cols = MAP[0].length;
  const halfW = (cols * TILE) / 2;
  const halfH = (rows * TILE) / 2;

  // ── 数据 ──
  const solidGrid = [];       // 1 = 实心（含木箱）
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
      else if (ch === "E") { spawns.enemy.push(tileToWorld(c, r, cols, rows)); solid = 0; }
      solidGrid[r][c] = solid;
    }
  }
  if (!spawns.player.length) spawns.player.push(tileToWorld(1, 1, cols, rows));

  // ── 地面 ──
  const floorTex = makeTexture("floor");
  floorTex.repeat.set(cols, rows);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(cols * TILE, rows * TILE),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.96, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── 墙（实例化，一次 draw call）──
  const wallTex = makeTexture("wall");
  wallTex.repeat.set(1.6, 1.6);
  const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, metalness: 0.04 });
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

  // ── 木箱 ──
  const crateTex = makeTexture("crate");
  const crateGeo = new THREE.BoxGeometry(TILE * 0.82, CRATE_H, TILE * 0.82);
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0.05 });
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

  // ── 边界天幕（远处一圈暗色圆柱，避免看到虚空）──
  const sky = new THREE.Mesh(
    new THREE.CylinderGeometry(halfW * 1.5, halfW * 1.5, 60, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x1c2740, side: THREE.BackSide })
  );
  sky.position.y = 20;
  scene.add(sky);

  // ── 碰撞：世界坐标 → 是否实心 ──
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
    solid,
    cols, rows, TILE,
    worldW: cols * TILE,
    worldH: rows * TILE,
    halfW, halfH,
    spawns,
    grid: solidGrid,
    meshes: [floor, walls, crates],
  };
}

function tileToWorld(c, r, cols, rows) {
  return {
    x: (c + 0.5) * TILE - (cols * TILE) / 2,
    z: (r + 0.5) * TILE - (rows * TILE) / 2,
  };
}
