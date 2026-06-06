import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────
// SECTIONS
// ─────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id:'about',      num:'01', title:'Coline Derycke',    tagline:'Développeuse · BTS SIO · Alternance',   cta:'À propos'           },
  { id:'company',    num:'02', title:"Human's Connexion", tagline:'Toulouse · Consulting IT & Infogérance', cta:"L'entreprise"       },
  { id:'chaos',      num:'03', title:'Chaos',             tagline:'Chat communautaire · Full-stack',        cta:'Explorer le projet'  },
  { id:'skills',     num:'04', title:'Compétences',       tagline:'Dev · Infra · Sécurité',                 cta:'Voir le stack'      },
  { id:'experience', num:'05', title:'Expérience',        tagline:"Human's Connexion · CSNA Stormshield",  cta:'Mon parcours'       },
  { id:'school',     num:'06', title:'BTS SIO',           tagline:'Projets & formation',                    cta:'Les projets'        },
  { id:'contact',    num:'07', title:'Contact',           tagline:'Connexion établie.',                     cta:'Me contacter'       },
] as const;

const N_SEC  = SECTIONS.length;
const SEC_VH = 150; // vh par section

// ─────────────────────────────────────────────────────────────────
// GÉNÉRATEURS DE SHAPES
// ─────────────────────────────────────────────────────────────────
type ScrollData = { section: number; progress: number };

// 0 — Silhouette assise de profil (figure facing left, vue depuis +Z)
// Approche squelette : capsule entre chaque paire d'articulations
async function mkHumanoid(n: number): Promise<Float32Array> {
  const OX = 1.35;   // décalage X global → figure à droite de l'écran
  const DY = -1.30;  // descend tout (avatar + bureau + pièce) pour poser les pieds au sol

  // Capsule orientée entre deux points A et B
  const seg = (r: number, ax: number, ay: number, bx: number, by: number, az=0, bz=0): THREE.BufferGeometry => {
    const dx=bx-ax, dy=by-ay, dz=bz-az;
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    const g = new THREE.CapsuleGeometry(r, Math.max(len-2*r, 0.01), 4, 10);
    const from = new THREE.Vector3(0,1,0);
    const to   = new THREE.Vector3(dx,dy,dz).normalize();
    const q    = new THREE.Quaternion().setFromUnitVectors(from, to);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    g.applyMatrix4(new THREE.Matrix4().makeTranslation((ax+bx)/2+OX, (ay+by)/2+DY, (az+bz)/2));
    return g;
  };
  const sph = (r: number, x: number, y: number, z=0): THREE.BufferGeometry => {
    const g = new THREE.SphereGeometry(r, 12, 8);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(x+OX, y+DY, z));
    return g;
  };

  // Articulations — figure assise, de profil, regardant vers la gauche (-X)
  // x négatif = avant (côté écran/clavier), x positif = arrière (dossier)
  // CLÉ : cuisse HORIZONTALE (HIP et KNE à quasi la même hauteur y)
  //        mollet VERTICAL   (ANK directement sous KNE, même x)
  const HEAD  = [-0.15, 1.90, 0.04];   // tête légèrement vers l'avant
  const NECK  = [-0.02, 1.62, 0.02];
  const SHLD  = [ 0.15, 1.46, 0.00];   // épaule / haut du dos
  const CSTF  = [-0.20, 1.38, 0.10];   // poitrine (léger lean avant)
  const MBCK  = [ 0.20, 1.12, 0.00];   // milieu du dos
  const LBCK  = [ 0.28, 0.84, 0.00];   // bas du dos / coccyx (niveau siège)
  const BLLY  = [-0.08, 0.84, 0.10];   // ventre bas
  const HIP   = [ 0.08, 0.80, 0.00];   // hanche
  const KNE   = [-0.56, 0.73, 0.00];   // genou — y≈HIP.y = cuisse horizontale
  const ANK   = [-0.54, 0.04, 0.03];   // cheville — x≈KNE.x = mollet vertical
  const FOOT  = [-0.66, 0.03, 0.03];   // pied (pointe vers l'avant)
  const ELB   = [-0.30, 1.08, 0.12];   // coude
  const WRS   = [-0.84, 0.86, 0.10];   // poignet / main sur clavier

  const parts: THREE.BufferGeometry[] = [
    sph(0.20, HEAD[0], HEAD[1], HEAD[2]),                             // tête
    // Queue de cheval (côté +X = arrière de la tête)
    sph(0.11,  0.17, 1.96, -0.04),                                   // arrière tête (cheveux remontés)
    sph(0.07,  0.24, 1.82, -0.06),                                   // élastique
    seg(0.062, 0.22,1.82, 0.36,1.58, -0.06,-0.04),                  // queue section 1
    seg(0.050, 0.36,1.58, 0.42,1.33, -0.04,-0.02),                  // queue section 2
    sph(0.038, 0.42, 1.26, -0.02),                                   // pointe de la queue
    seg(0.085, NECK[0],NECK[1], HEAD[0],HEAD[1], NECK[2],HEAD[2]),   // cou
    seg(0.105, SHLD[0],SHLD[1], MBCK[0],MBCK[1]),                    // dos haut
    seg(0.095, MBCK[0],MBCK[1], LBCK[0],LBCK[1]),                    // dos bas
    seg(0.090, NECK[0],NECK[1], SHLD[0],SHLD[1], NECK[2],SHLD[2]),   // cou→épaule
    seg(0.110, CSTF[0],CSTF[1], BLLY[0],BLLY[1], CSTF[2],BLLY[2]),  // torse avant
    seg(0.080, SHLD[0],SHLD[1], CSTF[0],CSTF[1], SHLD[2],CSTF[2]),  // épaule→poitrine
    seg(0.075, SHLD[0],SHLD[1], ELB[0],ELB[1],   SHLD[2],ELB[2]),   // bras haut
    seg(0.060, ELB[0],ELB[1],   WRS[0],WRS[1],   ELB[2],WRS[2]),    // avant-bras
    seg(0.130, HIP[0],HIP[1],   KNE[0],KNE[1]),                      // cuisse (horizontale)
    seg(0.088, KNE[0],KNE[1],   ANK[0],ANK[1],   KNE[2],ANK[2]),    // mollet (vertical)
    seg(0.055, ANK[0],ANK[1],   FOOT[0],FOOT[1], ANK[2],FOOT[2]),   // pied
    sph(0.085, ELB[0],ELB[1],ELB[2]),                                // articulation coude
    sph(0.110, KNE[0],KNE[1],KNE[2]),                                // articulation genou
    sph(0.115, HIP[0],HIP[1],HIP[2]),                                // articulation hanche
    // ── PC / Bureau ──────────────────────────────────────────────
    seg(0.028, -1.38,0.86, 0.32,0.86),                               // surface bureau
    seg(0.038, -1.28,1.18, -1.28,1.58),                              // écran bord gauche
    seg(0.038, -0.66,1.18, -0.66,1.58),                              // écran bord droit
    seg(0.038, -1.28,1.58, -0.66,1.58),                              // écran bord haut
    seg(0.038, -1.28,1.18, -0.66,1.18),                              // écran bord bas
    seg(0.026, -0.97,1.18, -0.97,0.90),                              // pied écran
    seg(0.022, -1.10,0.88, -0.84,0.88),                              // socle
    seg(0.020, -0.90,0.87, -0.62,0.87),                              // clavier
    // ── Pièce : grande salle plein écran ────────────────────
    // OX=1.35 → world x = rel+1.35. Bords écran ≈ world ±3.6 à z=0
    // Sol FL=-0.15 (juste sous les pieds à y=0.03), plafond CL=3.20
    seg(0.012,-4.85,-0.40,-4.85,-0.40, 0.0,-4.5), // sol arête gauche (profondeur)
    seg(0.012, 2.20,-0.40, 2.20,-0.40, 0.0,-4.5), // sol arête droite
    seg(0.012,-4.85, 3.80,-4.85, 3.80, 0.0,-4.5), // plafond arête gauche
    seg(0.012, 2.20, 3.80, 2.20, 3.80, 0.0,-4.5), // plafond arête droite
    // Plan avant (z=0)
    seg(0.012,-4.85, 3.80, 2.20, 3.80, 0.0, 0.0), // plafond avant
    seg(0.012,-4.85,-0.40, 2.20,-0.40, 0.0, 0.0), // sol avant
    // Mur du fond (z=-4.5)
    seg(0.012,-4.85,-0.40, 2.20,-0.40,-4.5,-4.5), // sol fond
    seg(0.012,-4.85, 3.80, 2.20, 3.80,-4.5,-4.5), // plafond fond
  ];

  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());

  const tmpMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
  const sampler = new MeshSurfaceSampler(tmpMesh).build();

  const out = new Float32Array(n * 3);
  const v   = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    sampler.sample(v);
    out[i*3]=v.x; out[i*3+1]=v.y; out[i*3+2]=v.z;
  }

  merged.dispose();
  return out;
}

