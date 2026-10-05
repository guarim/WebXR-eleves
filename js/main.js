import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/* =====================================================================
   Configuration
   ===================================================================== */
const ASSETS = 'assets/';
const DATA_URL = 'data/contenu.json';

const C = {
  beton: '#cfd0cc',
  platre: '#f2f2ef',
  encre: '#1b2430',
  gris: '#4b5663',
  bleu: '#1f4e8c',
  chene: '#b08d63',
  cheneFonce: '#7d5f3c',
  acier: '#2b3037'
};
const F_TITRE = '"Archivo", "Helvetica Neue", Arial, sans-serif';
const F_TEXTE = '"Newsreader", Georgia, "Times New Roman", serif';

const ROOM = { w: 12, l: 30, h: 4.8 };
const HW = ROOM.w / 2;
const HL = ROOM.l / 2;
const EYE = 1.6;
const PW = 2.8;   // largeur d'un panneau de texte (m)
const PH = 3.3;   // hauteur d'un panneau de texte (m)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* =====================================================================
   Rendu, scène, caméra
   ===================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.beton);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 80);
camera.rotation.order = 'YXZ';
const dolly = new THREE.Group();   // porte la caméra et les manettes (utile en VR)
dolly.add(camera);
scene.add(dolly);

/* =====================================================================
   État
   ===================================================================== */
const stations = [];        // points de vue de la visite
const nav = [];             // entrées du sommaire
const clickables = [];      // objets cliquables (portent userData.station)
let floorMesh = null;
let current = 0;
let videoIndex = -1;

const cam = { x: 0, y: EYE, z: 0, yaw: 0, pitch: 0 };
const look = { yaw: 0, pitch: 0 };
let tween = null;

/* =====================================================================
   Utilitaires canvas / textures
   ===================================================================== */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function wrapLines(g, text, maxW) {
  const out = [];
  String(text).split('\n').forEach((par) => {
    const words = par.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  });
  return out;
}

/* ---------- Matières procédurales : béton banché et parquet chêne ---------- */
function concreteTexture() {
  const S = 1024;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = C.beton;
  g.fillRect(0, 0, S, S);

  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 30 + Math.random() * 120;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, Math.random() < 0.5 ? 'rgba(90,92,88,.07)' : 'rgba(255,255,255,.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  // Joints de banches (panneaux de 1,20 m x 2,40 m) et trous de banche
  const u = S / 2.4;
  g.strokeStyle = 'rgba(60,62,58,.28)';
  g.lineWidth = 2;
  [0, 1.2].forEach((x) => { g.beginPath(); g.moveTo(x * u, 0); g.lineTo(x * u, S); g.stroke(); });
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, 0); g.stroke();
  for (const x of [0.6, 1.8]) {
    for (const y of [0.6, 1.8]) {
      g.fillStyle = 'rgba(50,52,48,.45)';
      g.beginPath(); g.arc(x * u, y * u, 5, 0, Math.PI * 2); g.fill();
    }
  }
  return canvasTexture(c, true);
}

function parquetTexture() {
  const S = 1024;
  const [c, g] = makeCanvas(S, S);
  const rowH = 64;
  const plankL = 512;
  const offsets = [0, 0.5, 0.25, 0.75, 0.1, 0.6, 0.35, 0.85, 0.2, 0.7, 0.45, 0.95, 0.05, 0.55, 0.3, 0.8];
  for (let r = 0; r < S / rowH; r++) {
    const off = offsets[r % offsets.length] * plankL;
    for (let k = -1; k < 3; k++) {
      const x = off + k * plankL;
      const tone = Math.floor((Math.random() - 0.5) * 26);
      g.fillStyle = `rgb(${176 + tone},${141 + tone},${99 + tone})`;
      g.fillRect(x, r * rowH, plankL, rowH);
      g.strokeStyle = 'rgba(90,60,30,.12)';
      g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const yy = r * rowH + 8 + Math.random() * (rowH - 16);
        g.beginPath();
        g.moveTo(x + 4, yy);
        g.bezierCurveTo(x + plankL * 0.3, yy + (Math.random() - 0.5) * 6, x + plankL * 0.6, yy + (Math.random() - 0.5) * 6, x + plankL - 4, yy);
        g.stroke();
      }
      g.strokeStyle = 'rgba(50,32,15,.45)';
      g.lineWidth = 2;
      g.strokeRect(x, r * rowH, plankL, rowH);
    }
  }
  return canvasTexture(c, true);
}