// 1 — Engrenages imbriqués (Human's Connexion) — rotation dans le shader
// Centres et rayons exposés pour le vertex shader
const GEAR_CENTERS: [number,number][] = [[-2.2, 0.0], [1.1, 0.0], [2.65, 1.51]];
const GEAR_OUTER = [2.05, 1.42, 0.88];
const GEAR_TEETH = [14, 10, 7];
// Vitesses angulaires en rad/s (rapports dentés) : G1 CW → G2 CCW → G3 CW
const GEAR_SPEEDS = [0.28, -0.39, 0.56]; // G2 = G1*(14/10), G3 = G2*(10/7)

// Retourne [positions, gearIds] — pas d'état global, compatible HMR
function mkGearsWithIds(n: number): [Float32Array, Float32Array] {
  const p = new Float32Array(n * 3);
  const g = new Float32Array(n); // 0 / 1 / 2 = engrenage d'appartenance
  let idx = 0;
  const RI_RATIO = [0.82, 0.78, 0.70]; // dents plus profondes sur les petits engrenages
  const addGear = (ci:number, pts:number, phase=0) => {
    const [cx,cy]=GEAR_CENTERS[ci], ro=GEAR_OUTER[ci], ri=ro*RI_RATIO[ci], teeth=GEAR_TEETH[ci];
    for (let i=0;i<pts&&idx<n;i++,idx++){
      const a=(i/pts)*Math.PI*2 + phase;
      const inTooth=Math.sin((a/Math.PI/2)*teeth*Math.PI)>0.1;
      const r = inTooth ? ro+(Math.random()-.5)*.06 : ri+(Math.random()-.5)*.08;
      p[idx*3]=cx+Math.cos(a)*r; p[idx*3+1]=cy+Math.sin(a)*r; p[idx*3+2]=(Math.random()-.5)*.28;
      g[idx]=ci;
    }
    // Remplissage intérieur
    const fill=Math.floor(pts*.25);
    for (let i=0;i<fill&&idx<n;i++,idx++){
      const a=Math.random()*Math.PI*2, r=Math.random()*ri*.9;
      p[idx*3]=cx+Math.cos(a)*r; p[idx*3+1]=cy+Math.sin(a)*r; p[idx*3+2]=(Math.random()-.5)*.2;
      g[idx]=ci;
    }
  };
  // Proportionnel aux circonférences — phase offset pour imbrication visuelle au contact
  addGear(0, Math.floor(n*.38));
  addGear(1, Math.floor(n*.26), Math.PI/10); // dents de G1 dans les creux de G0
  while(idx<n) addGear(2, n-idx, Math.PI/7); // dents de G2 dans les creux de G1
  return [p, g];
}

function mkGears(n: number): Float32Array { return mkGearsWithIds(n)[0]; }

// 2 — Attracteur de Lorenz (Chaos)
function mkLorenz(n: number): Float32Array {
  const p = new Float32Array(n*3);
  let x=0.1,y=0,z=0; const dt=0.005,s=10,r=28,b=8/3;
  for (let i=0;i<600;i++){const dx=s*(y-x),dy=x*(r-z)-y,dz=x*y-b*z;x+=dx*dt;y+=dy*dt;z+=dz*dt;}
  for (let i=0;i<n;i++){
    const dx=s*(y-x),dy=x*(r-z)-y,dz=x*y-b*z;x+=dx*dt;y+=dy*dt;z+=dz*dt;
    p[i*3]=x*0.16; p[i*3+1]=(z-25)*0.13; p[i*3+2]=y*0.09-0.5;
  }
  return p;
}

// 3 — Cerveau suspendu + réseau neuronal animé (Compétences)
// BX=0.5, BY=0.0 → centre-droit de l'écran (texte à gauche, cerveau à droite)
// Nœuds inner = ancrés sur le cortex, outer = constellation étendue mais dans l'écran
const BRAIN_NODES: [number,number][] = [
  // 0-4 : inner — surface du cerveau
  [ 0.5,  0.9],[-0.2,  0.5],[ 1.2,  0.5], // 0-2 inner top
  [-0.2, -0.4],[ 1.2, -0.4],              // 3-4 inner bas
  // 5-13 : outer — constellation neuronale
  [-1.4,  2.2],[ 0.5,  3.0],[ 2.8,  2.0], // 5-7 top arc
  [ 3.8,  0.0],[ 2.8, -2.0],[ 0.5, -2.8], // 8-10 right/bot
  [-1.4, -2.0],[-3.2,  0.0],[-2.0,  0.5], // 11-13 left arc
  // 14 : ancre arc-seulement (pas de particule-nœud visible)
  [ 0.5, -0.9],
];
// Connexions [de, vers]
const NEURAL_CONNS: [number,number][] = [
  [0,1],[0,2],[1,3],[2,4],                               // cerveau interne
  [1,5],[0,6],[2,7],[4,8],[3,13],[3,12],                  // cerveau → anneau
  [5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,5],  // anneau extérieur
  [12,13],[13,11],[1,6],[5,13],                           // diagonales
  [3,14],[4,14],[14,10],                                  // inner bas reconnecté + ligne droite vers pointe basse
];


function mkNeuralBrainWithArcT(n: number): [Float32Array, Float32Array] {
  const p    = new Float32Array(n * 3);
  const arcT = new Float32Array(n).fill(-1);
  let idx = 0;
  const put = (x:number, y:number, z:number, at=-1) => {
    if (idx >= n) return;
    p[idx*3]=x; p[idx*3+1]=y; p[idx*3+2]=z; arcT[idx]=at; idx++;
  };
  const jit = (s:number) => (Math.random()-.5)*s;

  const BX = 0.5, BY = 0.0; // Centre-droit, verticalement centré

  // ── A : CORTEX 3D (80%) — ellipsoïde + gyri (budget récupéré des arcs supprimés) ──
  const cortexN = Math.floor(n * 0.80);
  for (let i = 0; i < cortexN; i++) {
    const ph = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;

    // rx plus grand = plus épais/rond, rz réduit = moins allongé → plus esthétique
    const rx = 1.30, ry = 1.00, rz = 1.80;
    let x = Math.sin(ph) * Math.cos(th) * rx;
    let y = Math.sin(ph) * Math.sin(th) * ry;
    let z = Math.cos(ph) * rz;

    // Ajustements anatomiques : creuse le bas-arrière (cervelet), rehausse le frontal
    if (z > 0.5 && y < 0) y *= 0.58;
    if (z < -0.3) y += 0.09;

    // Gyri corticaux : amplitude augmentée → plis plus marqués → densité variable visible
    const freq = 6.5;
    const gyri = Math.sin(x * freq * 1.8) * Math.cos(y * freq) * Math.sin(z * freq * 0.8) * 0.115;

    // Fissure interhémisphérique
    const fissure = Math.abs(x) < 0.07 ? 0.80 : 1.0;

    // 88% coque dense (surface nette), 12% volume résiduel pas trop profond
    const depth = Math.random() < 0.88 ? 1.0 : 0.50 + Math.random() * 0.45;

    put(
      BX + (x + x * gyri) * depth * fissure,
      BY + (y + y * gyri) * depth,
      (z + z * gyri) * depth,
      -0.5  // sentinelle cerveau (≠ -1 étoiles) pour boost shader section 3
    );
  }

  // ── B : CERVELET (3%) — fusionné visuellement au cortex, pas de blob distinct ─
  const cerebN = Math.floor(n * 0.03);
  for (let i = 0; i < cerebN; i++) {
    const ph = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;
    const r = (0.28 + Math.random() * 0.10) * Math.sqrt(Math.random());
    const cGyri = Math.sin(ph * 16.0) * 0.018;

    put(
      BX + Math.sin(ph) * Math.cos(th) * (r + cGyri) * 0.65,
      BY - 0.50 + Math.sin(ph) * Math.sin(th) * (r + cGyri) * 0.60,
      0.75 + Math.cos(ph) * (r + cGyri) * 0.45,
      -0.5
    );
  }

  // ── C : TRONC CÉRÉBRAL (2%) — sous le cervelet, peu de particules pour éviter le blob ─
  const trunkN = Math.floor(n * 0.02);
  for (let i = 0; i < trunkN; i++) {
    const t = i / trunkN;
    put(BX + jit(0.20), BY - 0.88 - t * 0.40, 0.80 + jit(0.14), -0.5); // bleu, démarré plus bas
  }

  // ── D : NŒUDS colorés (constellation) ────────────────────────────
  BRAIN_NODES.forEach(([nx,ny],ni) => {
    if (ni >= 14) return; // node 14 = ancre arc seulement, pas de particule visible
    for (let i = 0; i < 7 && idx < n; i++)
      put(nx + jit(0.11), ny + jit(0.09), jit(0.45), -2 - ni);
  });

  // ── E : (arcs particules supprimés — remplacés par LineSegments géométriques) ──
  while (idx < n) put(BX + jit(1.6), BY + jit(1.0), jit(0.35));
  return [p, arcT];
}

function mkNeuralBrain(n: number): Float32Array {
  const p = new Float32Array(n * 3);
  let idx = 0;
  const put = (x:number, y:number, z:number) => { 
    if(idx < n) { p[idx*3]=x; p[idx*3+1]=y; p[idx*3+2]=z; idx++; } 
  };
  const jit = (s:number) => (Math.random()-.5)*s;

  const BX = 0.3, BY = 1.3; // Centre d'affichage de la scène

  // A ── LE CORTEX (70% des points) : Ellipsoïde asymétrique + Plis corticaux
  const cortexN = Math.floor(n * 0.70);
  for (let i = 0; i < cortexN; i++) {
    const ph = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;

    // Dimensions de base : allongé en X (profil), haut en Y, plus fin en Z (largeur)
    let rx = 1.35;
    let ry = 0.95;
    let rz = 0.80;

    let x = Math.sin(ph) * Math.cos(th) * rx;
    let y = Math.sin(ph) * Math.sin(th) * ry;
    let z = Math.cos(ph) * rz;

    // Déformation anatomique de profil (Avant = -X, Arrière = +X)
    if (x > 0 && y < 0) y *= 0.55; // On creuse le bas arrière pour laisser la place au cervelet
    if (x < 0) y += 0.12;          // On rehausse légèrement le front (lobe frontal)

    // L'EFFET CYBER-PLIS : Ondes de haute fréquence combinées sur les 3 axes
    const freq = 6.5;
    const gyri = Math.sin(x * freq) * Math.cos(y * freq) * Math.sin(z * freq) * 0.075;

    // Fissure interhémisphérique (le sillon central qui sépare le cerveau en deux)
    const fissure = Math.abs(z) < 0.06 ? 0.80 : 1.0;

    // Distribution : 80% en surface (coque lumineuse), 20% en profondeur (volume)
    const depth = Math.random() < 0.80 ? 1.0 : Math.random();

    put(
      BX + (x + x * gyri) * depth,
      BY + (y + y * gyri) * depth,
      (z + z * gyri) * depth * fissure
    );
  }

  // B ── LE CERVELET (15% des points) : La petite masse striée en bas à l'arrière (+X, -Y)
  const cerebN = Math.floor(n * 0.15);
  for (let i = 0; i < cerebN; i++) {
    const ph = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;
    const r = (0.32 + Math.random() * 0.08) * Math.sqrt(Math.random());
    
    // Stries ultra-serrées typiques du cervelet
    const cGyri = Math.sin(ph * 16.0) * 0.025;

    put(
      BX + 0.62 + Math.sin(ph) * Math.cos(th) * (r + cGyri),
      BY - 0.50 + Math.sin(ph) * Math.sin(th) * (r + cGyri) * 0.65,
      Math.cos(ph) * (r + cGyri) * 0.55
    );
  }

  // C ── LE TRONC CÉRÉBRAL (5% des points) : Le câble biologique qui descend
  const trunkN = Math.floor(n * 0.05);
  for (let i = 0; i < trunkN; i++) {
    const t = i / trunkN;
    put(
      BX + 0.12 + jit(0.12 - t * 0.04), 
      BY - 0.45 - t * 0.85, 
      jit(0.12)
    );
  }

  // D ── LA CONSTELLATION DE PROXIMITÉ (Le reste des points)
  while (idx < n) {
    const ph = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;
    const r = 1.35 + Math.random() * 1.10;
    put(
      BX + Math.sin(ph) * Math.cos(th) * r * 1.2,
      BY + Math.sin(ph) * Math.sin(th) * r,
      Math.cos(ph) * r * 0.75
    );
  }

  return p;
}

// 4 — Double hélice (Expérience / ADN du parcours)
function mkHelix(n: number): Float32Array {
  const p = new Float32Array(n*3);
  for (let i=0;i<n;i++){
    const t=(i/n)*Math.PI*10, strand=i%2, phase=strand*Math.PI;
    p[i*3]=Math.cos(t+phase)*2.2; p[i*3+1]=t*0.25-3.9; p[i*3+2]=Math.sin(t+phase)*0.9;
  }
  return p;
}

// 5 — Nœud torique trefoil (BTS — complexité apprise)
function mkTorusKnot(n: number): Float32Array {
  const p = new Float32Array(n*3);
  for (let i=0;i<n;i++){
    const t=(i/n)*Math.PI*2, pq=3, qq=2, r1=2.0, r2=0.75;
    p[i*3]=(r1+r2*Math.cos(qq*t))*Math.cos(pq*t); p[i*3+1]=(r1+r2*Math.cos(qq*t))*Math.sin(pq*t); p[i*3+2]=r2*Math.sin(qq*t)*0.8;
  }
  return p;
}

// 6 — Convergence vers un point (Contact)
function mkConverge(n: number): Float32Array {
  const p = new Float32Array(n*3);
  for (let i=0;i<n;i++){
    const phi=Math.acos(2*Math.random()-1), theta=Math.random()*Math.PI*2, r=0.35+Math.random()*0.2;
    p[i*3]=r*Math.sin(phi)*Math.cos(theta); p[i*3+1]=r*Math.sin(phi)*Math.sin(theta); p[i*3+2]=r*Math.cos(phi);
  }
  return p;
}

// Placeholder sync pour shape 0 (remplacé dès que le GLB est chargé)
function mkHumanoidPlaceholder(n: number): Float32Array {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ph = Math.acos(2*Math.random()-1), th = Math.random()*Math.PI*2;
    const r  = (1.2 + Math.random()*0.4) * Math.sqrt(Math.random());
    p[i*3]   = r*Math.sin(ph)*Math.cos(th)*0.8;
    p[i*3+1] = r*Math.sin(ph)*Math.sin(th)*1.4;
    p[i*3+2] = r*Math.cos(ph)*0.5;
  }
  return p;
}

const SHAPE_MAKERS = [mkHumanoidPlaceholder, mkGears, mkLorenz, mkNeuralBrain, mkHelix, mkTorusKnot, mkConverge];