/* ---------- Panneaux de texte ---------- */
function layoutSection(g, section, W, s, draw) {
  const padX = 100;
  const maxW = W - padX * 2;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';

  let fs = Math.round(70 * s);
  g.font = `800 ${fs}px ${F_TITRE}`;
  while (g.measureText(section.titre || '').width > maxW && fs > 30) {
    fs -= 2;
    g.font = `800 ${fs}px ${F_TITRE}`;
  }
  let y = 110 + fs;
  if (draw) { g.fillStyle = C.encre; g.fillText(section.titre || '', padX, y); }
  y += 34;
  if (draw) { g.fillStyle = C.bleu; g.fillRect(padX, y, 90, 8); }
  y += 8 + 54;

  const bodySize = Math.round(36 * s);
  const lh = bodySize * 1.5;
  if (section.texte) {
    g.font = `400 ${bodySize}px ${F_TEXTE}`;
    g.fillStyle = C.encre;
    for (const line of wrapLines(g, section.texte, maxW)) {
      if (draw) g.fillText(line, padX, y);
      y += lh;
    }
    y += lh * 0.4;
  }

  for (const it of section.items || []) {
    const o = typeof it === 'string' ? { detail: it } : it;
    if (o.titre) {
      const ts = Math.round(38 * s);
      g.font = `600 ${ts}px ${F_TITRE}`;
      g.fillStyle = C.encre;
      for (const line of wrapLines(g, o.titre, maxW)) {
        if (draw) g.fillText(line, padX, y);
        y += ts * 1.3;
      }
    }
    if (o.detail) {
      const ds = Math.round(33 * s);
      g.font = `400 ${ds}px ${F_TEXTE}`;
      g.fillStyle = C.gris;
      for (const line of wrapLines(g, o.detail, maxW)) {
        if (draw) g.fillText(line, padX, y);
        y += ds * 1.4;
      }
    }
    y += Math.round(34 * s);
  }
  return y;
}

function drawSection(section, W, H) {
  const [c, g] = makeCanvas(W, H);
  let s = 1;
  while (s > 0.55 && layoutSection(g, section, W, s, false) > H - 90) s -= 0.05;
  g.fillStyle = C.platre;
  g.fillRect(0, 0, W, H);
  g.fillStyle = C.bleu;
  g.fillRect(0, 0, W, 12);
  layoutSection(g, section, W, s, true);
  return canvasTexture(c);
}

function drawPlaque(info) {
  const W = 500;
  const H = 310;
  const [c, g] = makeCanvas(W, H);
  const pad = 34;
  const maxW = W - pad * 2 - 8;
  const run = (s, draw) => {
    const ts = Math.round(30 * s);
    const ds = Math.round(23 * s);
    let y = pad + ts;
    g.font = `700 ${ts}px ${F_TITRE}`;
    g.fillStyle = C.encre;
    for (const l of wrapLines(g, info.titre || '', maxW)) {
      if (draw) g.fillText(l, pad + 8, y);
      y += ts * 1.25;
    }
    y += 6;
    g.font = `400 ${ds}px ${F_TEXTE}`;
    g.fillStyle = C.gris;
    for (const l of wrapLines(g, info.legende || '', maxW)) {
      if (draw) g.fillText(l, pad + 8, y);
      y += ds * 1.4;
    }
    return y;
  };
  let s = 1;
  while (s > 0.55 && run(s, false) > H - pad) s -= 0.05;
  g.fillStyle = C.platre;
  g.fillRect(0, 0, W, H);
  g.fillStyle = C.bleu;
  g.fillRect(0, 0, 8, H);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  run(s, true);
  return canvasTexture(c);
}

function drawTitleBlock(eleve) {
  const W = 2100;
  const H = 900;
  const [c, g] = makeCanvas(W, H);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const x = 60;

  let fs = 200;
  g.font = `800 ${fs}px ${F_TITRE}`;
  while (g.measureText(eleve.nom).width > W - x * 2 && fs > 60) {
    fs -= 4;
    g.font = `800 ${fs}px ${F_TITRE}`;
  }
  let y = 250;
  g.fillStyle = C.encre;
  g.fillText(eleve.nom, x, y);

  y += 50;
  g.fillStyle = C.bleu;
  g.fillRect(x, y, 180, 12);

  y += 130;
  g.font = `italic 400 92px ${F_TEXTE}`;
  g.fillStyle = C.encre;
  g.fillText(eleve.metier, x, y);

  y += 100;
  g.font = `400 54px ${F_TEXTE}`;
  g.fillStyle = C.gris;
  for (const line of wrapLines(g, eleve.accroche || '', 1400)) {
    g.fillText(line, x, y);
    y += 76;
  }
  const t = canvasTexture(c);
  return t;
}

function placeholderCanvas(message) {
  const [c, g] = makeCanvas(1200, 900);
  g.fillStyle = '#c4c5c1';
  g.fillRect(0, 0, 1200, 900);
  g.strokeStyle = 'rgba(27,36,48,.25)';
  g.lineWidth = 3;
  g.setLineDash([18, 14]);
  g.strokeRect(40, 40, 1120, 820);
  g.setLineDash([]);
  g.fillStyle = C.encre;
  g.textAlign = 'center';
  g.font = `700 54px ${F_TITRE}`;
  g.fillText(message, 600, 450);
  g.font = `italic 400 36px ${F_TEXTE}`;
  g.fillStyle = C.gris;
  g.fillText('Placez le fichier dans le dossier assets', 600, 515);
  return c;
}

/* =====================================================================
   Chargement des médias
   ===================================================================== */
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadArtTexture(file) {
  const img = await loadImage(ASSETS + file);
  let source;
  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const m = Math.max(iw, ih);
    if (m > 2048) {
      const k = 2048 / m;
      const [c, g] = makeCanvas(Math.round(iw * k), Math.round(ih * k));
      g.drawImage(img, 0, 0, c.width, c.height);
      source = c;
    } else {
      source = img;
    }
  } else {
    source = placeholderCanvas(`${file} introuvable`);
  }
  const t = new THREE.Texture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

async function loadFonts() {
  const fonts = [
    '800 64px Archivo', '700 64px Archivo', '600 32px Archivo',
    '400 32px Newsreader', 'italic 400 32px Newsreader'
  ];
  const attempt = Promise.all(fonts.map((f) => document.fonts.load(f))).catch(() => {});
  const timeout = new Promise((r) => setTimeout(r, 3500));
  await Promise.race([attempt, timeout]);
}

/* =====================================================================
   Construction de la galerie
   ===================================================================== */
const WALLS = {
  left:  { normal: new THREE.Vector3(1, 0, 0),  rotY: Math.PI / 2 },
  right: { normal: new THREE.Vector3(-1, 0, 0), rotY: -Math.PI / 2 },
  back:  { normal: new THREE.Vector3(0, 0, 1),  rotY: 0 },
  front: { normal: new THREE.Vector3(0, 0, -1), rotY: Math.PI }
};

function wallPoint(wall, along, y) {
  switch (wall) {
    case 'left':  return new THREE.Vector3(-HW, y, along);
    case 'right': return new THREE.Vector3(HW, y, along);
    case 'back':  return new THREE.Vector3(along, y, -HL);
    default:      return new THREE.Vector3(along, y, HL);
  }
}

// Groupe posé sur un mur : x = droite du visiteur, y = haut, z = vers l'intérieur de la salle
function mountGroup(wall, along, y) {
  const g = new THREE.Group();
  g.position.copy(wallPoint(wall, along, y));
  g.rotation.y = WALLS[wall].rotY;
  scene.add(g);
  return g;
}

function addStation(label, wall, along, dist, lookY) {
  const p = wallPoint(wall, along, EYE);
  const n = WALLS[wall].normal;
  stations.push({
    label,
    pos: new THREE.Vector3(p.x + n.x * dist, EYE, p.z + n.z * dist),
    yaw: Math.atan2(n.x, n.z),
    pitch: Math.atan2(lookY - EYE, dist)
  });
  return stations.length - 1;
}

const std = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const spotGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.24, 16).rotateX(Math.PI / 2);
const spotMat = std(C.acier, 0.5);