// ─────────────────────────────────────────────────────────────────
// DENSE FIELD — champ d'étoiles + morphing vers les shapes CP77
// ─────────────────────────────────────────────────────────────────
function DenseField({ scrollRef }: { scrollRef: React.MutableRefObject<ScrollData> }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uMouse:   { value: new THREE.Vector2(-10, -10) },
      uSection: { value: 0 },
      uMorphT:  { value: 0 },
      uForming: { value: 1 },
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2  uMouse;
      uniform float uMorphT;
      uniform float uSection;
      uniform float uForming;
      attribute float aType;
      attribute float aRnd;
      attribute float aGear;
      attribute float aNeural;
      attribute vec3  aTarget;
      varying float vType;
      varying float vFocus;
      varying float vRnd;
      varying float vMorphed;
      varying float vNeural;
      void main() {
        vType = aType; vRnd = aRnd; vNeural = aNeural;
        float stagger = uForming > 0.5 ? aRnd : (1.0 - aRnd);
        float tDel = clamp((uMorphT - stagger*0.22) / (1.0 - stagger*0.22 + 0.001), 0.0, 1.0);
        float tEas = tDel * tDel * (3.0 - 2.0 * tDel);
        vec3  pos  = mix(position, aTarget, tEas);
        vMorphed = tEas;
        float drift = 1.0 - tEas * 0.90;
        pos.z += sin(uTime * 0.20 + aRnd * 6.28) * 0.18 * drift;
        pos.x += cos(uTime * 0.14 + aRnd * 4.10) * 0.09 * drift;
        pos.y += sin(uTime * 0.17 + aRnd * 5.30) * 0.07 * drift;
        // Direction aléatoire fixe par particule — pas de dérive centrifuge depuis l'origine
        float breathe = sin(uTime * 1.6 + aRnd * 6.28) * 0.012 * tEas;
        vec3 bDir = normalize(vec3(sin(aRnd*127.3), cos(aRnd*311.7+1.0), sin(aRnd*253.1)));
        pos += bDir * breathe;
        // Engrenages : rotation section 1, type 1 uniquement — classification par distance
        if (uSection >= 1.0 && uSection < 2.0 && uMorphT > 0.05 && aGear >= 0.0) {
          vec2 gCenter = aGear < 0.5 ? vec2(-2.2,0.0) : aGear < 1.5 ? vec2(1.1,0.0) : vec2(2.65,1.51);
          float gSpeed  = aGear < 0.5 ? 0.28 : aGear < 1.5 ? -0.39 : 0.56;
          float phaseOff = aGear < 0.5 ? -0.337 : aGear < 1.5 ? -0.314 : 0.314;
          float angle = uTime * gSpeed * uMorphT + phaseOff;
          vec2 c = pos.xy - gCenter;
          pos.xy = vec2(c.x*cos(angle)-c.y*sin(angle), c.x*sin(angle)+c.y*cos(angle)) + gCenter;
        }
        // Section 2 — Chaos : rotation Y lente + tourbillon de fond
        if (uSection >= 2.0 && uSection < 3.0 && uMorphT > 0.05) {
          float rotAmt = smoothstep(0.3, 0.8, uMorphT);
          float ra = uTime * 0.07 * rotAmt;
          float px = pos.x * cos(ra) + pos.z * sin(ra);
          pos.z   = -pos.x * sin(ra) + pos.z * cos(ra);
          pos.x   = px;
          // Tourbillon orbital : s'applique surtout aux particules éloignées du centre (fond)
          float bg = smoothstep(2.5, 5.0, length(pos.xy));
          pos.x += cos(uTime*0.038 + aRnd*6.283) * (0.4 + aRnd*0.5) * bg * rotAmt;
          pos.y += sin(uTime*0.031 + aRnd*5.127) * (0.3 + aRnd*0.4) * bg * rotAmt;
        }
        // Section 3 — Cerveau : rotation Y → profil de côté + respiration
        // length(aTarget-position)>0.8 : uniquement les particules avec une vraie cible cerveau
        // (shapeIdx → aTarget ≠ position ; fond diffus → aTarget = position → length≈0 → pas de rotation)
        if (uSection >= 3.0 && uSection < 4.0 && uMorphT > 0.05 && length(aTarget - position) > 0.8) {
          float rotAmt = smoothstep(0.15, 0.85, uMorphT);
          float ry = 0.80 * rotAmt; // ~46° en Y → profil de côté bien visible
          float pxr = pos.x * cos(ry) + pos.z * sin(ry);
          pos.z = -pos.x * sin(ry) + pos.z * cos(ry);
          pos.x = pxr;
          // Respiration douce sur le corps du cerveau (pas les connexions)
          if (aNeural < 0.0) {
            float distC = length(pos.xy - vec2(0.5, 0.0));
            float brainZone = (1.0 - smoothstep(1.2, 2.4, distC)) * uMorphT;
            pos += bDir * sin(uTime * 1.8 + aRnd * 6.28) * 0.018 * brainZone;
          }
        }
        vec4 proj = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        vec2 ndc  = proj.xy / proj.w;
        float d   = distance(ndc, uMouse);
        float push = max(0.0, 1.0 - d / 0.42);
        vFocus = push;
        if (push > 0.0 && aType > 0.5)
          pos.xy += normalize(ndc - uMouse + vec2(0.001)) * push * 0.35;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float base = aType < 0.5 ? 0.005 + aRnd*0.009 : 0.052 + aRnd*0.040;
        float isN3 = smoothstep(2.5,3.0,uSection)*(1.0-smoothstep(3.5,4.0,uSection));
        if (isN3 > 0.01 && aNeural >= 0.0)              base = mix(base, 0.016+aRnd*0.007, isN3); // arc : fin, le pulse fait l'effet
        if (isN3 > 0.01 && aNeural < -1.5)              base = mix(base, 0.095+aRnd*0.055, isN3); // nœud : gros
        if (isN3 > 0.01 && aNeural > -1.0 && aNeural < 0.0) base = mix(base, 0.075+aRnd*0.035, isN3); // cortex : visible
        gl_PointSize = (base + tEas*0.048 + push*0.08) * (220.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSection;
      varying float vType;
      varying float vFocus;
      varying float vRnd;
      varying float vMorphed;
      varying float vNeural;
      vec3 secCol(float s) {
        float x = clamp(s/6.0,0.0,1.0);
        if (x<0.167) return mix(vec3(0.00,0.85,1.00),vec3(0.30,0.55,1.00),x*6.0);
        if (x<0.334) return mix(vec3(0.30,0.55,1.00),vec3(0.55,0.25,0.90),x*6.0-1.0);
        if (x<0.500) return mix(vec3(0.55,0.25,0.90),vec3(1.00,0.22,0.18),x*6.0-2.0);
        if (x<0.667) return mix(vec3(1.00,0.22,0.18),vec3(0.20,0.80,0.85),x*6.0-3.0);
        if (x<0.834) return mix(vec3(0.20,0.80,0.85),vec3(0.35,0.85,1.00),x*6.0-4.0);
        return mix(vec3(0.35,0.85,1.00),vec3(0.90,0.97,1.00),x*6.0-5.0);
      }
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float halo  = smoothstep(0.5, 0.05, d);
        float pulse = 0.5 + 0.5*sin(uTime*(0.8+vRnd*1.5)+vRnd*6.28);
        float twinkNorm  = 0.55 + 0.45*sin(uTime*(1.2+vRnd*2.0)+vRnd*9.0);
        float twinkChaos = 0.15 + 0.85*abs(sin(uTime*(2.5+vRnd*5.0)+vRnd*9.0));
        float isChaos    = smoothstep(1.8,2.2,uSection)*(1.0-smoothstep(2.7,3.1,uSection));
        float twink      = mix(twinkNorm, twinkChaos, isChaos * step(0.55, vRnd));
        vec3 col; float alpha;
        if (vType < 0.5) {
          // Étoiles : froides, minuscules, très discrètes
          col   = mix(vec3(0.40,0.65,1.0), vec3(0.88,0.95,1.0), vRnd);
          alpha = halo * twink * (0.04 + vRnd*0.07);
        } else {
          col = secCol(uSection);
          col = mix(col, vec3(1.0), vMorphed*0.45);
          col = mix(col, vec3(1.0,0.12,0.04), vFocus*vFocus*0.55);
          alpha = halo * pulse * (0.08 + vRnd*0.10 + vFocus*0.68 + vMorphed*0.32);
          // ── Section 3 : réseau neuronal ──────────────────────────
          float isN3 = smoothstep(2.5,3.0,uSection)*(1.0-smoothstep(3.5,4.0,uSection));
          if (isN3 > 0.01) {
            if (vNeural >= 0.0) {
              // Connexion : pulse voyageur
              float connId = floor(vNeural);
              float arcT   = fract(vNeural);
              float speed  = 0.36 + mod(connId, 5.0)*0.06;
              float pPos   = fract(uTime*speed + connId*0.137);
              float dist   = min(abs(arcT-pPos), min(abs(arcT-pPos+1.0),abs(arcT-pPos-1.0)));
              float pBright = exp(-dist*dist*18.0); // traîne lumineuse généreuse
              float cm = mod(connId, 6.0);
              vec3 connCol = cm<0.5 ? vec3(0.0,0.95,1.0) : cm<1.5 ? vec3(0.65,0.30,1.0)
                           : cm<2.5 ? vec3(1.0,0.82,0.0) : cm<3.5 ? vec3(0.15,0.90,0.50)
                           : cm<4.5 ? vec3(1.0,0.28,0.72) : vec3(0.35,0.88,1.0);
              // Fil blanc très fin (câble de donnée), puis pulse coloré par-dessus
              col   = mix(col, vec3(0.88, 0.94, 1.0), isN3 * 0.20);        // base blanche faint
              col   = mix(col, connCol, isN3 * pBright * 0.95);              // éclat coloré
              alpha = mix(alpha, (0.07 + pBright * 1.5) * vMorphed, isN3);
            }
            if (vNeural < -1.5) {
              // Nœud : couleur vive + pulsation
              float nId = -vNeural - 2.0;
              float m   = mod(nId, 6.0);
              vec3 nc = m<0.5 ? vec3(0.0,0.95,1.0) : m<1.5 ? vec3(1.0,0.35,0.75)
                      : m<2.5 ? vec3(1.0,0.85,0.0) : m<3.5 ? vec3(1.0,0.45,0.10)
                      : m<4.5 ? vec3(0.45,1.0,0.4) : vec3(0.75,0.35,1.0);
              float np = 0.55 + 0.45*sin(uTime*(1.8+vRnd*1.5)+nId*1.3);
              col   = mix(col, nc, isN3);
              alpha = mix(alpha, halo*np*(0.55+vMorphed*0.40), isN3);
            }
            if (vNeural > -1.0 && vNeural < 0.0) {
              // Cortex / cervelet / tronc : glow bleu-cyan dense
              col   = mix(col, vec3(0.12, 0.60, 1.0), isN3 * 0.82);
              alpha = mix(alpha, halo * pulse * (0.28 + vMorphed * 0.58), isN3);
            }
          }
        }
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── BRAIN LINES : vraies lignes géométriques qui apparaissent une fois le cerveau formé ──
  const brainLineMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSection: { value: 0 }, uMorphT: { value: 0 } },
    vertexShader: `
      attribute float aLineT;
      attribute float aLineConn;
      uniform float uSection;
      uniform float uMorphT;
      varying float vT;
      varying float vConn;
      void main() {
        vec3 pos = position;
        if (uSection >= 2.5 && uSection < 4.0) {
          float rotAmt = smoothstep(0.15, 0.85, uMorphT);
          float ry = 0.80 * rotAmt;
          float px = pos.x * cos(ry) + pos.z * sin(ry);
          pos.z    = -pos.x * sin(ry) + pos.z * cos(ry);
          pos.x    = px;
        }
        vT    = aLineT;
        vConn = aLineConn;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSection;
      uniform float uMorphT;
      varying float vT;
      varying float vConn;
      void main() {
        float isN3   = smoothstep(2.5, 3.0, uSection) * (1.0 - smoothstep(3.5, 4.0, uSection));
        float visible = smoothstep(0.68, 0.92, uMorphT) * isN3;
        if (visible < 0.001) discard;
        float connId = vConn;
        float speed  = 0.36 + mod(connId, 5.0) * 0.06;
        float pPos   = fract(uTime * speed + connId * 0.137);
        float dist   = min(abs(vT - pPos), min(abs(vT - pPos + 1.0), abs(vT - pPos - 1.0)));
        float pulse  = exp(-dist * dist * 18.0);
        float cm = mod(connId, 6.0);
        vec3 connCol = cm < 0.5 ? vec3(0.0,0.95,1.0)  : cm < 1.5 ? vec3(0.65,0.30,1.0)
                     : cm < 2.5 ? vec3(1.0,0.82,0.0)  : cm < 3.5 ? vec3(0.15,0.90,0.50)
                     : cm < 4.5 ? vec3(1.0,0.28,0.72) : vec3(0.35,0.88,1.0);
        vec3 col   = mix(vec3(0.60, 0.82, 1.0), connCol, pulse * 0.90);
        float alpha = (0.22 + pulse * 1.10) * visible;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  const brainLineGeo = useMemo(() => {
    const SEGS = 40;
    const totalVerts = NEURAL_CONNS.length * SEGS * 2;
    const pos     = new Float32Array(totalVerts * 3);
    const aLineT  = new Float32Array(totalVerts);
    const aLineConn = new Float32Array(totalVerts);
    NEURAL_CONNS.forEach(([ai, bi], ci) => {
      const [ax, ay] = BRAIN_NODES[ai];
      const [bx, by] = BRAIN_NODES[bi];
      for (let s = 0; s < SEGS; s++) {
        const t0 = s / SEGS, t1 = (s + 1) / SEGS;
        const vi = (ci * SEGS + s) * 2;
        pos[vi*3]       = ax + (bx - ax) * t0;
        pos[vi*3+1]     = ay + (by - ay) * t0;
        pos[vi*3+2]     = 0;
        pos[(vi+1)*3]   = ax + (bx - ax) * t1;
        pos[(vi+1)*3+1] = ay + (by - ay) * t1;
        pos[(vi+1)*3+2] = 0;
        aLineT[vi] = t0; aLineT[vi+1] = t1;
        aLineConn[vi] = ci; aLineConn[vi+1] = ci;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLineT',   new THREE.BufferAttribute(aLineT, 1));
    geo.setAttribute('aLineConn',new THREE.BufferAttribute(aLineConn, 1));
    return geo;
  }, []);

  // ── RÉSEAU INTERNE DU CERVEAU (lignes 3D dans l'ellipsoïde) ──────
  const brainInternalLineMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSection: { value: 0 }, uMorphT: { value: 0 } },
    vertexShader: `
      attribute float aLineT;
      uniform float uSection; uniform float uMorphT;
      varying float vT;
      void main() {
        vec3 pos = position;
        if (uSection >= 2.5 && uSection < 4.0) {
          float rotAmt = smoothstep(0.15, 0.85, uMorphT);
          float ry = 0.80 * rotAmt;
          float px = pos.x * cos(ry) + pos.z * sin(ry);
          pos.z    = -pos.x * sin(ry) + pos.z * cos(ry);
          pos.x    = px;
        }
        vT = aLineT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform float uSection; uniform float uMorphT;
      void main() {
        float isN3   = smoothstep(2.5,3.0,uSection)*(1.0-smoothstep(3.5,4.0,uSection));
        float visible = smoothstep(0.68,0.92,uMorphT)*isN3;
        if (visible < 0.001) discard;
        float breathe = 0.80 + 0.20*sin(uTime*0.7);
        gl_FragColor = vec4(0.38, 0.70, 1.0, 0.22*breathe*visible);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // Grille lat/lon sur l'ellipsoïde du cerveau — donne les contours naturels des gyri
  const brainInternalLineGeo = useMemo(() => {
    const BX = 0.5, BY = 0.0;
    const rx = 1.30, ry = 1.00, rz = 1.80;
    const verts: number[] = [];
    const HSEGS = 64; // segments par anneau horizontal
    const VSEGS = 32; // segments par méridien vertical

    // Anneaux de latitude (gyri) : ph fixe, th varie
    for (const ph of [0.30, 0.55, 0.80, 1.05, 1.30, 1.57, 1.82, 2.07, 2.35, 2.65]) {
      const sinPh = Math.sin(ph), cosPhY = Math.cos(ph);
      const y = BY + ry * cosPhY;
      for (let i = 0; i < HSEGS; i++) {
        const th0 = (2*Math.PI*i)/HSEGS, th1 = (2*Math.PI*(i+1))/HSEGS;
        verts.push(
          BX + rx*sinPh*Math.cos(th0), y, rz*sinPh*Math.sin(th0),
          BX + rx*sinPh*Math.cos(th1), y, rz*sinPh*Math.sin(th1),
        );
      }
    }
    // Méridiens (sulci) : th fixe, ph varie de 0 à π
    for (let j = 0; j < 10; j++) {
      const th = (2*Math.PI*j)/10;
      const cosT = Math.cos(th), sinT = Math.sin(th);
      for (let i = 0; i < VSEGS; i++) {
        const ph0 = (Math.PI*i)/VSEGS, ph1 = (Math.PI*(i+1))/VSEGS;
        verts.push(
          BX + rx*Math.sin(ph0)*cosT, BY + ry*Math.cos(ph0), rz*Math.sin(ph0)*sinT,
          BX + rx*Math.sin(ph1)*cosT, BY + ry*Math.cos(ph1), rz*Math.sin(ph1)*sinT,
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    return geo;
  }, []);

  // ── ÉTOILES AUX NŒUDS (outer constellation + internes) ──────────
  const brainNodeDotsMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSection: { value: 0 }, uMorphT: { value: 0 } },
    vertexShader: `
      attribute float aNodeId;
      uniform float uSection; uniform float uMorphT; uniform float uTime;
      varying float vNodeId;
      void main() {
        vec3 pos = position;
        if (uSection >= 2.5 && uSection < 4.0) {
          float rotAmt = smoothstep(0.15, 0.85, uMorphT);
          float ry = 0.80 * rotAmt;
          float px = pos.x * cos(ry) + pos.z * sin(ry);
          pos.z    = -pos.x * sin(ry) + pos.z * cos(ry);
          pos.x    = px;
        }
        vNodeId = aNodeId;
        float isN3   = smoothstep(2.5,3.0,uSection)*(1.0-smoothstep(3.5,4.0,uSection));
        float visible = smoothstep(0.68,0.92,uMorphT)*isN3;
        gl_PointSize = 6.0 * visible;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform float uSection; uniform float uMorphT;
      varying float vNodeId;
      void main() {
        float isN3   = smoothstep(2.5,3.0,uSection)*(1.0-smoothstep(3.5,4.0,uSection));
        float visible = smoothstep(0.68,0.92,uMorphT)*isN3;
        if (visible < 0.001) discard;
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float core = 1.0 - smoothstep(0.0, 0.22, d);
        float halo = 1.0 - smoothstep(0.22, 0.50, d);
        float pulse = 0.70 + 0.30 * sin(uTime*2.2 + vNodeId*1.618);
        float cm = mod(vNodeId, 6.0);
        vec3 col = cm<0.5 ? vec3(0.0,0.95,1.0) : cm<1.5 ? vec3(0.65,0.30,1.0)
                 : cm<2.5 ? vec3(1.0,0.82,0.0)  : cm<3.5 ? vec3(0.15,0.90,0.50)
                 : cm<4.5 ? vec3(1.0,0.28,0.72)  : vec3(0.35,0.88,1.0);
        col = mix(col, vec3(1.0), core * 0.6);
        gl_FragColor = vec4(col, (core*0.95+halo*0.45)*pulse*visible);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  const brainNodeDotsGeo = useMemo(() => {
    const all: [number,number,number,number][] = [
      ...BRAIN_NODES.map(([x,y],i) => [x,y,0,i] as [number,number,number,number]),
    ];
    const pos = new Float32Array(all.length * 3);
    const aNodeId = new Float32Array(all.length);
    all.forEach(([x,y,z,id],i) => { pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; aNodeId[i]=id; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aNodeId',  new THREE.BufferAttribute(aNodeId, 1));
    return geo;
  }, []);

  const { positions, types, rnds, allTargets, shapeIdx, gpuBuf, gearIds, neuralBuf } = useMemo(() => {
    const N       = 100_000;
    const N_SHAPE = 9_000;
    const pos = new Float32Array(N*3);
    const typ = new Float32Array(N);
    const rnd = new Float32Array(N);

    // Champ d'étoiles uniforme — plus de gaussienne, plus de type 2 rouge
    for (let i=0;i<N;i++){
      if (Math.random() < 0.82) {
        // Étoiles : distribution uniforme large sur tout le viewport
        pos[i*3]=(Math.random()-.5)*22; pos[i*3+1]=(Math.random()-.5)*14; pos[i*3+2]=(Math.random()-.5)*10-1;
        typ[i]=0;
      } else {
        // Nœuds réseau (certains formeront les shapes CP77)
        pos[i*3]=(Math.random()-.5)*18; pos[i*3+1]=(Math.random()-.5)*11; pos[i*3+2]=(Math.random()-.5)*7;
        typ[i]=1;
      }
      rnd[i]=Math.random();
    }

    const shapeIdx: number[] = [];
    for (let i=0;i<N&&shapeIdx.length<N_SHAPE;i++) if (typ[i]===1) shapeIdx.push(i);

    // Sections 1 & 3 gérées en amont (patterns avec données extra)
    const [gearShapePos,  gearShapeIds] = mkGearsWithIds(shapeIdx.length);
    const [brainShapePos, brainArcTs  ] = mkNeuralBrainWithArcT(shapeIdx.length);

    const targets = SHAPE_MAKERS.map((maker, si) => {
      const tgt = new Float32Array(N*3);
      tgt.set(pos);
      const shapePos = si === 1 ? gearShapePos : si === 3 ? brainShapePos : maker(shapeIdx.length);
      shapeIdx.forEach((pIdx,i) => { tgt[pIdx*3]=shapePos[i*3]; tgt[pIdx*3+1]=shapePos[i*3+1]; tgt[pIdx*3+2]=shapePos[i*3+2]; });
      return tgt;
    });

    const gearIds = new Float32Array(N).fill(-1);
    shapeIdx.forEach((pIdx, si) => { gearIds[pIdx] = gearShapeIds[si]; });

    const neuralBuf = new Float32Array(N).fill(-1);
    shapeIdx.forEach((pIdx, si) => { neuralBuf[pIdx] = brainArcTs[si]; });

    const gpuBuf = new Float32Array(N*3);
    gpuBuf.set(targets[0]);

    return { positions:pos, types:typ, rnds:rnd, allTargets:targets, shapeIdx, gpuBuf, gearIds, neuralBuf };
  }, []);

  const prevSecRef  = useRef(-1);
  const prevMorphT  = useRef(0);
  const geoRef      = useRef<THREE.BufferGeometry>(null);
  // pointer r3f démarre à (0,0) = centre écran → repousse les particules en anneau avant tout mouvement
  const mouseNDCRef = useRef(new THREE.Vector2(-10, -10));
  useEffect(() => {
    const h = (e: MouseEvent) => mouseNDCRef.current.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  // Construit la vraie silhouette (async mais effectivement synchrone) et met à jour allTargets[0] en place
  useEffect(() => {
    mkHumanoid(shapeIdx.length).then(shapePos => {
      // Mutation en place de allTargets[0] (pas de remplacement de référence)
      const tgt = allTargets[0];
      tgt.set(positions);
      shapeIdx.forEach((pIdx, si) => {
        tgt[pIdx*3]=shapePos[si*3]; tgt[pIdx*3+1]=shapePos[si*3+1]; tgt[pIdx*3+2]=shapePos[si*3+2];
      });
      // Propager dans gpuBuf si la section 0 est active
      if (scrollRef.current.section === 0 && geoRef.current) {
        gpuBuf.set(tgt);
        const attr = geoRef.current.getAttribute('aTarget') as THREE.BufferAttribute | undefined;
        if (attr) attr.needsUpdate = true;
      }
    }).catch(e => console.error('Humanoid build failed:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(({ clock }) => {
    const { section, progress:sp } = scrollRef.current;

    // Swap : copie allTargets[section] → gpuBuf (source et dest toujours distincts)
    if (section !== prevSecRef.current) {
      prevSecRef.current = section;
      const attr = geoRef.current?.getAttribute('aTarget') as THREE.BufferAttribute | undefined;
      if (attr) { gpuBuf.set(allTargets[section]); attr.needsUpdate = true; }
    }

    const morphT = sp < 0.35 ? sp/0.35 : sp > 0.65 ? 1-(sp-0.65)/0.35 : 1.0;
    const forming = morphT >= prevMorphT.current - 0.0005 ? 1.0 : 0.0;
    prevMorphT.current = morphT;

    mat.uniforms.uTime.value    = clock.getElapsedTime();
    mat.uniforms.uMouse.value.copy(mouseNDCRef.current);
    mat.uniforms.uSection.value = section + sp;
    mat.uniforms.uMorphT.value  = morphT;
    mat.uniforms.uForming.value = forming;
    brainLineMat.uniforms.uTime.value    = mat.uniforms.uTime.value;
    brainLineMat.uniforms.uSection.value = mat.uniforms.uSection.value;
    brainLineMat.uniforms.uMorphT.value  = mat.uniforms.uMorphT.value;
    brainInternalLineMat.uniforms.uTime.value    = mat.uniforms.uTime.value;
    brainInternalLineMat.uniforms.uSection.value = mat.uniforms.uSection.value;
    brainInternalLineMat.uniforms.uMorphT.value  = mat.uniforms.uMorphT.value;
    brainNodeDotsMat.uniforms.uTime.value    = mat.uniforms.uTime.value;
    brainNodeDotsMat.uniforms.uSection.value = mat.uniforms.uSection.value;
    brainNodeDotsMat.uniforms.uMorphT.value  = mat.uniforms.uMorphT.value;
  });

  return (
    <>
      <points>
        <bufferGeometry ref={geoRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aType"    args={[types,     1]} />
          <bufferAttribute attach="attributes-aRnd"     args={[rnds,      1]} />
          <bufferAttribute attach="attributes-aGear"    args={[gearIds,   1]} />
          <bufferAttribute attach="attributes-aNeural"  args={[neuralBuf, 1]} />
          <bufferAttribute attach="attributes-aTarget"  args={[gpuBuf,    3]} />
        </bufferGeometry>
        <primitive object={mat} />
      </points>
      <lineSegments args={[brainLineGeo, brainLineMat]} />
      <lineSegments args={[brainInternalLineGeo, brainInternalLineMat]} />
      <points args={[brainNodeDotsGeo, brainNodeDotsMat]} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────────
function Corner({ p }: { p: 'tl'|'tr'|'bl'|'br' }) {
  const s: CSSProperties = { position:'absolute', width:24, height:24, borderColor:'rgba(0,185,255,0.28)', borderStyle:'solid', borderTopWidth:0, borderRightWidth:0, borderBottomWidth:0, borderLeftWidth:0 };
  if (p==='tl') { s.top=20; s.left=20; s.borderTopWidth=1; s.borderLeftWidth=1; }
  if (p==='tr') { s.top=20; s.right=20; s.borderTopWidth=1; s.borderRightWidth=1; }
  if (p==='bl') { s.bottom=20; s.left=20; s.borderBottomWidth=1; s.borderLeftWidth=1; }
  if (p==='br') { s.bottom=20; s.right=20; s.borderBottomWidth=1; s.borderRightWidth=1; }
  return <div style={s} />;
}

function sn(seed: number) { return Math.floor(Math.abs(Math.sin(seed * 127.3 + 311.7) * 43758.5453 % 1) * 100); }

function SideNums({ side, sec }: { side:'left'|'right'; sec:number }) {
  const nums = Array.from({length:5}, (_,j) => `${sn(sec*31+j*7+(side==='r'?100:0))}`);
  return (
    <div style={{ position:'absolute', [side]:18, top:'50%', transform:'translateY(-50%)', display:'flex', flexDirection:'column', gap:'2.5rem', pointerEvents:'none' }}>
      {nums.map((n,i) => <span key={i} style={{ fontFamily:'monospace', fontSize:'0.6rem', color:'rgba(0,185,255,0.18)' }}>{n}</span>)}
    </div>
  );
}

function Timeline({ active, total }: { active:number; total:number }) {
  return (
    <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'0 28px 14px', pointerEvents:'none' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
        {SECTIONS.map((s,i) => (
          <span key={s.id} style={{ fontFamily:'monospace', fontSize:'0.5rem', letterSpacing:'0.3em', textTransform:'uppercase', color: i===active ? 'rgba(0,185,255,0.85)' : 'rgba(0,140,255,0.22)', transition:'color 0.4s' }}>
            {s.title.split(' ')[0]}
          </span>
        ))}
      </div>
      <div style={{ height:1, background:'rgba(0,60,140,0.28)', position:'relative' }}>
        <div style={{ position:'absolute', top:0, left:0, height:1, width:`${total*100}%`, background:'rgba(0,185,255,0.4)', transition:'width 0.08s linear' }} />
        {SECTIONS.map((_,i) => (
          <div key={i} style={{ position:'absolute', top:'50%', left:`${(i/(N_SEC-1))*100}%`, transform:'translate(-50%,-50%)', width: i===active?7:5, height: i===active?7:5, borderRadius:'50%', background: i<=active ? 'rgba(0,185,255,0.8)' : 'rgba(0,60,140,0.4)', boxShadow: i===active?'0 0 8px rgba(0,185,255,0.8)':'none', transition:'all 0.3s' }} />
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
        <span style={{ fontFamily:'monospace', fontSize:'0.5rem', color:'rgba(0,140,255,0.28)', letterSpacing:'0.4em' }}>NODE {String(active+1).padStart(2,'0')} / {String(N_SEC).padStart(2,'0')}</span>
        <span style={{ fontFamily:'monospace', fontSize:'0.5rem', color:'rgba(0,140,255,0.28)', letterSpacing:'0.35em' }}>↓ SCROLL</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SECTION CONTENT — piloté par scroll
// ─────────────────────────────────────────────────────────────────
function SectionText({ section, sp, onOpen }: {
  section: typeof SECTIONS[number];
  sp: number;
  onOpen: () => void;
}) {
  const fi  = Math.min(1, sp / 0.16);
  const fo  = Math.min(1, Math.max(0, (1 - sp) / 0.16));
  const op  = Math.min(fi, fo);
  const ty  = (1 - op) * 24;
  return (
    <div style={{ position:'absolute', left:'clamp(28px,6vw,80px)', top:'50%', transform:`translateY(calc(-50% + ${ty}px))`, opacity:op, maxWidth:'44vw', minWidth:260, pointerEvents: op>0.3 ? 'auto' : 'none' }}>
      <p style={{ fontFamily:'monospace', fontSize:'0.58rem', letterSpacing:'0.7em', color:'rgba(0,185,255,0.38)', marginBottom:'0.5rem', textTransform:'uppercase' }}>
        {section.num} ——
      </p>
      <h2 style={{ fontSize:'clamp(2rem,5vw,4rem)', fontWeight:700, letterSpacing:'-0.03em', color:'#ddeeff', lineHeight:1.05, marginBottom:'0.7rem', textShadow:'0 0 60px rgba(0,140,255,0.22)' }}>
        {section.title}
      </h2>
      <p style={{ fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.38em', color:'rgba(0,185,255,0.52)', marginBottom:'2rem', textTransform:'uppercase' }}>
        {section.tagline}
      </p>
      <button onClick={onOpen} style={{ fontFamily:'monospace', fontSize:'0.62rem', letterSpacing:'0.35em', textTransform:'uppercase', padding:'0.55rem 1.25rem', cursor:'pointer', color:'rgba(0,185,255,0.85)', background:'rgba(0,8,22,0.7)', backdropFilter:'blur(8px)', border:'1px solid rgba(0,140,255,0.25)', transition:'all 0.25s' }}
        onMouseEnter={e => Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.95)',borderColor:'rgba(255,30,60,0.45)',background:'rgba(22,0,8,0.7)'})}
        onMouseLeave={e => Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.85)',borderColor:'rgba(0,140,255,0.25)',background:'rgba(0,8,22,0.7)'})}>
        → {section.cta}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PANELS — contenu détaillé
// ─────────────────────────────────────────────────────────────────
const mono: CSSProperties = { fontFamily:'monospace' };
const tagStyle: CSSProperties = { ...mono, fontSize:'0.62rem', padding:'0.22rem 0.6rem', border:'1px solid rgba(0,140,255,0.2)', color:'rgba(0,185,255,0.8)', display:'inline-block', marginRight:'0.38rem', marginBottom:'0.38rem' };
const subLabel: CSSProperties = { ...mono, fontSize:'0.58rem', letterSpacing:'0.6em', color:'rgba(0,185,255,0.38)', marginBottom:'0.7rem', textTransform:'uppercase' };
const body: CSSProperties = { color:'rgba(200,220,255,0.7)', lineHeight:1.78, fontSize:'0.93rem' };

function PAbout()      { return <><p style={{...body,marginBottom:'1.5rem'}}>J'aime l'idée de bâtir des choses à partir de rien.

Pour moi, le code, l'infrastructure et la sécurité ne sont pas des cases étanches, c'est un seul et même terrain de jeu. J'adore concevoir des projets fullstack de la première à la dernière ligne de code, mais je trouve ça encore plus excitant de configurer le serveur Proxmox qui les héberge, de sécuriser le tunnel Tailscale qui les transporte et de surveiller mes conteneurs à distance.

Mon parcours a commencé dans les lettres, à décortiquer la syntaxe et les structures des textes. Aujourd'hui, j'applique exactement la même curiosité et la même exigence à la logique binaire. En reconversion et actuellement en alternance, je passe mes journées (et pas mal de mes nuits) à apprendre, bidouiller et consolider mes compétences, avec une seule obsession : comprendre l'ensemble du système.</p><div>{['Node.js','React','Three.js','HTML/CSS/JS','Tailwind','Linux','Docker','Proxmox'].map(s=><span key={s} style={tagStyle}>{s}</span>)}</div></>; }
function PCompany()    {
  const t=['Gestion de parcs & Active Directory','Cloud Microsoft 365','Sécurité infrastructure, conformité RGPD','Stockage, sauvegarde, monitoring','Mises à jour serveurs, support N2/N3'];
  return <><p style={{...body,marginBottom:'1.5rem'}}>PME toulousaine — consulting IT, progiciels, développement web & logiciel, solutions d'infrastructure réseau sur mesure.</p><p style={{...subLabel,marginBottom:'1rem'}}>Mon rôle — Technicienne systèmes & réseaux</p>{t.map(x=><div key={x} style={{display:'flex',gap:'0.8rem',marginBottom:'0.6rem',color:'rgba(200,220,255,0.65)',fontSize:'0.9rem'}}><span style={{color:'rgba(0,185,255,0.4)',flexShrink:0}}>▸</span>{x}</div>)}</>;
}
function PChaos()      {
  const s1=['Node.js','HTML/CSS/JS','WebRTC','PostgreSQL','Docker','Proxmox','Nginx','Double Ratchet','OAuth Google'];
  return <><p style={{...body,marginBottom:'1.5rem'}}>Construit de bout en bout — infra Proxmox (2 LXC prod/dev), Docker Compose (Postgres + Nginx), jusqu'au frontend. E2EE Double Ratchet, WebRTC avec IA suppresseur de bruit, modération, XSS/SQLi.</p><p style={subLabel}>Stack Chaos</p><div style={{marginBottom:'1.5rem'}}>{s1.map(s=><span key={s} style={{...tagStyle,borderColor:'rgba(255,60,80,0.2)',color:'rgba(255,130,145,0.85)'}}>{s}</span>)}</div><p style={subLabel}>Talos — supervision & admin</p><div>{['React','Tailwind','Node.js'].map(s=><span key={s} style={tagStyle}>{s}</span>)}</div></>;
}
function PSkills()     {
  const cols=[{l:'Développement',s:['Node.js','React','HTML/CSS/JS','Tailwind','WebRTC','Three.js','SQL','REST API','Git']},{l:'Infra & DevOps',s:['Proxmox','Docker','Linux','Windows Server','Active Directory','Cloud Microsoft','Nginx','Bash']},{l:'Sécurité',s:['Stormshield CSNA ★','Double Ratchet E2E','XSS / SQLi','RGPD','Hash & chiffrement','Pare-feux réseau']}];
  return <div style={{display:'grid',gap:'1.5rem'}}>{cols.map(({l,s})=><div key={l}><p style={subLabel}>{l}</p><div>{s.map(x=><span key={x} style={tagStyle}>{x}</span>)}</div></div>)}</div>;
}
function PExperience() {
  return <><div style={{marginBottom:'2rem'}}><p style={{...mono,fontSize:'0.58rem',color:'rgba(0,185,255,0.32)',letterSpacing:'0.5em',marginBottom:'0.3rem',textTransform:'uppercase'}}>2024 — EN COURS</p><p style={{fontWeight:600,color:'#ddeeff',marginBottom:'0.2rem'}}>Human's Connexion</p><p style={{...mono,fontSize:'0.65rem',color:'rgba(0,185,255,0.5)',marginBottom:'0.6rem'}}>Technicienne systèmes & réseaux · Alternance BTS SIO</p><p style={body}>Infogérance, AD, cloud Microsoft, sécurité infrastructure, gestion de parcs.</p></div><div><p style={{...mono,fontSize:'0.58rem',color:'rgba(255,80,100,0.38)',letterSpacing:'0.5em',marginBottom:'0.3rem',textTransform:'uppercase'}}>2024</p><p style={{fontWeight:600,color:'#ddeeff',marginBottom:'0.2rem'}}>Stormshield CSNA</p><p style={{...mono,fontSize:'0.65rem',color:'rgba(255,80,100,0.52)',marginBottom:'0.6rem'}}>Certified Stormshield Network Administrator</p><p style={body}>Configuration, sécurisation et supervision de pare-feux Stormshield.</p></div></>;
}
function PSchool()     {
  return <div style={{display:'grid',gap:'1.25rem'}}>{[1,2,3].map(n=><div key={n} style={{padding:'1.25rem',border:'1px solid rgba(0,140,255,0.1)',background:'rgba(0,15,40,0.5)'}}><p style={{fontWeight:600,color:'#ddeeff',marginBottom:'0.5rem'}}>Projet BTS {n}</p><p style={{...body,color:'rgba(200,220,255,0.55)',fontSize:'0.85rem'}}>[Description du projet, contexte, ce qui a été développé.]</p></div>)}</div>;
}
function PContact()    {
  const l=[{h:'mailto:coline.derycke@gmail.com',t:'coline.derycke@gmail.com'},{h:'#',t:'GitHub'},{h:'#',t:'LinkedIn'}];
  return <><p style={{...body,marginBottom:'2rem'}}>[Message d'accroche — disponibilité, poste recherché.]</p>{l.map(({h,t})=><div key={t} style={{marginBottom:'0.8rem'}}><a href={h} style={{...mono,fontSize:'0.68rem',letterSpacing:'0.3em',color:'rgba(0,185,255,0.75)',textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.color='rgba(255,50,80,0.9)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(0,185,255,0.75)'}>▸ {t.toUpperCase()}</a></div>)}</>;
}

const PANELS = [PAbout, PCompany, PChaos, PSkills, PExperience, PSchool, PContact];

// ─────────────────────────────────────────────────────────────────
// DETAIL PANEL — slide depuis la droite
// ─────────────────────────────────────────────────────────────────
function DetailPanel({ secIdx, open, onClose }: { secIdx:number; open:boolean; onClose:()=>void }) {
  const s = SECTIONS[secIdx];
  const PC = PANELS[secIdx];
  
  // Couleurs dynamiques selon la section pour une harmonie parfaite
  const colors = [
    'rgba(0,185,255,0.85)',  // Cyan about
    'rgba(0,140,255,0.85)',  // Bleu company
    'rgba(140,60,255,0.85)',  // Violet chaos
    'rgba(255,50,80,0.85)',   // Rouge skills
    'rgba(255,110,40,0.85)',  // Orange exp
    'rgba(0,200,180,0.85)',   // Teal school
    '#ddeeff'                 // Blanc contact
  ];
  const activeColor = colors[secIdx] || 'rgba(0,185,255,0.85)';

  return (
    <>
      {/* Overlay de fond assombri */}
      {open && (
        <div 
          onClick={onClose} 
          style={{ 
            position:'fixed', inset:0, zIndex:40, 
            background:'rgba(0,1,5,0.45)', backdropFilter:'blur(4px)',
            transition: 'opacity 0.4s ease'
          }} 
        />
      )}
      
      {/* Le Panneau Glissant */}
      <div style={{
        position:'fixed', top:0, right:0, height:'100vh',
        width:'min(52vw,680px)',
        
        // Esthétique Cyber : Fond ultra sombre + Scanlines subtiles en CSS
        background:`
          linear-gradient(rgba(0, 4, 16, 0.96), rgba(0, 4, 16, 0.96)),
          linear-gradient(rgba(0,185,255,0.03) 50%, rgba(0,0,0,0) 50%)
        `,
        backgroundSize: '100% 100%, 100% 4px', // Crée l'effet lignes CRT de terminal
        backdropFilter:'blur(24px)',
        
        // Bordure gauche lumineuse et réactive à la section
        borderLeft:`2px solid ${activeColor}`,
        boxShadow: open ? `-15px 0 45px rgba(0, 8, 32, 0.85), inset 1px 0 10px ${activeColor}22` : 'none',
        
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex:50, overflowY:'auto',
        padding:'5.5rem 3rem 4rem',
      }}>
        
        {/* Intégration des cornières HUD à l'intérieur du panneau pour habiller les angles */}
        <div style={{ position:'absolute', top:25, left:25, width:14, height:14, borderTop:`1px solid ${activeColor}44`, borderLeft:`1px solid ${activeColor}44` }} />
        <div style={{ position:'absolute', bottom:25, left:25, width:14, height:14, borderBottom:`1px solid ${activeColor}44`, borderLeft:`1px solid ${activeColor}44` }} />
        <div style={{ position:'absolute', bottom:25, right:25, width:14, height:14, borderBottom:`1px solid ${activeColor}44`, borderRight:`1px solid ${activeColor}44` }} />

        {/* Bouton Fermer façon Terminal d'urgence */}
        <button 
          onClick={onClose} 
          style={{ 
            position: 'absolute', 
            top: 25, 
            right: '3rem',
            background: 'rgba(0,12,32,0.6)', 
            border: `1px solid ${activeColor}44`, 
            color: activeColor, 
            ...mono, 
            fontSize: '0.58rem', 
            letterSpacing: '0.35em', 
            padding: '6px 14px', 
            cursor: 'pointer', 
            transition: 'all 0.2s ease-in-out',
            boxShadow: `0 0 10px ${activeColor}11`
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,30,60,0.15)';
            e.currentTarget.style.borderColor = 'rgba(255,50,80,0.85)';
            e.currentTarget.style.color = '#ff3250';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,12,32,0.6)';
            e.currentTarget.style.borderColor = `${activeColor}44`;
            e.currentTarget.style.color = activeColor;
          }}
        >
          ⏱ ABORT_SESSION // ✕
        </button>

        {/* En-tête de section style data-stream */}
        <p style={{ ...mono, fontSize:'0.58rem', letterSpacing:'0.7em', color:`${activeColor}66`, marginBottom:'0.6rem', textTransform:'uppercase' }}>
          DATA_STREAM // {s.num} ——
        </p>
        
        <h2 style={{ 
          fontSize:'clamp(1.6rem, 3vw, 2.4rem)', fontWeight:700, color:'#ddeeff', 
          marginBottom:'0.5rem', lineHeight:1.1, letterSpacing: '-0.02em',
          textShadow: `0 0 30px ${activeColor}44`
        }}>
          {s.title}
        </h2>
        
        <p style={{ ...mono, fontSize:'0.65rem', color:'rgba(0,185,255,0.45)', letterSpacing:'0.35em', marginBottom:'2.5rem', textTransform:'uppercase' }}>
          {s.tagline}
        </p>
        
        {/* Zone de contenu principale */}
        <div style={{ 
          borderTop:`1px dashed ${activeColor}22`, 
          paddingTop:'2rem',
          position: 'relative'
        }}>
          <PC />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────
export default function PortfolioMain() {
  const zoneRef     = useRef<HTMLDivElement>(null);
  const scrollRef   = useRef<ScrollData>({ section:0, progress:0 });

  const [active,    setActive]    = useState(0);
  const [sp,        setSp]        = useState(0);
  const [totalProg, setTotalProg] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSec,  setPanelSec]  = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'auto';
    const onScroll = () => {
      const zone = zoneRef.current;
      if (!zone) return;
      const rect     = zone.getBoundingClientRect();
      const scroll   = zone.offsetHeight - window.innerHeight;
      const prog     = Math.max(0, Math.min(1, -rect.top / scroll));
      const raw      = prog * N_SEC;
      const idx      = Math.min(N_SEC - 1, Math.floor(raw));
      const secProg  = raw - idx;
      scrollRef.current = { section:idx, progress:secProg };
      setActive(idx);
      setSp(secProg);
      setTotalProg(prog);
    };
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => { document.body.style.overflow='hidden'; window.removeEventListener('scroll', onScroll); };
  }, []);

  return (
    <div style={{ background:'#000208' }}>

      {/* Canvas fixe */}
      <div style={{ position:'fixed', inset:0, zIndex:0 }}>
        <Canvas camera={{ position:[0,0,5], fov:72 }} gl={{ antialias:true, alpha:true }}
          onCreated={({ gl }) => gl.setClearColor(0,0)}>
          <DenseField scrollRef={scrollRef} />
          <EffectComposer>
            <Bloom intensity={1.1} luminanceThreshold={0.18} luminanceSmoothing={0.82} mipmapBlur />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Zone sticky */}
      <div ref={zoneRef} style={{ height:`${N_SEC * SEC_VH}vh`, position:'relative', zIndex:1 }}>
        <div style={{ position:'sticky', top:0, height:'100vh', overflow:'hidden' }}>

          {/* Coins HUD */}
          <Corner p="tl"/> <Corner p="tr"/> <Corner p="bl"/> <Corner p="br"/>

          {/* Numéros déco */}
          <SideNums side="left"  sec={active} />
          <SideNums side="right" sec={active} />

          {/* Label haut gauche */}
          <div style={{ position:'absolute', top:22, left:54, ...mono, fontSize:'0.52rem', letterSpacing:'0.55em', color:'rgba(0,185,255,0.28)', textTransform:'uppercase', pointerEvents:'none' }}>
            CYBERSPACE ▸ NODE 7743 ▸ {SECTIONS[active].num}
          </div>

          {/* Contenu section courante */}
          <SectionText
            section={SECTIONS[active]}
            sp={sp}
            onOpen={() => { setPanelSec(active); setPanelOpen(true); }}
          />

          {/* Timeline en bas */}
          <Timeline active={active} total={totalProg} />

        </div>
      </div>

      {/* Panel détail */}
      <DetailPanel secIdx={panelSec} open={panelOpen} onClose={() => setPanelOpen(false)} />

    </div>
  );
}