function addSpot(wall, along) {
  const p = wallPoint(wall, along, ROOM.h - 0.35);
  const n = WALLS[wall].normal;
  const x = p.x + n.x * 1.6;
  const z = p.z + n.z * 1.6;
  const head = new THREE.Mesh(spotGeo, spotMat);
  head.position.set(x, p.y, z);
  head.lookAt(p.x, 2.0, p.z);
  scene.add(head);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), spotMat);
  stem.position.set(x, p.y + 0.175, z);
  scene.add(stem);
}

function buildRoom() {
  const wallTex = concreteTexture();
  const wallMat = (w) => {
    const t = wallTex.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 2.4, ROOM.h / 2.4);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  };

  const addWall = (w, pos, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat(w));
    m.position.set(pos[0], ROOM.h / 2, pos[1]);
    m.rotation.y = rotY;
    scene.add(m);
  };
  addWall(ROOM.l, [-HW, 0], Math.PI / 2);
  addWall(ROOM.l, [HW, 0], -Math.PI / 2);
  addWall(ROOM.w, [0, -HL], 0);
  addWall(ROOM.w, [0, HL], Math.PI);

  const floorTex = parquetTexture();
  floorTex.repeat.set(ROOM.w / 2.4, ROOM.l / 2.4);
  floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.l),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  scene.add(floorMesh);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.l), std('#ecece9', 0.95));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  scene.add(ceiling);

  // Plinthes et « trait de niveau » bleu qui fait le tour de la salle
  const levelMat = new THREE.MeshBasicMaterial({ color: C.bleu });
  [['left', ROOM.l], ['right', ROOM.l], ['back', ROOM.w], ['front', ROOM.w]].forEach(([wall, len]) => {
    const g = mountGroup(wall, 0, 0);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.02), std(C.platre, 0.9));
    plinth.position.set(0, 0.05, 0.01);
    g.add(plinth);
    const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.004), levelMat);
    line.position.set(0, 1.0, 0.003);
    g.add(line);
  });

  // Rails d'éclairage au plafond
  const railMat = std(C.acier, 0.5);
  [-(HW - 1.6), HW - 1.6].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, ROOM.l - 2), railMat);
    rail.position.set(x, ROOM.h - 0.025, 0);
    scene.add(rail);
  });
  const railBack = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w - 2, 0.05, 0.05), railMat);
  railBack.position.set(0, ROOM.h - 0.025, -(HL - 1.6));
  scene.add(railBack);

  // Éclairage
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a76, 2.4));
  [10, 3, -4, -11].forEach((z) => {
    const p = new THREE.PointLight(0xfff4e6, 40, 0, 2);
    p.position.set(0, ROOM.h - 0.4, z);
    scene.add(p);
  });

  // Bancs
  [2.25, -6.75].forEach((z) => {
    const bench = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 2.4), std(C.cheneFonce, 0.6));
    top.position.y = 0.43;
    bench.add(top);
    [-0.9, 0.9].forEach((dz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.06), std(C.acier, 0.6));
      leg.position.set(0, 0.2, dz);
      bench.add(leg);
    });
    bench.position.set(0, 0, z);
    scene.add(bench);
  });
}

function addTitleBlock(eleve) {
  const g = mountGroup('front', 0, 2.2);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3),
    new THREE.MeshBasicMaterial({ map: drawTitleBlock(eleve), transparent: true, toneMapped: false })
  );
  plane.position.z = 0.01;
  g.add(plane);
}

function addPanel(section, wall, along, stationIdx) {
  const g = mountGroup(wall, along, 1.95);
  const body = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, 0.03), std('#e6e6e2', 0.9));
  body.position.z = 0.015;
  g.add(body);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PH),
    new THREE.MeshBasicMaterial({ map: drawSection(section, PW * 500, PH * 500), toneMapped: false })
  );
  face.position.z = 0.031;
  face.userData.station = stationIdx;
  clickables.push(face);
  g.add(face);
  addSpot(wall, along);
}

function addArtwork(tex, info, wall, along, stationIdx) {
  const iw = tex.image.naturalWidth || tex.image.width;
  const ih = tex.image.naturalHeight || tex.image.height;
  const ar = iw / ih;
  const maxW = 2.4;
  const maxH = 1.8;
  let w = maxW;
  let h = w / ar;
  if (h > maxH) { h = maxH; w = h * ar; }

  const mat = 0.18;
  const fr = 0.03;
  const depth = 0.05;
  const outerW = w + 2 * (mat + fr);
  const g = mountGroup(wall, along, 1.9);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(outerW, h + 2 * (mat + fr), depth), std(C.chene, 0.6));
  frame.position.z = depth / 2;
  g.add(frame);

  const passe = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 2 * mat, h + 2 * mat),
    new THREE.MeshBasicMaterial({ color: C.platre, toneMapped: false })
  );
  passe.position.z = depth + 0.001;
  g.add(passe);

  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  pic.position.z = depth + 0.004;
  pic.userData.station = stationIdx;
  clickables.push(pic);
  g.add(pic);

  // Cartel à droite de l'œuvre
  const plaqueBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.012), std('#e6e6e2', 0.9));
  const plaqueFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.62),
    new THREE.MeshBasicMaterial({ map: drawPlaque(info), toneMapped: false })
  );
  const px = outerW / 2 + 0.15 + 0.5;
  const py = 1.55 - 1.9;
  plaqueBody.position.set(px, py, 0.006);
  plaqueFace.position.set(px, py, 0.0125);
  plaqueFace.userData.station = stationIdx;
  clickables.push(plaqueFace);
  g.add(plaqueBody, plaqueFace);

  addSpot(wall, along);
}

/* ---------- Vidéo ---------- */
const video = document.createElement('video');
let videoOk = true;
let userPaused = false;
let playIcon = null;
let lastPlayTry = 0;

function addVideo(info) {
  const file = info.fichier || '1.mp4';
  video.src = ASSETS + file;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  const vw = 5.2;
  const vh = 2.925;
  const g = mountGroup('back', 0, 2.3);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(vw + 0.12, vh + 0.12, 0.08), std('#20252c', 0.5));
  bezel.position.z = 0.04;
  g.add(bezel);

  const vtex = new THREE.VideoTexture(video);
  vtex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: vtex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), screenMat);
  screen.position.z = 0.082;
  screen.userData.station = videoIndex;
  clickables.push(screen);
  g.add(screen);

  video.addEventListener('error', () => {
    videoOk = false;
    screenMat.map = canvasTexture(placeholderCanvas(`${file} introuvable`));
    screenMat.needsUpdate = true;
  });

  // Icône de lecture, visible seulement quand le visiteur met la vidéo en pause
  const [ic, ig] = makeCanvas(256, 256);
  ig.fillStyle = 'rgba(242,242,239,.92)';
  ig.beginPath(); ig.arc(128, 128, 120, 0, Math.PI * 2); ig.fill();
  ig.fillStyle = C.bleu;
  ig.beginPath(); ig.moveTo(100, 78); ig.lineTo(184, 128); ig.lineTo(100, 178); ig.closePath(); ig.fill();
  playIcon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: canvasTexture(ic), transparent: true, toneMapped: false })
  );
  playIcon.position.z = 0.09;
  playIcon.visible = false;
  g.add(playIcon);
}

function updateVideo() {
  if (!videoOk) return;
  const z = renderer.xr.isPresenting ? dolly.position.z : camera.position.z;
  const want = z < -3 && !userPaused;
  const now = performance.now();
  if (want && video.paused && now - lastPlayTry > 1000) {
    lastPlayTry = now;
    video.play().catch(() => {});
  } else if (!want && !video.paused) {
    video.pause();
  }
  if (playIcon) playIcon.visible = userPaused;
}

function toggleVideoPause() {
  userPaused = !userPaused;
}

function toggleSound() {
  video.muted = !video.muted;
  const b = $('#b-son');
  b.textContent = video.muted ? 'Activer le son' : 'Couper le son';
  b.setAttribute('aria-pressed', String(!video.muted));
}

/* =====================================================================
   Navigation
   ===================================================================== */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function applyCamera() {
  camera.position.set(cam.x, cam.y, cam.z);
  camera.rotation.set(cam.pitch + look.pitch, cam.yaw + look.yaw, 0, 'YXZ');
}

function updateTween(dt) {
  if (!tween) return;
  tween.t += dt;
  const k = clamp(tween.t / tween.dur, 0, 1);
  const e = easeInOut(k);
  const { from, to } = tween;
  cam.x = from.x + (to.x - from.x) * e;
  cam.y = from.y + (to.y - from.y) * e;
  cam.z = from.z + (to.z - from.z) * e;
  cam.yaw = from.yaw + (to.yaw - from.yaw) * e;
  cam.pitch = from.pitch + (to.pitch - from.pitch) * e;
  if (k >= 1) tween = null;
}

function headOffset(yaw) {
  return new THREE.Vector3(camera.position.x, 0, camera.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

function xrGoTo(i) {
  const s = stations[i];
  dolly.rotation.y = s.yaw;
  const off = headOffset(s.yaw);
  dolly.position.set(s.pos.x - off.x, 0, s.pos.z - off.z);
}

function goTo(index) {
  const n = stations.length;
  const i = ((index % n) + n) % n;
  current = i;
  updateHud();
  hideHint();

  if (renderer.xr.isPresenting) { xrGoTo(i); return; }

  const s = stations[i];
  const fromYaw = cam.yaw + look.yaw;
  let dy = s.yaw - fromYaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const from = { x: cam.x, y: cam.y, z: cam.z, yaw: fromYaw, pitch: cam.pitch + look.pitch };
  const to = { x: s.pos.x, y: EYE, z: s.pos.z, yaw: fromYaw + dy, pitch: s.pitch };
  look.yaw = 0;
  look.pitch = 0;
  if (reduceMotion) {
    Object.assign(cam, to);
    tween = null;
  } else {
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    tween = { from, to, t: 0, dur: 0.9 + Math.min(dist, 25) * 0.05 };
    Object.assign(cam, from);
  }
}

function activate(i) {
  if (i === videoIndex && current === videoIndex) toggleVideoPause();
  else goTo(i);
}

/* =====================================================================
   Interface (HTML)
   ===================================================================== */
function showMessage(title, text) {
  $('#chargement').classList.add('fini');
  $('#message-titre').textContent = title;
  $('#message-texte').textContent = text;
  $('#message').hidden = false;
}

function hideHint() {
  const a = $('#aide');
  if (a) a.hidden = true;
}

function updateHud() {
  $('#s-label').textContent = stations[current].label;
  $('#s-compteur').textContent = `${current + 1} / ${stations.length}`;
  let active = 0;
  nav.forEach((n, k) => { if (n.index <= current) active = k; });
  document.querySelectorAll('#sommaire button').forEach((b, k) => {
    if (k === active) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}

function buildHud(data) {
  $('#h-nom').textContent = data.eleve.nom;
  $('#h-metier').textContent = data.eleve.metier;
  $('#identite').hidden = false;
  $('#outils').hidden = false;
  $('#bas').hidden = false;
  document.title = `${data.eleve.nom} – Portfolio ${data.eleve.metier}`;

  const box = $('#sommaire');
  nav.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n.label;
    b.addEventListener('click', () => goTo(n.index));
    box.appendChild(b);
  });

  $('#b-prec').addEventListener('click', () => goTo(current - 1));
  $('#b-suiv').addEventListener('click', () => goTo(current + 1));
  $('#b-son').addEventListener('click', toggleSound);

  const dlg = $('#texte');
  $('#b-texte').addEventListener('click', () => { buildTextVersion(data); dlg.showModal(); });
  $('#b-fermer').addEventListener('click', () => dlg.close());

  // Bouton VR (libellés traduits)
  const vrBtn = VRButton.createButton(renderer);
  const T = {
    'ENTER VR': 'Entrer en VR',
    'EXIT VR': 'Quitter la VR',
    'STOP VR': 'Quitter la VR',
    'VR NOT SUPPORTED': 'VR non disponible',
    'VR NOT ALLOWED': 'VR non autorisée',
    'WEBXR NOT AVAILABLE': 'WebXR non disponible'
  };
  const translate = () => { const t = T[vrBtn.textContent]; if (t) vrBtn.textContent = t; };
  new MutationObserver(translate).observe(vrBtn, { childList: true, characterData: true, subtree: true });
  translate();
  $('#vr-slot').appendChild(vrBtn);
}

function buildTextVersion(data) {
  const root = $('#texte-contenu');
  root.textContent = '';
  const add = (tag, text, parent = root) => {
    const el = document.createElement(tag);
    el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const addItems = (items) => {
    const ul = document.createElement('ul');
    (items || []).forEach((it) => {
      const li = document.createElement('li');
      if (typeof it === 'string') {
        li.textContent = it;
      } else {
        if (it.titre) add('strong', it.titre, li);
        if (it.titre && it.detail) li.appendChild(document.createTextNode(' : '));
        if (it.detail) li.appendChild(document.createTextNode(it.detail));
      }
      ul.appendChild(li);
    });
    root.appendChild(ul);
  };
  const addSection = (s) => {
    if (!s) return;
    add('h3', s.titre || '');
    if (s.texte) s.texte.split('\n').filter(Boolean).forEach((p) => add('p', p));
    if (s.items) addItems(s.items);
  };

  add('h3', `${data.eleve.nom} – ${data.eleve.metier}`);
  if (data.eleve.accroche) add('p', data.eleve.accroche);
  ['presentation', 'qualites', 'competences', 'formation'].forEach((k) => addSection(data[k]));
  add('h3', 'Réalisations');
  addItems((data.oeuvres || []).map((o) => ({ titre: o.titre, detail: o.legende })));
  if (data.video) addSection({ titre: data.video.titre, texte: data.video.legende });
  addSection(data.contact);
}

/* =====================================================================
   Interactions : souris, tactile, clavier
   ===================================================================== */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(clientX, clientY) {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(clickables, false)[0];
  return hit ? hit.object.userData.station : undefined;
}

function setupControls() {
  const dom = renderer.domElement;
  let drag = null;

  dom.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      if (drag.moved) {
        look.yaw = clamp(look.yaw + dx * 0.004, -1.6, 1.6);
        look.pitch = clamp(look.pitch + dy * 0.004, -0.6, 0.6);
        dom.style.cursor = 'grabbing';
      }
    } else {
      dom.style.cursor = pick(e.clientX, e.clientY) !== undefined ? 'pointer' : 'grab';
    }
  });
  dom.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      const s = pick(e.clientX, e.clientY);
      if (s !== undefined) activate(s);
    }
    drag = null;
    dom.style.cursor = 'grab';
  });
  dom.addEventListener('pointercancel', () => { drag = null; });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('dialog')) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
        goTo(current + 1); e.preventDefault(); break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        goTo(current - 1); e.preventDefault(); break;
      case 'Home':
        goTo(0); e.preventDefault(); break;
      case 'End':
        goTo(stations.length - 1); e.preventDefault(); break;
      default:
    }
  });

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =====================================================================
   WebXR : manettes, téléportation, clic sur les œuvres
   ===================================================================== */
const tempMatrix = new THREE.Matrix4();
const xrRay = new THREE.Raycaster();
let marker = null;
const controllers = [];

function setupXR() {
  marker = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: C.bleu })
  );
  marker.visible = false;
  scene.add(marker);

  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
      new THREE.LineBasicMaterial({ color: 0x3b82d6 })
    );
    c.add(line);
    c.addEventListener('select', () => onXRSelect(c));
    dolly.add(c);
    controllers.push(c);
  }

  renderer.xr.addEventListener('sessionstart', () => {
    document.body.classList.add('en-vr');
    const s = stations[current];
    dolly.rotation.set(0, s.yaw, 0);
    dolly.position.set(s.pos.x, 0, s.pos.z);
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('en-vr');
    dolly.position.set(0, 0, 0);
    dolly.rotation.set(0, 0, 0);
    marker.visible = false;
    onResize();
  });
}

function aimRay(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  xrRay.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  xrRay.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
}

function onXRSelect(controller) {
  aimRay(controller);
  const hit = xrRay.intersectObjects([...clickables, floorMesh], false)[0];
  if (!hit) return;
  if (hit.object.userData.station !== undefined) {
    activate(hit.object.userData.station);
  } else if (hit.object === floorMesh) {
    teleportTo(hit.point);
  }
}

function teleportTo(p) {
  const x = clamp(p.x, -(HW - 0.7), HW - 0.7);
  const z = clamp(p.z, -(HL - 0.7), HL - 0.7);
  const off = headOffset(dolly.rotation.y);
  dolly.position.set(x - off.x, 0, z - off.z);
}

function updateMarker() {
  marker.visible = false;
  controllers.forEach((c) => {
    aimRay(c);
    const hit = xrRay.intersectObject(floorMesh, false)[0];
    if (hit) {
      marker.position.copy(hit.point).setY(0.01);
      marker.visible = true;
    }
  });
}

/* =====================================================================
   Démarrage
   ===================================================================== */
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (renderer.xr.isPresenting) {
    updateMarker();
  } else {
    updateTween(dt);
    applyCamera();
  }
  updateVideo();
  renderer.render(scene, camera);
}

async function init() {
  let data;
  try {
    const r = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error(err);
    showMessage(
      'Impossible de lire data/contenu.json',
      'Ouvrez le portfolio depuis un serveur web (par exemple avec « python3 -m http.server » puis http://localhost:8000) et non en double-cliquant sur index.html. Vérifiez aussi que le fichier JSON est valide.'
    );
    return;
  }

  data.eleve = Object.assign({ nom: 'Prénom NOM', metier: '', accroche: '' }, data.eleve);

  await loadFonts();
  buildRoom();

  const oeuvres = [];
  for (let i = 0; i < 6; i++) {
    const info = Object.assign(
      { fichier: `${i + 1}.png`, titre: `Réalisation ${i + 1}`, legende: '' },
      (data.oeuvres || [])[i]
    );
    oeuvres.push({ info, tex: await loadArtTexture(info.fichier) });
  }

  const t = (key, def) => (data[key] && data[key].titre) || def;
  const sec = (key, def) => data[key] || { titre: def };

  // Ordre de la visite
  const iAccueil = addStation(data.eleve.nom, 'front', 0, 4.6, 2.1);
  nav.push({ label: 'Accueil', index: iAccueil });
  addTitleBlock(data.eleve);

  const iPres = addStation(t('presentation', 'Présentation'), 'left', 9, 3.6, 1.95);
  nav.push({ label: t('presentation', 'Présentation'), index: iPres });
  addPanel(sec('presentation', 'Présentation'), 'left', 9, iPres);

  const iQual = addStation(t('qualites', 'Qualités'), 'right', 9, 3.6, 1.95);
  nav.push({ label: t('qualites', 'Qualités'), index: iQual });
  addPanel(sec('qualites', 'Qualités'), 'right', 9, iQual);

  const zones = [4.5, 4.5, 0, 0, -4.5, -4.5];
  oeuvres.forEach((o, i) => {
    const wall = i % 2 === 0 ? 'left' : 'right';
    const idx = addStation(o.info.titre, wall, zones[i], 3.4, 1.9);
    if (i === 0) nav.push({ label: 'Réalisations', index: idx });
    addArtwork(o.tex, o.info, wall, zones[i], idx);
  });

  const iComp = addStation(t('competences', 'Compétences'), 'left', -9, 3.6, 1.95);
  nav.push({ label: t('competences', 'Compétences'), index: iComp });
  addPanel(sec('competences', 'Compétences'), 'left', -9, iComp);

  const iForm = addStation(t('formation', 'Formation'), 'right', -9, 3.6, 1.95);
  nav.push({ label: t('formation', 'Formation'), index: iForm });
  addPanel(sec('formation', 'Formation'), 'right', -9, iForm);

  const vid = Object.assign({ titre: 'Vidéo', legende: '' }, data.video);
  videoIndex = addStation(vid.titre, 'back', 0, 4.4, 2.3);
  nav.push({ label: 'Vidéo', index: videoIndex });
  addVideo(vid);
  const iVidTexte = videoIndex;
  addPanel({ titre: vid.titre, texte: vid.legende }, 'back', -4.45, iVidTexte);

  const iContact = addStation(t('contact', 'Contact'), 'back', 4.45, 3.6, 1.95);
  nav.push({ label: t('contact', 'Contact'), index: iContact });
  addPanel(sec('contact', 'Contact'), 'back', 4.45, iContact);

  // Position de départ
  const s0 = stations[0];
  Object.assign(cam, { x: s0.pos.x, y: EYE, z: s0.pos.z, yaw: s0.yaw, pitch: s0.pitch });

  buildHud(data);
  updateHud();
  setupControls();
  setupXR();

  renderer.setAnimationLoop(animate);
  $('#chargement').classList.add('fini');
  setTimeout(() => { $('#chargement').hidden = true; }, 700);
}

init().catch((err) => {
  console.error(err);
  showMessage('La galerie ne peut pas s\'ouvrir', 'Une erreur est survenue au chargement. Ouvrez la console du navigateur pour voir le détail.');
});
