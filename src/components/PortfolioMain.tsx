import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

// 0. Silhouette assise de profil (figure facing left, vue depuis +Z)
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

  // Articulations : figure assise, de profil, regardant vers la gauche (-X)
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
  const KNE   = [-0.56, 0.73, 0.00];   // genou : y≈HIP.y = cuisse horizontale
  const ANK   = [-0.54, 0.04, 0.03];   // cheville : x≈KNE.x = mollet vertical
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

// 1. Engrenages imbriqués (Human's Connexion) - rotation dans le shader
// Centres et rayons exposés pour le vertex shader
const GEAR_CENTERS: [number,number][] = [[-2.2, 0.0], [1.1, 0.0], [2.65, 1.51]];
const GEAR_OUTER = [2.05, 1.42, 0.88];
const GEAR_TEETH = [14, 10, 7];
// Vitesses angulaires en rad/s (rapports dentés) : G1 CW → G2 CCW → G3 CW
const GEAR_SPEEDS = [0.28, -0.39, 0.56]; // G2 = G1*(14/10), G3 = G2*(10/7)

// Retourne [positions, gearIds] : pas d'état global, compatible HMR
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
  // Proportionnel aux circonférences, phase offset pour imbrication visuelle au contact
  addGear(0, Math.floor(n*.38));
  addGear(1, Math.floor(n*.26), Math.PI/10); // dents de G1 dans les creux de G0
  while(idx<n) addGear(2, n-idx, Math.PI/7); // dents de G2 dans les creux de G1
  return [p, g];
}

function mkGears(n: number): Float32Array { return mkGearsWithIds(n)[0]; }

// 2. Attracteur de Lorenz (Chaos)
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

// 3. Atome (Compétences) - cerveau conservé ci-dessous en commentaire
// BX=0.5, BY=0.0 → centre-droit de l'écran

// Anciens nœuds neuraux (conservés pour référence, non utilisés)
const BRAIN_NODES: [number,number][] = [
  // 0-4 : inner - surface du cerveau
  [ 0.5,  0.9],[-0.2,  0.5],[ 1.2,  0.5], // 0-2 inner top
  [-0.2, -0.4],[ 1.2, -0.4],              // 3-4 inner bas
  // 5-13 : outer - constellation neuronale
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


// Atome : noyau + 3 ellipses orbitales à 0°, 60°, 120° dans le plan écran
// Formule correcte : anneau de base dans XY incliné α=60° sur Z, puis rotation φ dans l'écran
// → vue de face = 3 ellipses à 60° (logo atomique classique) ; en rotation Y = gyroscope 3D
function mkAtomWithArcT(n: number): [Float32Array, Float32Array] {
  const p    = new Float32Array(n * 3);
  const arcT = new Float32Array(n).fill(-1);
  let idx = 0;
  const put = (x: number, y: number, z: number, at = -1) => {
    if (idx >= n) return;
    p[idx*3]=x; p[idx*3+1]=y; p[idx*3+2]=z; arcT[idx]=at; idx++;
  };
  const jit = (s: number) => (Math.random()-.5)*s;

  const BX = 0.5, BY = 0.0;
  const R  = 1.70;
  const CA = 0.5, SA = 0.866; // cos/sin(60°) - aplatissement de l'ellipse

  // A. Noyau (15%) : sphère dense, aNeural=-2 → grosse taille dans le shader
  const nucleusN = Math.floor(n * 0.15);
  for (let i = 0; i < nucleusN; i++) {
    const ph = Math.acos(2*Math.random()-1);
    const th = Math.random() * Math.PI * 2;
    const r  = Math.random() * 0.22;
    put(BX + r*Math.sin(ph)*Math.cos(th),
        BY + r*Math.sin(ph)*Math.sin(th),
        r*Math.cos(ph), -2.0);
  }

  // B. 3 anneaux orbitaux (20% chacun = 60%) - z=0 : ellipses plates dans le plan écran
  // La rotation Z (vue de face) rend la profondeur inutile et source de distorsion perspective
  const ringN = Math.floor(n * 0.20);
  for (const phi of [0, Math.PI/3, 2*Math.PI/3]) {
    const cP = Math.cos(phi), sP = Math.sin(phi);
    for (let i = 0; i < ringN; i++) {
      const t = (i / ringN) * Math.PI * 2;
      const ct = Math.cos(t), st = Math.sin(t);
      put(BX + R*(ct*cP - CA*st*sP) + jit(0.025),
          BY + R*(ct*sP + CA*st*cP) + jit(0.025),
          jit(0.025), -0.5);
    }
  }

  // C. Nuage quantique (25%) : halos dispersés autour
  while (idx < n) {
    const ph = Math.acos(2*Math.random()-1);
    const th = Math.random() * Math.PI * 2;
    const r  = 1.5 + Math.random() * 0.9;
    put(BX + Math.sin(ph)*Math.cos(th)*r,
        BY + Math.sin(ph)*Math.sin(th)*r*0.85,
        Math.cos(ph)*r*0.65);
  }

  return [p, arcT];
}

function mkAtom(n: number): Float32Array {
  const [p] = mkAtomWithArcT(n);
  return p;
}

// 4. Double hélice ADN - hélice ELLIPTIQUE (xa >> zb) vue de face = deux vagues, pas un tube
// Layout : [Brin A : strandN] [Brin B : strandN] [Barreaux : DNA_N_RUNGS * DNA_RUNG_PTS]
const DNA_N_RUNGS  = 22;
const DNA_RUNG_PTS = 90;  // 22 * 90 = 1980

function mkHelix(n: number): Float32Array {
  const p = new Float32Array(n * 3);
  const turns  = 1.5;   // 1.5 tours seulement : hélice très étirée qui déborde hors-cadre
  const xa     = 2.5;   // amplitude X
  const zb     = 0.45;  // amplitude Z (profondeur)
  const yBase  = -6.0, height = 12.0; // grande hauteur : les extrémités sortent de l'écran
  const rungTotal = DNA_N_RUNGS * DNA_RUNG_PTS;        // 1980
  const strandN   = Math.floor((n - rungTotal) / 2);   // ~3510 par brin
  // Tilt diagonal : axe hélice incliné à -0.5 rad autour de Z (bas-gauche → haut-droite)
  const ct = Math.cos(-0.5), st = Math.sin(-0.5);
  let idx = 0;
  const put = (lx: number, ly: number, lz: number) => {
    p[idx*3] = lx*ct - ly*st; p[idx*3+1] = lx*st + ly*ct; p[idx*3+2] = lz; idx++;
  };
  // Brin A
  for (let i = 0; i < strandN; i++) {
    const t = (i / strandN) * Math.PI * 2 * turns;
    put(xa * Math.cos(t), yBase + (i / strandN) * height, zb * Math.sin(t));
  }
  // Brin B déphasé de π (côté opposé sur l'ellipse)
  for (let i = 0; i < strandN; i++) {
    const t = (i / strandN) * Math.PI * 2 * turns + Math.PI;
    put(xa * Math.cos(t), yBase + (i / strandN) * height, zb * Math.sin(t));
  }
  // Barreaux : de brin A vers brin B à même hauteur (le long du petit axe elliptique)
  for (let r = 0; r < DNA_N_RUNGS; r++) {
    const frac = (r + 0.5) / DNA_N_RUNGS;
    const t    = frac * Math.PI * 2 * turns;
    const y    = yBase + frac * height;
    const ax   = xa * Math.cos(t), az = zb * Math.sin(t); // point brin A
    // brin B = (cos(t+π), sin(t+π)) = (-ax/xa*xa, -az/zb*zb) = (-ax, -az)
    for (let j = 0; j < DNA_RUNG_PTS && idx < n; j++) {
      const lT = (j + 0.5) / DNA_RUNG_PTS;
      put(ax * (1 - 2*lT), y, az * (1 - 2*lT));
    }
  }
  while (idx < n) { p[idx*3]=p[(idx-1)*3]; p[idx*3+1]=p[(idx-1)*3+1]; p[idx*3+2]=p[(idx-1)*3+2]; idx++; }
  return p;
}

// 5. Ampoule à incandescence (BTS - icône de l'apprentissage)
// strand: 0=enveloppe de verre, 1=filament hélicoïdal, 2=halo intérieur, -1=culot métallique
function mkTorusKnotWithStrand(n: number): [Float32Array, Float32Array] {
  const p = new Float32Array(n * 3);
  const s = new Float32Array(n).fill(-1);
  let idx = 0;
  const put = (x: number, y: number, z: number, strand: number) => {
    if (idx < n) { p[idx*3]=x; p[idx*3+1]=y; p[idx*3+2]=z; s[idx]=strand; idx++; }
  };
  const jit = (v: number) => (Math.random() - 0.5) * v;
  const BX = 0.5;

  // ── ENVELOPPE DE VERRE (strand=0) : profil A19 en révolution autour de Y ──
  const glassProfile: [number, number][] = [
    [0.00,  1.68], [0.60,  1.44], [1.08,  0.84], [1.32,  0.12],
    [1.14, -0.30], [0.74, -0.66], [0.46, -0.98], [0.43, -1.32], [0.43, -1.62],
  ];
  const glassN = Math.floor(n * 0.42);
  for (let i = 0; i < glassN; i++) {
    const seg   = Math.floor(Math.random() * (glassProfile.length - 1));
    const t     = Math.random();
    const r     = glassProfile[seg][0] * (1 - t) + glassProfile[seg + 1][0] * t;
    const y     = glassProfile[seg][1] * (1 - t) + glassProfile[seg + 1][1] * t;
    const angle = Math.random() * Math.PI * 2;
    put(BX + r * Math.cos(angle) + jit(0.025), y + jit(0.025), r * Math.sin(angle) + jit(0.025), 0);
  }

  // ── FILAMENT EN HÉLICE (strand=1) : bobine luminescente ──────────────────
  const filamentN = Math.floor(n * 0.28);
  const coilR = 0.31, coilTurns = 6, coilYMin = -0.38, coilYMax = 0.66;
  for (let i = 0; i < filamentN; i++) {
    const t     = i / filamentN;
    const angle = t * coilTurns * Math.PI * 2;
    put(BX + Math.cos(angle) * coilR + jit(0.012),
             coilYMin + t * (coilYMax - coilYMin) + jit(0.012),
             Math.sin(angle) * coilR + jit(0.012), 1);
  }

  // ── HALO INTÉRIEUR (strand=2) : lueur chaude irradiée par le filament ────
  const glowN = Math.floor(n * 0.20);
  for (let i = 0; i < glowN; i++) {
    const r     = Math.random() * 0.95 * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    const y     = (Math.random() * 2 - 1) * 0.72 + 0.14;
    put(BX + r * Math.cos(angle), y, r * Math.sin(angle), 2);
  }

  // ── CULOT MÉTALLIQUE (strand=-1) : anneaux du pas de vis ─────────────────
  while (idx < n) {
    const ring  = Math.floor(Math.random() * 4);
    const angle = Math.random() * Math.PI * 2;
    const r     = 0.43 + (ring % 2) * 0.030;
    put(BX + r * Math.cos(angle) + jit(0.020),
             -1.62 - ring * 0.14 + jit(0.020),
             r * Math.sin(angle) + jit(0.020), -1);
  }

  return [p, s];
}

function mkTorusKnot(n: number): Float32Array { return mkTorusKnotWithStrand(n)[0]; }

// 6. Convergence vers un point (Contact)
// 6. Clé du Terminal : anneau travaillé + tige + 3 crans (section Contact)
// strand: 0=bow, 1=deco intérieure, 2=tige, 3=crans
function mkKeyWithStrand(n: number): [Float32Array, Float32Array] {
  const p = new Float32Array(n * 3);
  const s = new Float32Array(n);
  const nBow   = Math.floor(n * 0.30);
  const nDeco  = Math.floor(n * 0.12);
  const nShaft = Math.floor(n * 0.28);
  const nTeeth = n - nBow - nDeco - nShaft;
  let idx = 0;

  // ── Bow : tore VERTICAL (axe Z → anneau face caméra, lira comme cercle) ──
  // Formule : x=(R+r·cosφ)·cosθ  y=bowY+(R+r·cosφ)·sinθ  z=r·sinφ
  // Bas de l'anneau : y = bowY-(R+r), connexion tige
  const R = 0.42, r = 0.09, bowY = 0.68;
  for (let i = 0; i < nBow; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.random() * Math.PI * 2;
    const rr    = R + r * Math.cos(phi);
    p[idx*3]   = rr * Math.cos(theta);
    p[idx*3+1] = bowY + rr * Math.sin(theta);
    p[idx*3+2] = r * Math.sin(phi);
    s[idx++] = 0;
  }

  // ── Déco intérieure : ring concentrique + 6 spokes (plan XY) ──
  for (let i = 0; i < nDeco; i++) {
    const th = Math.random() * Math.PI * 2;
    if (Math.random() < 0.52) {
      const rr = R * (0.45 + Math.random() * 0.15);
      p[idx*3]   = rr * Math.cos(th);
      p[idx*3+1] = bowY + rr * Math.sin(th);
      p[idx*3+2] = (Math.random() - 0.5) * 0.04;
    } else {
      const spokeA = Math.floor(Math.random() * 6) * Math.PI / 3;
      const t      = Math.random();
      const rr     = r * 0.8 + t * (R - r * 1.1 - r * 0.8);
      p[idx*3]   = rr * Math.cos(spokeA) + (Math.random()-0.5)*0.012;
      p[idx*3+1] = bowY + rr * Math.sin(spokeA) + (Math.random()-0.5)*0.012;
      p[idx*3+2] = (Math.random()-0.5)*0.020;
    }
    s[idx++] = 1;
  }

  // ── Tige : cylindre - shaftTop = bowY-(R+r) pour connexion exacte ──
  const shaftR = 0.055, shaftTop = bowY - (R + r), shaftBot = -0.62;
  for (let i = 0; i < nShaft; i++) {
    const theta = Math.random() * Math.PI * 2;
    p[idx*3]   = shaftR * Math.cos(theta);
    p[idx*3+1] = shaftBot + Math.random() * (shaftTop - shaftBot);
    p[idx*3+2] = shaftR * Math.sin(theta);
    s[idx++] = 2;
  }

  // ── Crans : 3 dents à droite du bout de la tige ────────────
  const teeth = [
    { y0: -0.20, y1: -0.30, xMax: 0.22 },
    { y0: -0.36, y1: -0.46, xMax: 0.30 },
    { y0: -0.52, y1: -0.60, xMax: 0.20 },
  ];
  const nPer = Math.floor(nTeeth / teeth.length);
  for (let ti = 0; ti < teeth.length; ti++) {
    const { y0, y1, xMax } = teeth[ti];
    const cnt = ti < teeth.length-1 ? nPer : nTeeth - nPer*(teeth.length-1);
    for (let i = 0; i < cnt; i++) {
      const face = Math.random();
      let x, y, z;
      if (face < 0.28) {
        x = shaftR + Math.random()*(xMax-shaftR); y = y0; z = (Math.random()-.5)*shaftR*2;
      } else if (face < 0.56) {
        x = shaftR + Math.random()*(xMax-shaftR); y = y1; z = (Math.random()-.5)*shaftR*2;
      } else if (face < 0.80) {
        x = xMax; y = y1 + Math.random()*(y0-y1); z = (Math.random()-.5)*shaftR*2;
      } else {
        x = shaftR + Math.random()*(xMax-shaftR); y = y1 + Math.random()*(y0-y1); z = Math.random()<.5 ? shaftR : -shaftR;
      }
      p[idx*3]=x; p[idx*3+1]=y; p[idx*3+2]=z;
      s[idx++] = 3;
    }
  }
  return [p, s];
}
function mkKey(n: number): Float32Array { return mkKeyWithStrand(n)[0]; }

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

const SHAPE_MAKERS = [mkHumanoidPlaceholder, mkGears, mkLorenz, mkAtom, mkHelix, mkTorusKnot, mkKey];

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

// Ferme une modale quand on appuie sur Échap (accessibilité clavier)
function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

// ─────────────────────────────────────────────────────────────────
// DENSE FIELD - champ d'étoiles + morphing vers les shapes CP77
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
      attribute float aStrand;
      attribute float aKnotStrand;
      attribute float aKeyStrand;
      attribute vec3  aTarget;
      varying float vType;
      varying float vFocus;
      varying float vRnd;
      varying float vMorphed;
      varying float vNeural;
      varying float vStrand;
      varying float vKnotStrand;
      varying float vKeyStrand;
      void main() {
        vType = aType; vRnd = aRnd; vNeural = aNeural; vStrand = aStrand; vKnotStrand = aKnotStrand; vKeyStrand = aKeyStrand;
        float stagger = uForming > 0.5 ? aRnd : (1.0 - aRnd);
        float tDel = clamp((uMorphT - stagger*0.22) / (1.0 - stagger*0.22 + 0.001), 0.0, 1.0);
        float tEas = tDel * tDel * (3.0 - 2.0 * tDel);
        vec3  pos  = mix(position, aTarget, tEas);
        vMorphed = tEas;
        float drift = 1.0 - tEas * 0.90;
        pos.z += sin(uTime * 0.20 + aRnd * 6.28) * 0.18 * drift;
        pos.x += cos(uTime * 0.14 + aRnd * 4.10) * 0.09 * drift;
        pos.y += sin(uTime * 0.17 + aRnd * 5.30) * 0.07 * drift;
        // Direction aléatoire fixe par particule - pas de dérive centrifuge depuis l'origine
        float breathe = sin(uTime * 1.6 + aRnd * 6.28) * 0.012 * tEas;
        vec3 bDir = normalize(vec3(sin(aRnd*127.3), cos(aRnd*311.7+1.0), sin(aRnd*253.1)));
        pos += bDir * breathe;
        // Engrenages : rotation section 1, type 1 uniquement - classification par distance
        if (uSection >= 1.0 && uSection < 2.0 && uMorphT > 0.05 && aGear >= 0.0) {
          vec2 gCenter = aGear < 0.5 ? vec2(-2.2,0.0) : aGear < 1.5 ? vec2(1.1,0.0) : vec2(2.65,1.51);
          float gSpeed  = aGear < 0.5 ? 0.28 : aGear < 1.5 ? -0.39 : 0.56;
          float phaseOff = aGear < 0.5 ? -0.337 : aGear < 1.5 ? -0.314 : 0.314;
          float angle = uTime * gSpeed * uMorphT + phaseOff;
          vec2 c = pos.xy - gCenter;
          pos.xy = vec2(c.x*cos(angle)-c.y*sin(angle), c.x*sin(angle)+c.y*cos(angle)) + gCenter;
        }
        // Section 2 - Chaos : rotation Y lente + tourbillon de fond
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
        // Section 3 - Atome : rotation Z (comme une roue) - logo toujours lisible de face
        // Uniquement noyau (aNeural=-2) et anneaux (aNeural=-0.5) - pas le nuage cloud (-1)
        bool isAtomCore = (uSection >= 3.0 && uSection < 4.0 && uMorphT > 0.05
                           && length(aTarget - position) > 0.8
                           && (aNeural < -1.5 || (aNeural > -0.6 && aNeural < -0.4)));
        if (isAtomCore) {
          float rotAmt = smoothstep(0.40, 1.00, uMorphT);
          float rz     = uTime * 0.22 * rotAmt;
          vec3  c      = vec3(0.5, 0.0, 0.0);
          vec3  off    = pos - c;
          float pxr    = off.x * cos(rz) - off.y * sin(rz);
          off.y        = off.x * sin(rz) + off.y * cos(rz);
          off.x        = pxr;
          pos           = c + off;
          if (aNeural < -1.5)
            pos += bDir * sin(uTime * 2.2 + aRnd * 6.28) * 0.015;
        }
        // Section 4 - Double hélice : rotation lente autour de son propre axe incliné
        if (uSection >= 4.0 && uSection < 5.0 && uMorphT > 0.05 && aGear >= 0.0) {
          float rotAmt = smoothstep(0.3, 0.8, uMorphT);
          float angle  = uTime * 0.15 * rotAmt; // très lent : ~42 s par tour complet
          float ca = cos(angle), sa = sin(angle);
          float kx = 0.4794, ky = 0.8776; // axe hélice après tilt -0.5 rad
          float kdot = pos.x * kx + pos.y * ky;
          float crx  = ky * pos.z, cry = -kx * pos.z, crz = kx * pos.y - ky * pos.x;
          pos.x = pos.x * ca + crx * sa + kx * kdot * (1.0 - ca);
          pos.y = pos.y * ca + cry * sa + ky * kdot * (1.0 - ca);
          pos.z = pos.z * ca + crz * sa;
        }
        // Section 5 - Ampoule : statique, le glow fait le travail
        // Section 6 - Clé : rotation Y lente (montre le volume 3D)
        if (uSection >= 6.0 && uMorphT > 0.05 && aKeyStrand >= 0.0) {
          float rotAmt = smoothstep(0.3, 0.8, uMorphT);
          float angle  = uTime * 0.28 * rotAmt;
          float ca = cos(angle), sa = sin(angle);
          float px = pos.x * ca + pos.z * sa;
          pos.z    = -pos.x * sa + pos.z * ca;
          pos.x    = px;
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
        if (isN3 > 0.01 && aNeural >= 0.0)              base = mix(base, 0.016+aRnd*0.007, isN3);
        if (isN3 > 0.01 && aNeural < -1.5)              base = mix(base, 0.095+aRnd*0.055, isN3);
        if (isN3 > 0.01 && aNeural > -1.0 && aNeural < 0.0) base = mix(base, 0.075+aRnd*0.035, isN3);
        float isH4 = smoothstep(3.5,4.0,uSection)*(1.0-smoothstep(4.9,5.0,uSection));
        if (isH4 > 0.01 && aGear >= 0.0) {
          float isRung = step(0.3, aStrand) * (1.0 - step(0.7, aStrand));
          float boost  = mix(2.8, 4.2, isRung); // brins visibles, barreaux plus épais
          base = mix(base, base * boost, isH4 * tEas);
        }
        float isK5 = smoothstep(4.9,5.1,uSection)*(1.0-smoothstep(5.9,6.0,uSection));
        if (isK5 > 0.01 && aKnotStrand >= 0.0) {
          float isFilament = step(0.5, aKnotStrand) * (1.0 - step(1.5, aKnotStrand));
          base = mix(base, base * mix(1.4, 2.8, isFilament), isK5 * tEas);
        }
        float isKey6 = smoothstep(5.9, 6.1, uSection);
        if (isKey6 > 0.01 && aKeyStrand >= 0.0) {
          float isBow   = 1.0 - step(0.5, aKeyStrand);
          float isTeeth = step(2.5, aKeyStrand);
          base = mix(base, base * mix(1.6, mix(2.2, 1.4, isTeeth), isBow), isKey6 * tEas);
        }
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
      varying float vStrand;
      varying float vKnotStrand;
      varying float vKeyStrand;
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
          // Section 2 - Lorenz : rouge sombre → orangé selon vRnd
          col = mix(col, mix(vec3(0.60, 0.04, 0.0), vec3(1.0, 0.50, 0.05), vRnd), isChaos * 0.85);
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
          // ── Section 4 : double hélice ADN - couleurs par brin ────────
          float isH4 = smoothstep(3.5,4.0,uSection)*(1.0-smoothstep(4.9,5.0,uSection));
          if (isH4 > 0.01 && vStrand >= 0.0) {
            vec3 strandCol;
            if (vStrand < 0.3)       strandCol = vec3(0.00, 0.88, 1.00); // Brin A : cyan électrique
            else if (vStrand < 0.75) strandCol = vec3(0.82, 0.90, 1.00); // Barreau : blanc froid
            else                     strandCol = vec3(1.00, 0.18, 0.62); // Brin B : rose néon
            col   = mix(col, strandCol, isH4 * vMorphed * 0.92);
            alpha = mix(alpha, halo * pulse * (0.10 + vRnd * 0.08 + vMorphed * 0.50), isH4);
          }
          // ── Section 5 : ampoule - verre · filament · halo ────────────
          float isK5 = smoothstep(4.9,5.1,uSection)*(1.0-smoothstep(5.9,6.0,uSection));
          if (isK5 > 0.01 && vKnotStrand >= 0.0) {
            if (vKnotStrand < 0.5) {
              // Enveloppe de verre : bleu-blanc translucide
              col   = mix(col, vec3(0.72, 0.90, 1.00), isK5 * vMorphed * 0.52);
              float gp = 0.45 + 0.55 * sin(uTime * 0.6 + vRnd * 3.14);
              alpha = mix(alpha, halo * gp * (0.04 + vRnd * 0.05 + vMorphed * 0.12), isK5);
            } else if (vKnotStrand < 1.5) {
              // Filament : blanc chaud - alpha bas, le bloom fait le glow
              col   = mix(col, vec3(1.00, 0.94, 0.70), isK5 * vMorphed * 0.96);
              float fp = 0.62 + 0.38 * sin(uTime * 2.5 + vRnd * 6.28);
              alpha = mix(alpha, halo * fp * (0.10 + vRnd * 0.06 + vMorphed * 0.14), isK5);
            } else {
              // Halo intérieur : lueur chaude concentrée dans le bulbe
              col   = mix(col, vec3(1.00, 0.72, 0.20), isK5 * vMorphed * 0.75);
              float hp = 0.50 + 0.50 * sin(uTime * 1.2 + vRnd * 4.71);
              alpha = mix(alpha, halo * hp * (0.02 + vRnd * 0.03 + vMorphed * 0.06), isK5);
            }
          }
          // ── Section 6 : clé du terminal - cyan holographique ─────────
          float isKey6 = smoothstep(5.9, 6.1, uSection);
          if (isKey6 > 0.01 && vKeyStrand >= 0.0) {
            float kp = 0.55 + 0.45 * sin(uTime * 1.4 + vRnd * 6.28);
            if (vKeyStrand < 0.5) {
              // Bow (anneau) : cyan électrique - alpha bas pour que le trou reste visible
              col   = mix(col, vec3(0.00, 0.88, 1.00), isKey6 * vMorphed * 0.95);
              alpha = mix(alpha, halo * kp * (0.07 + vRnd * 0.05 + vMorphed * 0.16), isKey6);
            } else if (vKeyStrand < 1.5) {
              // Déco intérieure : bleu-circuit plus sombre
              col   = mix(col, vec3(0.22, 0.58, 0.95), isKey6 * vMorphed * 0.85);
              float dp = 0.40 + 0.60 * sin(uTime * 0.9 + vRnd * 4.71);
              alpha = mix(alpha, halo * dp * (0.06 + vRnd * 0.06 + vMorphed * 0.18), isKey6);
            } else if (vKeyStrand < 2.5) {
              // Tige : blanc-cyan lumineux - scan vertical
              float scanY  = fract(uTime * 0.35 + vRnd * 0.5);
              float scanPos = fract(vRnd * 3.7 + 0.5);
              float scan   = exp(-abs(scanPos - scanY) * 18.0) * 0.55;
              col   = mix(col, vec3(0.65, 0.95, 1.00), isKey6 * vMorphed * 0.90);
              alpha = mix(alpha, halo * (kp * 0.55 + scan) * (0.10 + vMorphed * 0.28), isKey6);
            } else {
              // Crans : cyan-vert tranchant - plus brillant pour lisibilité
              col   = mix(col, vec3(0.00, 0.95, 0.72), isKey6 * vMorphed * 0.98);
              alpha = mix(alpha, halo * kp * (0.14 + vRnd * 0.08 + vMorphed * 0.42), isKey6);
            }
          }
        }
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── FILAMENTS DE L'ATTRACTEUR DE LORENZ (section Chaos) ─────────
  const lorenzLineMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSection: { value: 0 }, uMorphT: { value: 0 } },
    vertexShader: `
      attribute float aT;
      uniform float uTime;
      uniform float uSection;
      uniform float uMorphT;
      varying float vT;
      void main() {
        vec3 pos = position;
        // Même rotation Y lente que les particules Lorenz (section 2)
        if (uSection >= 1.8 && uSection < 3.1) {
          float rotAmt = smoothstep(0.3, 0.8, uMorphT);
          float ra = uTime * 0.07 * rotAmt;
          float px = pos.x * cos(ra) + pos.z * sin(ra);
          pos.z   = -pos.x * sin(ra) + pos.z * cos(ra);
          pos.x   = px;
        }
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSection;
      uniform float uMorphT;
      varying float vT;
      float gpulse(float t, float pos, float sharpness) {
        float d = abs(t - pos);
        d = min(d, 1.0 - d);
        return exp(-d * d * sharpness);
      }
      void main() {
        float isChaos = smoothstep(1.8, 2.2, uSection) * (1.0 - smoothstep(2.7, 3.1, uSection));
        float visible = isChaos * smoothstep(0.6, 0.95, uMorphT);
        if (visible < 0.001) discard;
        // Ligne de base : dégradé rouge sombre → orangé le long de la trajectoire
        vec3 baseCol = mix(vec3(0.55, 0.05, 0.0), vec3(1.0, 0.45, 0.0), vT);
        float baseAlpha = 0.11;
        // Pulse 1 - orange vif, lent (20 s/boucle)
        float p1 = gpulse(vT, fract(uTime * 0.050),        1800.0);
        // Pulse 2 - rouge, moyen (13 s/boucle), décalé
        float p2 = gpulse(vT, fract(uTime * 0.077 + 0.37), 2200.0);
        // Pulse 3 - ambre/jaune, modéré (8 s/boucle), décalé
        float p3 = gpulse(vT, fract(uTime * 0.125 + 0.71), 2800.0);
        vec3  pulseCol   = vec3(1.0, 0.55, 0.0)  * p1 * 0.9
                         + vec3(1.0, 0.10, 0.02) * p2 * 0.75
                         + vec3(1.0, 0.80, 0.10) * p3 * 0.65;
        float pulseAlpha = p1 * 0.88 + p2 * 0.72 + p3 * 0.60;
        gl_FragColor = vec4(baseCol * baseAlpha + pulseCol, (baseAlpha + pulseAlpha) * visible);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  const lorenzLineGeo = useMemo(() => {
    const N = 6000;
    const pts = new Float32Array(N * 3);
    let x=0.1, y=0, z=0;
    const dt=0.005, s=10, r=28, b=8/3;
    for (let i=0; i<600; i++) { const dx=s*(y-x), dy=x*(r-z)-y, dz=x*y-b*z; x+=dx*dt; y+=dy*dt; z+=dz*dt; }
    for (let i=0; i<N; i++) {
      const dx=s*(y-x), dy=x*(r-z)-y, dz=x*y-b*z; x+=dx*dt; y+=dy*dt; z+=dz*dt;
      pts[i*3]=x*0.16; pts[i*3+1]=(z-25)*0.13; pts[i*3+2]=y*0.09-0.5;
    }
    const nSeg = N - 1;
    const pos = new Float32Array(nSeg * 2 * 3);
    const aT  = new Float32Array(nSeg * 2);
    for (let i=0; i<nSeg; i++) {
      pos[(i*2)*3+0] = pts[i*3]; pos[(i*2)*3+1] = pts[i*3+1]; pos[(i*2)*3+2] = pts[i*3+2];
      pos[(i*2+1)*3+0] = pts[(i+1)*3]; pos[(i*2+1)*3+1] = pts[(i+1)*3+1]; pos[(i*2+1)*3+2] = pts[(i+1)*3+2];
      aT[i*2]   = i / (N-1);
      aT[i*2+1] = (i+1) / (N-1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aT',       new THREE.BufferAttribute(aT,  1));
    return geo;
  }, []);

  // ── ANNEAUX ORBITAUX DE L'ATOME ──────────────────────────────────
  const atomRingMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSection: { value: 0 }, uMorphT: { value: 0 } },
    vertexShader: `
      uniform float uSection; uniform float uMorphT; uniform float uTime;
      void main() {
        vec3 pos = position;
        if (uSection >= 2.5 && uSection < 4.0) {
          float rotAmt = smoothstep(0.40, 1.00, uMorphT);
          float rz     = uTime * 0.22 * rotAmt;
          vec3  c      = vec3(0.5, 0.0, 0.0);
          vec3  off    = pos - c;
          float pxr    = off.x * cos(rz) - off.y * sin(rz);
          off.y        = off.x * sin(rz) + off.y * cos(rz);
          off.x        = pxr;
          pos           = c + off;
        }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform float uSection; uniform float uMorphT;
      void main() {
        float isN3    = smoothstep(2.85,3.15,uSection)*(1.0-smoothstep(3.6,3.9,uSection));
        float visible = smoothstep(0.68,0.92,uMorphT)*isN3;
        if (visible < 0.001) discard;
        float pulse   = 0.82 + 0.18*sin(uTime*1.1);
        gl_FragColor  = vec4(0.50, 0.88, 1.0, 0.90*pulse*visible);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // 3 anneaux orbitaux : z=0, ellipses parfaites dans le plan écran (pas de distorsion perspective)
  const atomRingGeo = useMemo(() => {
    const R = 1.70, BX = 0.5, BY = 0.0, SEGS = 90;
    const CA = 0.5;
    const verts: number[] = [];
    for (const phi of [0, Math.PI/3, 2*Math.PI/3]) {
      const cP = Math.cos(phi), sP = Math.sin(phi);
      for (let i = 0; i < SEGS; i++) {
        const t0 = (i       / SEGS) * Math.PI * 2;
        const t1 = ((i + 1) / SEGS) * Math.PI * 2;
        const [c0, s0] = [Math.cos(t0), Math.sin(t0)];
        const [c1, s1] = [Math.cos(t1), Math.sin(t1)];
        verts.push(
          BX + R*(c0*cP - CA*s0*sP), BY + R*(c0*sP + CA*s0*cP), 0,
          BX + R*(c1*cP - CA*s1*sP), BY + R*(c1*sP + CA*s1*cP), 0,
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    return geo;
  }, []);

  // ── ÉLECTRONS ORBITAUX : flash ponctuel sur chaque anneau ────────
  const electronMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: {value:0}, uSection: {value:0}, uMorphT: {value:0} },
    vertexShader: `
      uniform float uTime; uniform float uSection; uniform float uMorphT;
      attribute float aRingPhi;
      attribute float aTrailT;
      attribute float aPhaseOff;
      attribute float aOrbitSpd;
      varying float vAlpha;
      varying float vHead;
      void main() {
        const float R  = 1.70;
        const float CA = 0.50;
        const float BX = 0.50;
        // Activation cyclique : ~25% actif sur un cycle de 7s
        float phase  = fract(uTime / 7.0 + aPhaseOff);
        float activ = smoothstep(0.0, 0.06, phase) * (1.0 - smoothstep(0.22, 0.28, phase));
        // Position sur l'anneau : tête rapide, trail en arrière
        float headA  = uTime * aOrbitSpd;
        float angle  = headA - aTrailT * 0.65;
        float ct = cos(angle), st = sin(angle);
        float cP = cos(aRingPhi), sP = sin(aRingPhi);
        vec3 pos = vec3(BX + R*(ct*cP - CA*st*sP),
                             R*(ct*sP + CA*st*cP),
                        0.0);
        // Même rotation Z que l'atome
        float rotAmt = smoothstep(0.40, 1.00, uMorphT);
        float rz     = uTime * 0.22 * rotAmt;
        vec3  c      = vec3(BX, 0.0, 0.0);
        vec3  off    = pos - c;
        float pxr    = off.x * cos(rz) - off.y * sin(rz);
        off.y        = off.x * sin(rz) + off.y * cos(rz);
        off.x        = pxr;
        pos = c + off;
        float headGlow = 1.0 - aTrailT;
        float isN3  = smoothstep(2.85,3.15,uSection)*(1.0-smoothstep(3.6,3.9,uSection));
        float vis   = smoothstep(0.70,0.95,uMorphT) * isN3 * activ;
        vAlpha = headGlow * headGlow * vis;
        vHead  = headGlow;
        float base  = 0.03 + headGlow * 0.16;
        vec4 mv     = modelViewMatrix * vec4(pos, 1.0);
        gl_Position  = projectionMatrix * mv;
        gl_PointSize = base * (220.0 / -mv.z) * vis;
      }
    `,
    fragmentShader: `
      varying float vAlpha; varying float vHead;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float halo = smoothstep(0.5, 0.02, d);
        vec3 col   = mix(vec3(0.35,0.85,1.0), vec3(0.95,1.0,1.0), vHead * 0.85);
        gl_FragColor = vec4(col * halo, halo * vAlpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  const electronGeo = useMemo(() => {
    const N_TRAIL = 30;
    const phis    = [0, Math.PI/3, 2*Math.PI/3];
    const speeds  = [2.2, 2.8, 1.8];    // rad/s différents
    const phases  = [0.0, 0.38, 0.72];  // décalages de cycle
    const total   = phis.length * N_TRAIL;
    const aRingPhi  = new Float32Array(total);
    const aTrailT   = new Float32Array(total);
    const aPhaseOff = new Float32Array(total);
    const aOrbitSpd = new Float32Array(total);
    for (let r = 0; r < phis.length; r++) {
      for (let i = 0; i < N_TRAIL; i++) {
        const idx = r * N_TRAIL + i;
        aRingPhi[idx]  = phis[r];
        aTrailT[idx]   = i / (N_TRAIL - 1);
        aPhaseOff[idx] = phases[r];
        aOrbitSpd[idx] = speeds[r];
      }
    }
    const pos = new Float32Array(total * 3); // positions calculées dans le shader
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',  new THREE.BufferAttribute(pos,        3));
    geo.setAttribute('aRingPhi',  new THREE.BufferAttribute(aRingPhi,  1));
    geo.setAttribute('aTrailT',   new THREE.BufferAttribute(aTrailT,   1));
    geo.setAttribute('aPhaseOff', new THREE.BufferAttribute(aPhaseOff, 1));
    geo.setAttribute('aOrbitSpd', new THREE.BufferAttribute(aOrbitSpd, 1));
    return geo;
  }, []);

  const { positions, types, rnds, allTargets, shapeIdx, gpuBuf, gearIds, neuralBuf, strandBuf, knotStrandBuf, keyStrandBuf } = useMemo(() => {
    const N       = 100_000;
    const N_SHAPE = 9_000;
    const pos = new Float32Array(N*3);
    const typ = new Float32Array(N);
    const rnd = new Float32Array(N);

    // Champ d'étoiles uniforme : plus de gaussienne, plus de type 2 rouge
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

    // Sections 1, 3, 5 & 6 gérées en amont (patterns avec données extra)
    const [gearShapePos, gearShapeIds]   = mkGearsWithIds(shapeIdx.length);
    const [atomShapePos, atomArcTs    ]  = mkAtomWithArcT(shapeIdx.length);
    const [knotShapePos, knotStrandIds]  = mkTorusKnotWithStrand(shapeIdx.length);
    const [keyShapePos,  keyStrandIds ]  = mkKeyWithStrand(shapeIdx.length);

    const targets = SHAPE_MAKERS.map((maker, si) => {
      const tgt = new Float32Array(N*3);
      tgt.set(pos);
      const shapePos = si === 1 ? gearShapePos : si === 3 ? atomShapePos : si === 5 ? knotShapePos : si === 6 ? keyShapePos : maker(shapeIdx.length);
      shapeIdx.forEach((pIdx,i) => { tgt[pIdx*3]=shapePos[i*3]; tgt[pIdx*3+1]=shapePos[i*3+1]; tgt[pIdx*3+2]=shapePos[i*3+2]; });
      return tgt;
    });

    const gearIds = new Float32Array(N).fill(-1);
    shapeIdx.forEach((pIdx, si) => { gearIds[pIdx] = gearShapeIds[si]; });

    const neuralBuf = new Float32Array(N).fill(-1);
    shapeIdx.forEach((pIdx, si) => { neuralBuf[pIdx] = atomArcTs[si]; });

    // Identité de brin : synchronisé avec mkHelix
    const strandBuf  = new Float32Array(N).fill(-1);
    const dnaStrandN = Math.floor((shapeIdx.length - DNA_N_RUNGS * DNA_RUNG_PTS) / 2);
    shapeIdx.forEach((pIdx, i) => {
      strandBuf[pIdx] = i < dnaStrandN ? 0.0 : i < dnaStrandN * 2 ? 1.0 : 0.5;
    });

    // Identité de brin du nœud de trèfle : 0=Dev(cyan) 1=Infra(violet) 2=Sécu(rouge) -1=halo
    const knotStrandBuf = new Float32Array(N).fill(-1);
    shapeIdx.forEach((pIdx, i) => { knotStrandBuf[pIdx] = knotStrandIds[i]; });

    // Identité de brin de la clé : 0=bow 1=deco 2=tige 3=crans -1=hors shape
    const keyStrandBuf = new Float32Array(N).fill(-1);
    shapeIdx.forEach((pIdx, i) => { keyStrandBuf[pIdx] = keyStrandIds[i]; });

    const gpuBuf = new Float32Array(N*3);
    gpuBuf.set(targets[0]);

    return { positions:pos, types:typ, rnds:rnd, allTargets:targets, shapeIdx, gpuBuf, gearIds, neuralBuf, strandBuf, knotStrandBuf, keyStrandBuf };
  }, []);

  const prevSecRef  = useRef(-1);
  const prevMorphT  = useRef(0);
  const geoRef      = useRef<THREE.BufferGeometry>(null);
  // pointer r3f démarre à (0,0) = centre écran → repousse les particules en anneau avant tout mouvement
  const mouseNDCRef = useRef(new THREE.Vector2(-10, -10));
  useEffect(() => {
    const toNDC = (cx: number, cy: number) => mouseNDCRef.current.set(
      (cx / window.innerWidth) * 2 - 1,
      -(cy / window.innerHeight) * 2 + 1,
    );
    const h  = (e: MouseEvent) => toNDC(e.clientX, e.clientY);
    const ht = (e: TouchEvent) => { if (e.touches[0]) toNDC(e.touches[0].clientX, e.touches[0].clientY); };
    window.addEventListener('mousemove', h);
    window.addEventListener('touchmove', ht, { passive: true });
    return () => { window.removeEventListener('mousemove', h); window.removeEventListener('touchmove', ht); };
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

    const uSection = section + sp;
    const uMorphT  = sp < 0.35 ? sp/0.35 : sp > 0.65 ? 1-(sp-0.65)/0.35 : 1.0;
    const forming  = uMorphT >= prevMorphT.current - 0.0005 ? 1.0 : 0.0;
    prevMorphT.current = uMorphT;

    mat.uniforms.uTime.value    = clock.getElapsedTime();
    mat.uniforms.uMouse.value.copy(mouseNDCRef.current);
    mat.uniforms.uSection.value = uSection;
    mat.uniforms.uMorphT.value  = uMorphT;
    mat.uniforms.uForming.value = forming;
    lorenzLineMat.uniforms.uTime.value    = mat.uniforms.uTime.value;
    lorenzLineMat.uniforms.uSection.value = uSection;
    lorenzLineMat.uniforms.uMorphT.value  = uMorphT;
    atomRingMat.uniforms.uTime.value    = mat.uniforms.uTime.value;
    atomRingMat.uniforms.uSection.value = uSection;
    atomRingMat.uniforms.uMorphT.value  = uMorphT;
    electronMat.uniforms.uTime.value    = mat.uniforms.uTime.value;
    electronMat.uniforms.uSection.value = uSection;
    electronMat.uniforms.uMorphT.value  = uMorphT;
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
          <bufferAttribute attach="attributes-aStrand"     args={[strandBuf,     1]} />
          <bufferAttribute attach="attributes-aKnotStrand" args={[knotStrandBuf, 1]} />
          <bufferAttribute attach="attributes-aKeyStrand"  args={[keyStrandBuf,  1]} />
          <bufferAttribute attach="attributes-aTarget"     args={[gpuBuf,        3]} />
        </bufferGeometry>
        <primitive object={mat} />
      </points>
      <lineSegments args={[lorenzLineGeo, lorenzLineMat]} />
      <lineSegments args={[atomRingGeo, atomRingMat]} />
      <points args={[electronGeo, electronMat]} />
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
  const isMobile = useIsMobile();
  if (isMobile) return null;
  const nums = Array.from({length:5}, (_,j) => `${sn(sec*31+j*7+(side==='right'?100:0))}`);
  return (
    <div style={{ position:'absolute', [side]:18, top:'50%', transform:'translateY(-50%)', display:'flex', flexDirection:'column', gap:'2.5rem', pointerEvents:'none' }}>
      {nums.map((n,i) => <span key={i} style={{ fontFamily:'monospace', fontSize:'0.6rem', color:'rgba(0,185,255,0.18)' }}>{n}</span>)}
    </div>
  );
}

function Timeline({ active, total, onJump }: { active:number; total:number; onJump:(i:number)=>void }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:`0 ${isMobile ? '12px' : '28px'} 18px`, pointerEvents:'none' }}>
      {!isMobile && <div style={{ position:'relative', height:'1.2em', marginBottom:'8px' }}>
        {SECTIONS.map((s,i) => (
          <span key={s.id} style={{ position:'absolute', left:`${((i+0.5)/N_SEC)*100}%`, transform:'translateX(-50%)', fontFamily:'monospace', fontSize:'0.5rem', letterSpacing:'0.3em', textTransform:'uppercase', color: i===active ? 'rgba(0,185,255,0.85)' : 'rgba(0,140,255,0.22)', transition:'color 0.4s', whiteSpace:'nowrap' }}>
            {s.title.split(' ')[0]}
          </span>
        ))}
      </div>}
      <div style={{ height:4, background:'rgba(0,60,140,0.22)', position:'relative', borderRadius:4 }}>
        <div style={{ position:'absolute', top:0, left:0, height:'100%', borderRadius:4, width:`${total*100}%`, background:'linear-gradient(90deg,rgba(0,150,255,0.7),rgba(0,220,255,0.95))', boxShadow:'0 0 10px rgba(0,185,255,0.55),0 0 22px rgba(0,185,255,0.22)', transition:'width 0.08s linear' }} />
        {SECTIONS.map((_,i) => (
          <div key={i}
            onClick={() => onJump(i)}
            style={{ position:'absolute', top:'50%', left:`${((i+0.5)/N_SEC)*100}%`, transform:'translate(-50%,-50%)', width:i===active?12:8, height:i===active?12:8, borderRadius:'50%', background:i<=active?'rgba(0,210,255,0.92)':'rgba(0,60,140,0.5)', boxShadow:i===active?'0 0 14px rgba(0,185,255,0.9),0 0 28px rgba(0,185,255,0.4)':'none', transition:'all 0.3s', cursor:'pointer', pointerEvents:'auto' }} />
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
        <span style={{ fontFamily:'monospace', fontSize:'0.5rem', color:'rgba(0,140,255,0.28)', letterSpacing:'0.4em' }}>NODE {String(active+1).padStart(2,'0')} / {String(N_SEC).padStart(2,'0')}</span>
        <span style={{ fontFamily:'monospace', fontSize:'0.5rem', color:'rgba(0,140,255,0.28)', letterSpacing:'0.35em' }}>↓ SCROLL</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SECTION CONTENT - pilotée par scroll
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
  const isMobile = useIsMobile();
  return (
    <div style={{ position:'absolute', left: isMobile ? '16px' : 'clamp(28px,6vw,80px)', top:'50%', transform:`translateY(calc(-50% + ${ty}px))`, opacity:op, maxWidth: isMobile ? 'calc(100vw - 32px)' : '44vw', minWidth: isMobile ? undefined : 260, pointerEvents: op>0.3 ? 'auto' : 'none', transition:'opacity 0.15s ease, transform 0.15s ease' }}>
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
// MODE LÉGER : layout statique, pour les bébés machines
// ─────────────────────────────────────────────────────────────────
function LightMode({ onBack, onHeavy, onOpenCV, onOpenRapport, onOpenVeille, onOpenDat }: { onBack?: () => void; onHeavy: () => void; onOpenCV: () => void; onOpenRapport: () => void; onOpenVeille: () => void; onOpenDat: () => void }) {
  const SEC_COLORS = ['#00b9ff','#3d7fff','#8c3cff','#ff3250','#ff6e28','#00c8b4','#b0d4ff'];
  const isMobile = useIsMobile();
  const btnBase: CSSProperties = { fontFamily:'monospace', fontSize:'0.52rem', letterSpacing:'0.45em', textTransform:'uppercase', padding:'0.32rem 0.8rem', cursor:'pointer', background:'rgba(0,8,22,0.7)', border:'1px solid rgba(0,140,255,0.22)', color:'rgba(0,185,255,0.6)', transition:'all 0.22s' };
  return (
    <div className="lite-grid" style={{ minHeight:'100vh', color:'#ddeeff', position:'relative' }}>

      {/* CRT scanlines */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none',
        background:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,185,255,0.013) 3px,rgba(0,185,255,0.013) 4px)' }} />

      {/* Header */}
      <header style={{ position:'sticky', top:0, zIndex:20, background:'rgba(0,2,14,0.88)', backdropFilter:'blur(20px)',
        borderBottom:'1px solid rgba(0,185,255,0.1)', boxShadow:'0 2px 40px rgba(0,185,255,0.06)' }}>
        <div style={{ maxWidth:920, margin:'0 auto', padding: isMobile ? '0.8rem 1rem' : '1.1rem 2rem', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'baseline', gap:'0.7rem' }}>
              <h1 style={{ fontSize:'1.15rem', fontWeight:700, letterSpacing:'-0.02em' }}>Coline Derycke</h1>
              <span style={{ fontFamily:'monospace', fontSize:'0.42rem', color:'rgba(0,185,255,0.3)', letterSpacing:'0.5em', textTransform:'uppercase' }}>v.lite</span>
            </div>
            <p style={{ fontFamily:'monospace', fontSize:'0.5rem', color:'rgba(0,185,255,0.38)', letterSpacing:'0.55em', textTransform:'uppercase', marginTop:'0.18rem' }}>DEV · INFRA · SÉCURITÉ</p>
          </div>
          <div style={{ display:'flex', gap:'0.45rem' }}>
            <button onClick={onHeavy} style={btnBase}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.95)',borderColor:'rgba(0,185,255,0.5)',boxShadow:'0 0 14px rgba(0,185,255,0.18)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.6)',borderColor:'rgba(0,140,255,0.22)',boxShadow:'none'})}>
              ◈ VERSION 3D
            </button>
            {onBack && (
              <button onClick={onBack} style={btnBase}
                onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.9)',borderColor:'rgba(255,30,60,0.45)',boxShadow:'0 0 14px rgba(255,40,70,0.12)'})}
                onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.6)',borderColor:'rgba(0,140,255,0.22)',boxShadow:'none'})}>
                ← ACCUEIL
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sections */}
      <main style={{ position:'relative', zIndex:1, maxWidth:920, margin:'0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '2.5rem 2rem 6rem' }}>
        {SECTIONS.map((s, i) => {
          const color = SEC_COLORS[i];
          const PC    = PANELS[i];
          return (
            <section key={s.id} style={{ marginBottom:'2rem', position:'relative', overflow:'hidden',
              background:'rgba(0,5,18,0.55)', backdropFilter:'blur(10px)',
              borderLeft:`2px solid ${color}60`,
              boxShadow:`-5px 0 28px ${color}14, inset 0 0 80px rgba(0,185,255,0.015)`,
              padding: isMobile ? '1.25rem 1rem' : '2rem 2.5rem' }}>

              {/* Numéro en filigrane */}
              <div style={{ position:'absolute', top:'-0.8rem', right:'1.2rem', fontFamily:'monospace',
                fontSize:'6rem', fontWeight:900, color:`${color}09`, lineHeight:1,
                userSelect:'none', pointerEvents:'none', letterSpacing:'-0.05em' }}>{s.num}</div>

              <p style={{ fontFamily:'monospace', fontSize:'0.5rem', letterSpacing:'0.7em',
                color:`${color}70`, marginBottom:'0.45rem', textTransform:'uppercase', textShadow:`0 0 10px ${color}45` }}>{s.num} ——</p>
              <h2 style={{ fontSize:'clamp(1.3rem,2.5vw,1.9rem)', fontWeight:700, letterSpacing:'-0.02em',
                color:'#ddeeff', marginBottom:'0.35rem', textShadow:`0 0 18px ${color}66, 0 0 44px ${color}22` }}>{s.title}</h2>
              <p style={{ fontFamily:'monospace', fontSize:'0.58rem', color:`${color}80`,
                letterSpacing:'0.4em', textTransform:'uppercase', marginBottom:'1.6rem', textShadow:`0 0 10px ${color}40` }}>{s.tagline}</p>

              <div style={{ borderTop:`1px solid ${color}18`, paddingTop:'1.6rem' }}>
                {i === 6 ? <PContact onOpenCV={onOpenCV} /> : i === 5 ? <PSchool onOpenRapport={onOpenRapport} onOpenVeille={onOpenVeille} /> : i === 2 ? <PChaos onOpenDat={onOpenDat} /> : <PC />}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PANELS - contenu détaillé
// ─────────────────────────────────────────────────────────────────
const mono: CSSProperties = { fontFamily:'monospace' };
const tagStyle: CSSProperties = { ...mono, fontSize:'0.62rem', padding:'0.22rem 0.6rem', border:'1px solid rgba(0,140,255,0.2)', color:'rgba(0,185,255,0.8)', display:'inline-block', marginRight:'0.38rem', marginBottom:'0.38rem' };
const subLabel: CSSProperties = { ...mono, fontSize:'0.58rem', letterSpacing:'0.6em', color:'rgba(0,185,255,0.38)', marginBottom:'0.7rem', textTransform:'uppercase' };
const body: CSSProperties = { color:'rgba(200,220,255,0.7)', lineHeight:1.78, fontSize:'0.93rem' };

function PAbout()      { return <><p style={{...body,marginBottom:'1.5rem'}}>J'aime l'idée de bâtir des choses à partir de rien.

Pour moi, le code, l'infrastructure et la sécurité ne sont pas des cases étanches, c'est un seul et même terrain de jeu. J'adore concevoir des projets fullstack de la première à la dernière ligne de code, mais je trouve ça encore plus excitant de configurer le serveur Proxmox qui les héberge, de sécuriser le tunnel Tailscale qui les transporte et de surveiller mes conteneurs à distance.

Mon parcours a commencé dans les lettres, à décortiquer la syntaxe et les structures des textes. Aujourd'hui, j'applique exactement la même curiosité et la même exigence à la logique binaire. En reconversion et actuellement en alternance, je passe mes journées (et pas mal de mes nuits) à apprendre, bidouiller et consolider mes compétences, avec une seule obsession : comprendre l'ensemble du système.</p>
  <p style={subLabel}>Projets d'avenir</p>
  <p style={{...body,marginBottom:'1.5rem'}}>À l'issue du BTS SIO, je veux pousser plus loin sur l'ingénierie logicielle : concevoir des systèmes plus ambitieux, mieux architecturés, et continuer à relier le développement à l'infrastructure et à la sécurité. Mon objectif est d'intégrer une école d'ingénieur si ma candidature est retenue, pour transformer cette curiosité en véritable expertise.</p>
  <div>{['Node.js','React','Three.js','HTML/CSS/JS','Tailwind','Linux','Docker','Proxmox'].map(s=><span key={s} style={tagStyle}>{s}</span>)}</div></>; }
function PCompany()    {
  const t=['Gestion de parcs & Active Directory','Cloud Microsoft 365','Sécurité infrastructure, conformité RGPD','Stockage, sauvegarde, monitoring','Mises à jour serveurs, support N2/N3'];
  return <><p style={{...body,marginBottom:'1.5rem'}}>PME toulousaine · consulting IT, progiciels, développement web & logiciel, solutions d'infrastructure réseau sur mesure.</p>
    <a href="https://www.humansconnexion.com/" target="_blank" rel="noopener noreferrer"
      style={{display:'inline-block',marginBottom:'2rem',...mono,fontSize:'0.62rem',letterSpacing:'0.35em',textTransform:'uppercase',padding:'0.55rem 1.25rem',cursor:'pointer',color:'rgba(61,127,255,0.9)',background:'rgba(0,8,30,0.7)',backdropFilter:'blur(8px)',border:'1px solid rgba(61,127,255,0.3)',textDecoration:'none',transition:'all 0.25s'}}
      onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(61,127,255,0.7)',background:'rgba(0,12,40,0.8)',boxShadow:'0 0 18px rgba(61,127,255,0.25)'})}
      onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(61,127,255,0.9)',borderColor:'rgba(61,127,255,0.3)',background:'rgba(0,8,30,0.7)',boxShadow:'none'})}>
      → HUMANSCONNEXION.COM ↗
    </a>
    <p style={{...subLabel,marginBottom:'1rem'}}>Mon rôle · Technicienne systèmes & réseaux</p>
    {t.map(x=><div key={x} style={{display:'flex',gap:'0.8rem',marginBottom:'0.6rem',color:'rgba(200,220,255,0.65)',fontSize:'0.9rem'}}><span style={{color:'rgba(0,185,255,0.4)',flexShrink:0}}>▸</span>{x}</div>)}
  </>;
}
function PChaos({ onOpenDat }: { onOpenDat?: () => void }) {
  const s1=['Node.js','HTML/CSS/JS','WebRTC','PostgreSQL','Docker','Proxmox','Nginx','Double Ratchet','OAuth Google'];
  return <>
    <p style={{...body,marginBottom:'1.5rem'}}>Construit de bout en bout : infra Proxmox (2 LXC dev/prod) sur un serveur domestique, Docker Compose (Postgres + Nginx), jusqu'au frontend · Messagerie chiffrée de bout en bout (Double Ratchet) · WebRTC avec IA suppresseur de bruit · app de modération · protection failles XSS/SQLi · Authentification possible via Google.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:'0.6rem',marginBottom:'2rem'}}>
      <a href="https://chaos.colinederycke-portfolio.com/" target="_blank" rel="noopener noreferrer"
        style={{display:'inline-block',...mono,fontSize:'0.62rem',letterSpacing:'0.35em',textTransform:'uppercase',padding:'0.55rem 1.25rem',cursor:'pointer',color:'rgba(255,130,145,0.9)',background:'rgba(22,0,8,0.7)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,60,80,0.3)',textDecoration:'none',transition:'all 0.25s'}}
        onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(255,60,80,0.7)',background:'rgba(40,0,12,0.8)',boxShadow:'0 0 18px rgba(255,40,70,0.25)'})}
        onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,130,145,0.9)',borderColor:'rgba(255,60,80,0.3)',background:'rgba(22,0,8,0.7)',boxShadow:'none'})}>
        → OUVRIR CHAOS ↗
      </a>
      {onOpenDat && (
        <button onClick={onOpenDat}
          style={{display:'inline-block',...mono,fontSize:'0.62rem',letterSpacing:'0.35em',textTransform:'uppercase',padding:'0.55rem 1.25rem',cursor:'pointer',color:'rgba(255,130,145,0.9)',background:'rgba(22,0,8,0.45)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,60,80,0.3)',transition:'all 0.25s'}}
          onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(255,60,80,0.7)',background:'rgba(40,0,12,0.8)',boxShadow:'0 0 18px rgba(255,40,70,0.25)'})}
          onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,130,145,0.9)',borderColor:'rgba(255,60,80,0.3)',background:'rgba(22,0,8,0.45)',boxShadow:'none'})}>
          ▸ ARCHITECTURE (DAT) ↗
        </button>
      )}
    </div>
    <p style={subLabel}>Stack Chaos</p>
    <div style={{marginBottom:'1.5rem'}}>{s1.map(s=><span key={s} style={{...tagStyle,borderColor:'rgba(255,60,80,0.2)',color:'rgba(255,130,145,0.85)'}}>{s}</span>)}</div>
    <p style={subLabel}>Talos · supervision & admin</p>
    <div>{['React','Tailwind','Node.js'].map(s=><span key={s} style={tagStyle}>{s}</span>)}</div>
  </>;
}
function PSkills()     {
  const cols=[{l:'Développement',s:['Node.js','React','HTML/CSS/JS','Tailwind','WebRTC','Three.js','SQL','REST API','Git']},{l:'Infra & DevOps',s:['Proxmox','Docker','Linux','Windows Server','Active Directory','Cloud Microsoft','Nginx','Bash']},{l:'Sécurité',s:['Stormshield CSNA ★','Double Ratchet E2EE','XSS / SQLi','RGPD','Hash & chiffrement','Pare-feux réseau']}];
  return <div style={{display:'grid',gap:'1.5rem'}}>{cols.map(({l,s})=><div key={l}><p style={subLabel}>{l}</p><div>{s.map(x=><span key={x} style={tagStyle}>{x}</span>)}</div></div>)}</div>;
}
function PExperience() {
  const techno = ['Active Directory','Windows Server','Linux (Debian/Ubuntu)','Proxmox','HyperV','VMware','Stormshield','GLPI','Zabbix','Exchange / Office 365','Nextcloud','Bluemind','PXE / MDT'];
  const missions = [
    { label:'Migration parc W10 → W11',    desc:"Passage de l'intégralité du parc client sous Windows 11 : inventaire, tests de compatibilité, déploiement." },
    { label:'Mise à jour serveurs & bastion', desc:'Montée de version de l\'ensemble des serveurs et bastions vers les dernières LTS Debian / Ubuntu.' },
    { label:'Déploiement pare-feux Stormshield', desc:'Installation et configuration chez des clients et en datacenter. Habilité à intervenir dans les deux datacenters de l\'entreprise.' },
    { label:'Automatisation préparation PC', desc:'Mise en place d\'une chaîne PXE + MDT pour l\'industrialisation du déploiement Linux et Windows : zéro touch après amorçage réseau.' },
  ];
  return (
    <>
      {/* ── Human's Connexion ── */}
      <div style={{marginBottom:'2.5rem'}}>
        <p style={{...mono,fontSize:'0.58rem',color:'rgba(0,185,255,0.32)',letterSpacing:'0.5em',marginBottom:'0.3rem',textTransform:'uppercase'}}>2025 - EN COURS</p>
        <p style={{fontWeight:600,color:'#ddeeff',marginBottom:'0.2rem'}}>Human's Connexion</p>
        <p style={{...mono,fontSize:'0.65rem',color:'rgba(0,185,255,0.5)',marginBottom:'1.2rem'}}>Technicienne systèmes & réseaux · Alternance BTS SIO</p>

        <p style={subLabel}>Stack technique</p>
        <div style={{marginBottom:'1.6rem'}}>
          {techno.map(t => <span key={t} style={tagStyle}>{t}</span>)}
        </div>

        <p style={subLabel}>Missions</p>
        <div style={{display:'grid',gap:'0.75rem'}}>
          {missions.map(({label,desc}) => (
            <div key={label} style={{padding:'0.9rem 1rem',border:'1px solid rgba(0,140,255,0.1)',background:'rgba(0,15,40,0.5)'}}>
              <p style={{...mono,fontSize:'0.62rem',color:'rgba(0,185,255,0.75)',marginBottom:'0.3rem',letterSpacing:'0.15em'}}>▸ {label}</p>
              <p style={{...body,color:'rgba(200,220,255,0.55)',fontSize:'0.85rem'}}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Certification ── */}
      <div style={{paddingTop:'1.5rem',borderTop:'1px solid rgba(255,80,100,0.1)'}}>
        <p style={{...mono,fontSize:'0.58rem',color:'rgba(255,80,100,0.38)',letterSpacing:'0.5em',marginBottom:'0.3rem',textTransform:'uppercase'}}>2025</p>
        <p style={{fontWeight:600,color:'#ddeeff',marginBottom:'0.2rem'}}>Stormshield CSNA</p>
        <p style={{...mono,fontSize:'0.65rem',color:'rgba(255,80,100,0.52)',marginBottom:'0.6rem'}}>Certified Stormshield Network Administrator</p>
        <p style={body}>Configuration, sécurisation et supervision de pare-feux Stormshield.</p>
      </div>
    </>
  );
}
function PSchool({ onOpenRapport, onOpenVeille }: { onOpenRapport?: () => void; onOpenVeille?: () => void }) {
  const projs = [
    {
      title: 'Clone Netflix',
      tech: ['HTML','CSS','JavaScript'],
      desc: "Reproduction fidèle de l'interface Netflix : hero animé, carousels de contenus, design responsive. Exercice de CSS avancé et manipulation du DOM.",
      img: `${import.meta.env.BASE_URL}projects/netflix-screenshot.png`,
      github: 'https://github.com/Mephery/Projet-Netflix',
      live: 'https://projet-netflix-plum.vercel.app/',
    },
    {
      title: 'Pomodoro',
      tech: ['HTML','CSS','JavaScript'],
      desc: 'Timer Pomodoro avec cycles travail/pause configurables, notifications sonores et suivi de sessions. Interface soignée autour de la gestion du temps.',
      img: `${import.meta.env.BASE_URL}projects/pomodoro-screenshot.png`,
      github: 'https://github.com/Mephery/pomodoro',
      live: 'https://pomodoro-lac-nine.vercel.app/',
    },
    {
      title: 'Typing Speed Challenge',
      tech: ['React', 'JavaScript', 'CSS'],
      desc: "Test de vitesse de frappe avec statistiques en temps réel. Options au choix pour l'esthétique et la difficulté.",
      img: `${import.meta.env.BASE_URL}projects/Typing-speed-test-screenshot.png`,
      github: 'https://github.com/Mephery/typing-speed-test',
      live: 'https://typing-speed-test-ten-flame.vercel.app/',
    },
  ];
  const netItems = [
    'Routage : configuration réseau Cisco Packet Tracer',
    'Segmentation réseau : VLANs sous Cisco Packet Tracer',
    'Administration système : Windows Server, Active Directory, GPO, DNS, DHCP',
    'Firewall & SSH : déploiement PfSense, filtrage NAT, règles et droits SSH',
    'GLPI : gestion inventaire de parc informatique, ticketing',
    'CTF Linux : exploitation de vulnérabilités système, élévation de privilèges',
  ];
  const lnk: CSSProperties = { ...mono, fontSize:'0.68rem', letterSpacing:'0.3em', color:'rgba(0,200,180,0.75)', background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'none' };
  const corner = (pos: CSSProperties): CSSProperties => ({
    position:'absolute', width:8, height:8,
    borderColor:'rgba(0,200,180,0.5)', borderStyle:'solid', borderWidth:0,
    ...pos,
  });
  return (
    <div style={{display:'grid',gap:'1.25rem'}}>
      {projs.map(({title,tech,desc,img,github,live},n)=>(
        <div key={title} style={{padding:'1.25rem 1.25rem 1.55rem',border:'1px solid rgba(0,140,255,0.1)',background:'rgba(0,15,40,0.5)'}}>
          <div style={{position:'relative',marginBottom:'0.85rem',border:'1px solid rgba(0,185,255,0.15)',background:'rgba(0,8,24,0.8)',overflow:'hidden'}}>
            <span style={corner({top:4,left:4,borderTopWidth:1,borderLeftWidth:1})}/>
            <span style={corner({top:4,right:4,borderTopWidth:1,borderRightWidth:1})}/>
            <span style={corner({bottom:4,left:4,borderBottomWidth:1,borderLeftWidth:1})}/>
            <span style={corner({bottom:4,right:4,borderBottomWidth:1,borderRightWidth:1})}/>
            <img src={img} alt={title} style={{display:'block',width:'100%',height:'160px',objectFit:'cover',objectPosition:'top',opacity:0.88}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
            <p style={{fontWeight:600,color:'#ddeeff'}}>{title}</p>
            <span style={{...mono,fontSize:'0.52rem',color:'rgba(0,185,255,0.25)',letterSpacing:'0.4em'}}>0{n+1}</span>
          </div>
          <div style={{marginBottom:'0.6rem'}}>{tech.map(t=><span key={t} style={tagStyle}>{t}</span>)}</div>
          <p style={{...body,color:'rgba(200,220,255,0.55)',fontSize:'0.85rem',marginBottom:'0.75rem'}}>{desc}</p>
          <div style={{display:'flex',gap:'1.4rem'}}>
            <a href={github} target="_blank" rel="noopener noreferrer" style={lnk}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(0,200,180,1)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(0,200,180,0.75)'}>▸ GITHUB ↗</a>
            <a href={live} target="_blank" rel="noopener noreferrer" style={lnk}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(0,200,180,1)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(0,200,180,0.75)'}>▸ LIVE ↗</a>
          </div>
        </div>
      ))}

      <div style={{padding:'1.25rem 1.25rem 1.55rem',border:'1px solid rgba(0,140,255,0.1)',background:'rgba(0,15,40,0.5)'}}>
        <p style={{...mono,fontSize:'0.55rem',color:'rgba(0,185,255,0.35)',letterSpacing:'0.45em',textTransform:'uppercase',marginBottom:'0.9rem'}}>Réseau &amp; Systèmes</p>
        <div style={{display:'grid',gap:'0.45rem'}}>
          {netItems.map(item=>(
            <p key={item} style={{...body,color:'rgba(200,220,255,0.55)',fontSize:'0.82rem',display:'flex',gap:'0.5rem'}}>
              <span style={{color:'rgba(0,200,180,0.45)',flexShrink:0}}>▸</span>{item}
            </p>
          ))}
        </div>
      </div>

      {(onOpenRapport || onOpenVeille) && (
        <div style={{marginTop:'0.25rem',display:'grid',gap:'0.6rem'}}>
          {onOpenRapport && (
            <button onClick={onOpenRapport} style={lnk}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(0,200,180,1)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(0,200,180,0.75)'}>
              ▸ RAPPORT DE FABRICATION ↗
            </button>
          )}
          {onOpenVeille && (
            <button onClick={onOpenVeille} style={lnk}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(0,200,180,1)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(0,200,180,0.75)'}>
              ▸ VEILLE TECHNOLOGIQUE ↗
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function PContact({ onOpenCV }: { onOpenCV?: () => void }) {
  const l=[
    {h:'mailto:coline.derycke@gmail.com',    t:'coline.derycke@gmail.com'},
    {h:'https://github.com/Mephery',          t:'GitHub · Mephery'},
    {h:'https://www.linkedin.com/in/coline-derycke-51956a2ab/', t:'LinkedIn · Coline Derycke'},
  ];
  const lnk: CSSProperties = {...mono,fontSize:'0.68rem',letterSpacing:'0.3em',color:'rgba(0,185,255,0.75)',textDecoration:'none'};
  return <>
    <p style={{...body,marginBottom:'2rem'}}>Apprentie développeuse passionnée par le code, l'infra et la sécurité, j'aime construire des systèmes complets, du serveur au frontend. Actuellement en BTS SIO SLAM 1ère année en alternance, je recherche une <strong style={{color:'rgba(0,185,255,0.85)'}}>alternance à partir de septembre 2027</strong> dans le cadre d'une poursuite d'études (école d'ingénieur ou MIAGE).</p>
    {l.map(({h,t})=><div key={t} style={{marginBottom:'0.8rem'}}><a href={h} target="_blank" rel="noopener noreferrer" style={lnk} onMouseEnter={e=>e.currentTarget.style.color='rgba(255,50,80,0.9)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(0,185,255,0.75)'}>▸ {t.toUpperCase()}</a></div>)}
    {onOpenCV && <div style={{marginTop:'0.8rem'}}><button onClick={onOpenCV} style={{...lnk,background:'none',border:'none',cursor:'pointer',padding:0}} onMouseEnter={e=>e.currentTarget.style.color='rgba(255,50,80,0.9)'} onMouseLeave={e=>e.currentTarget.style.color='rgba(0,185,255,0.75)'}>▸ CURRICULUM VITAE ↗</button></div>}
  </>;
}

const PANELS = [PAbout, PCompany, PChaos, PSkills, PExperience, PSchool, PContact];

// ─────────────────────────────────────────────────────────────────
// DETAIL PANEL : slide depuis la droite
// ─────────────────────────────────────────────────────────────────

// Applique une transparence à '#hex' ou 'rgba(...)'
function withAlpha(col: string, a: number): string {
  const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  if (col.startsWith('#')) {
    const h = col.slice(1);
    const x3 = h.length === 3;
    const r = parseInt(x3 ? h[0]+h[0] : h.slice(0,2), 16);
    const g = parseInt(x3 ? h[1]+h[1] : h.slice(2,4), 16);
    const b = parseInt(x3 ? h[2]+h[2] : h.slice(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return col;
}
function DetailPanel({ secIdx, open, onClose, onOpenCV, onOpenRapport, onOpenVeille, onOpenDat }: { secIdx:number; open:boolean; onClose:()=>void; onOpenCV:()=>void; onOpenRapport:()=>void; onOpenVeille:()=>void; onOpenDat:()=>void }) {
  const s = SECTIONS[secIdx];
  const PC = PANELS[secIdx];

  const [scanKey,        setScanKey]        = useState(0);
  const [contentVisible, setContentVisible] = useState(false);
  const [sessionTime,    setSessionTime]    = useState('');

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setScanKey(k => k + 1);
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      setSessionTime(`${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`);
      const t = setTimeout(() => setContentVisible(true), 380);
      return () => { clearTimeout(t); document.body.style.overflow = 'auto'; };
    } else {
      setContentVisible(false);
      document.body.style.overflow = 'auto';
    }
  }, [open]);

  const colors = [
    'rgba(0,185,255,0.85)',
    'rgba(0,140,255,0.85)',
    'rgba(140,60,255,0.85)',
    'rgba(255,50,80,0.85)',
    'rgba(255,110,40,0.85)',
    'rgba(0,200,180,0.85)',
    '#ddeeff',
  ];
  const activeColor = colors[secIdx] || 'rgba(0,185,255,0.85)';
  const isMobile = useIsMobile();
  const wa = (a: number) => withAlpha(activeColor, a);

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:40, background:'rgba(0,1,5,0.45)', backdropFilter:'blur(4px)' }} />
      )}

      <div style={{
        position:'fixed', top:0, right:0, height:'100vh',
        width: isMobile ? 'min(95vw,680px)' : 'min(52vw,680px)',
        background:`linear-gradient(rgba(0,4,16,0.96),rgba(0,4,16,0.96)),linear-gradient(rgba(0,185,255,0.03) 50%,rgba(0,0,0,0) 50%)`,
        backgroundSize:'100% 100%,100% 4px',
        backdropFilter:'blur(24px)',
        borderLeft:`2px solid ${activeColor}`,
        boxShadow: open ? `-15px 0 45px rgba(0,8,32,0.85),inset 1px 0 10px ${wa(0.13)}` : 'none',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform 0.48s cubic-bezier(0.16,1,0.3,1)',
        zIndex:50, display:'flex', flexDirection:'column',
      }}>

        {/* Zone principale : référent pour les éléments absolus */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', display:'flex', flexDirection:'column' }}>

          {/* Scan line horizontale : une seule fois à l'ouverture */}
          {open && (
            <div key={scanKey} style={{
              position:'absolute', left:0, right:0, top:0, height:2,
              background:`linear-gradient(90deg,transparent,${activeColor},transparent)`,
              boxShadow:`0 0 14px ${wa(0.60)}`,
              animation:'panelScan 0.65s ease-out forwards',
              pointerEvents:'none', zIndex:10,
            }} />
          )}

          {/* Cornières HUD */}
          <div style={{position:'absolute',top:22,left:22,width:14,height:14,borderTop:`1px solid ${wa(0.28)}`,borderLeft:`1px solid ${wa(0.28)}`}} />
          <div style={{position:'absolute',bottom:22,left:22,width:14,height:14,borderBottom:`1px solid ${wa(0.28)}`,borderLeft:`1px solid ${wa(0.28)}`}} />
          <div style={{position:'absolute',bottom:22,right:22,width:14,height:14,borderBottom:`1px solid ${wa(0.28)}`,borderRight:`1px solid ${wa(0.28)}`}} />

          {/* Bouton Fermer */}
          <button onClick={onClose} style={{
            position:'absolute', top:22, right: isMobile ? '1.5rem' : '3rem', zIndex:5,
            background:'rgba(0,12,32,0.6)', border:`1px solid ${wa(0.28)}`, color:activeColor,
            ...mono, fontSize:'0.58rem', letterSpacing:'0.35em', padding:'6px 14px',
            cursor:'pointer', transition:'all 0.2s', boxShadow:`0 0 10px ${wa(0.08)}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,30,60,0.15)'; e.currentTarget.style.borderColor='rgba(255,50,80,0.85)'; e.currentTarget.style.color='#ff3250'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(0,12,32,0.6)'; e.currentTarget.style.borderColor=wa(0.28); e.currentTarget.style.color=activeColor; }}>
            ⏱ ABORT_SESSION // ✕
          </button>

          {/* Zone scrollable avec numéros de ligne */}
          <div style={{
            flex:1, overflowY:'auto',
            padding: isMobile ? '4.5rem 1.5rem 1.5rem' : '5.5rem 3rem 1.5rem',
            display:'flex', gap:'1rem',
          }}>

            {/* Numéros de ligne décoratifs */}
            {!isMobile && (
              <div style={{
                display:'flex', flexDirection:'column', gap:'1.52rem',
                pointerEvents:'none', userSelect:'none', flexShrink:0, paddingTop:'0.1rem',
                opacity: contentVisible ? 1 : 0, transition:'opacity 0.6s ease',
              }}>
                {Array.from({length:24}, (_, i) => (
                  <span key={i} style={{ fontFamily:'monospace', fontSize:'0.4rem', color: wa(0.22), letterSpacing:'0.05em', lineHeight:1 }}>
                    {String(i+1).padStart(2,'0')}
                  </span>
                ))}
              </div>
            )}

            {/* Contenu principal avec fade-in */}
            <div style={{
              flex:1,
              opacity: contentVisible ? 1 : 0,
              transform: contentVisible ? 'translateY(0)' : 'translateY(10px)',
              transition:'opacity 0.4s ease, transform 0.4s ease',
            }}>

              {/* Badge CONNEXION ÉTABLIE */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.2rem' }}>
                <div style={{
                  width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background:activeColor, boxShadow:`0 0 8px ${activeColor}`,
                  animation:'statusPulse 2s ease-in-out infinite',
                }} />
                <span style={{ ...mono, fontSize:'0.48rem', letterSpacing:'0.7em', color: wa(0.55), textTransform:'uppercase' }}>
                  CONNEXION ÉTABLIE
                </span>
              </div>

              <p style={{ ...mono, fontSize:'0.58rem', letterSpacing:'0.7em', color: wa(0.42), marginBottom:'0.6rem', textTransform:'uppercase', textShadow:`0 0 12px ${wa(0.5)}` }}>
                DATA_STREAM // {s.num} ——
              </p>
              <h2 style={{ fontSize:'clamp(1.6rem,3vw,2.4rem)', fontWeight:700, color:'#ddeeff', marginBottom:'0.5rem', lineHeight:1.1, letterSpacing:'-0.02em', textShadow:`0 0 18px ${wa(0.6)}, 0 0 46px ${wa(0.24)}` }}>
                {s.title}
              </h2>
              <p style={{ ...mono, fontSize:'0.65rem', color:'rgba(0,185,255,0.45)', letterSpacing:'0.35em', marginBottom:'2.5rem', textTransform:'uppercase', textShadow:`0 0 11px ${wa(0.42)}` }}>
                {s.tagline}
              </p>

              <div style={{ borderTop:`1px dashed ${wa(0.15)}`, paddingTop:'2rem' }}>
                {secIdx === 6 ? <PContact onOpenCV={onOpenCV} /> : secIdx === 5 ? <PSchool onOpenRapport={onOpenRapport} onOpenVeille={onOpenVeille} /> : secIdx === 2 ? <PChaos onOpenDat={onOpenDat} /> : <PC />}
              </div>
            </div>
          </div>
        </div>

        {/* Footer metadata */}
        <div style={{
          padding: isMobile ? '0.65rem 1.5rem' : '0.65rem 3rem',
          borderTop:`1px solid ${wa(0.10)}`,
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0,
          opacity: contentVisible ? 1 : 0, transition:'opacity 0.5s ease 0.2s',
        }}>
          <span style={{ ...mono, fontSize:'0.4rem', color: wa(0.32), letterSpacing:'0.38em', textTransform:'uppercase' }}>
            SESSION · {sessionTime}
          </span>
          <span style={{ ...mono, fontSize:'0.4rem', color: wa(0.32), letterSpacing:'0.38em', textTransform:'uppercase' }}>
            NODE {s.num} / {String(N_SEC).padStart(2,'0')}
          </span>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// TERMINAL
// ─────────────────────────────────────────────────────────────────
function processCmd(raw: string): { lines: string[]; action?: 'clear'|'close'|'cv'|'rapport'|'veille'|'dat' } {
  const parts = raw.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const arg   = parts[1] ?? '';
  switch (cmd) {
    case 'help': return { lines: [
      '  whoami            → identité',
      '  ls                → sections du portfolio',
      '  cat cv.txt        → ouvrir le CV',
      '  cat rapport.txt   → rapport de fabrication',
      '  cat veille.txt    → veille technologique',
      '  cat dat.txt       → architecture Chaos (DAT)',
      '  cat about.txt     → à propos',
      '  cat chaos.txt     → projet Chaos',
      '  ping hc.fr        → infos alternance',
      '  breach            → ???',
      '  clear             → vider le terminal',
      '  exit              → fermer  [ESC]',
    ]};
    case 'whoami': return { lines: [
      'Coline Derycke - Dev · Infra · Sécu',
      'BTS SIO SLAM · alternance @ Human\'s Connexion (Toulouse)',
      '→ coline.derycke@gmail.com',
    ]};
    case 'ls': return { lines: [
      'total 7',
      'drwxr-xr-x  01_about/    02_company/    03_chaos/',
      'drwxr-xr-x  04_skills/   05_experience/ 06_school/',
      'drwxr-xr-x  07_contact/',
      '-rw-r--r--  cv.txt   rapport.txt   veille.txt   dat.txt   about.txt   chaos.txt',
    ]};
    case 'cat':
      if (!arg)              return { lines: ['usage : cat <fichier>'] };
      if (arg==='cv.txt')       return { lines: ['[Ouverture du CV…]'],                    action:'cv' };
      if (arg==='rapport.txt')  return { lines: ['[Ouverture du rapport de fabrication…]'], action:'rapport' };
      if (arg==='veille.txt')   return { lines: ['[Ouverture de la veille technologique…]'], action:'veille' };
      if (arg==='dat.txt')      return { lines: ['[Ouverture du schéma d\'architecture (DAT)…]'], action:'dat' };
      if (arg==='about.txt') return { lines: [
        'Développeuse passionnée par le code, l\'infra et la sécurité.',
        'J\'aime construire des systèmes complets, du serveur au frontend.',
        'Actuellement en BTS SIO SLAM 2ème année (alternance).',
        'Recherche alternance à partir de septembre 2027.',
        '→ École d\'ingénieur ou MIAGE',
      ]};
      if (arg==='chaos.txt') return { lines: [
        '╔══ CHAOS - Chat communautaire chiffré ══╗',
        '  Infra  : Proxmox · 2 LXC (dev/prod) · Docker · Nginx',
        '  Back   : Node.js · PostgreSQL · WebRTC · Double Ratchet E2EE',
        '  Front  : HTML/CSS/JS → React + Tailwind (Talos)',
        '  Sécu   : XSS/SQLi · hachage · OAuth Google',
        '→ https://chaos.colinederycke-portfolio.com/',
      ]};
      return { lines: [`cat: ${arg}: No such file or directory`] };
    case 'ping':
      if (arg.includes('hc') || arg.includes('human')) return { lines: [
        `PING hc.fr - Human's Connexion (Toulouse)`,
        'Poste    : Technicienne systèmes & réseaux',
        'Missions : AD · Cloud Microsoft · Infogérance · Sécu réseau',
        'Durée    : 2025 → en cours (alternance BTS SIO)',
        '64 bytes from hc.fr : connexion établie.',
      ]};
      return { lines: [`ping: ${arg||'...'}: Name or service not known`] };
    case 'breach': return { lines: [
      '[ VOODOO BOYS - BREACH PROTOCOL ]',
      'ICE détecté. Séquence d\'activation requise.',
      '',
      '  ↑ ↑ ↓ ↓ ← → ← → B A',
      '',
      '[ Entre la séquence sur ton clavier… ]',
    ]};
    case 'clear': return { lines: [], action:'clear' };
    case 'exit':  return { lines: [], action:'close' };
    case '':      return { lines: [] };
    default:      return { lines: [`bash: ${cmd}: command not found - tape 'help'`] };
  }
}

type TermLine = { type:'cmd'|'out'; text:string };

const TERM_CMDS  = ['about.txt','breach','cat','chaos.txt','clear','cv.txt','dat.txt','exit','help','ls','ping','rapport.txt','veille.txt','whoami'];
const CAT_FILES  = ['cv.txt','rapport.txt','veille.txt','dat.txt','about.txt','chaos.txt'];
const PING_HOSTS = ['hc.fr'];

function Terminal({ onClose, onOpenCV, onOpenRapport, onOpenVeille, onOpenDat }: { onClose:()=>void; onOpenCV:()=>void; onOpenRapport:()=>void; onOpenVeille:()=>void; onOpenDat:()=>void }) {
  const [history, setHistory] = useState<TermLine[]>([
    { type:'out', text:'╔══════════════════════════════════════════╗' },
    { type:'out', text:'║  CYBERSPACE TERMINAL  v1.0.0              ║' },
    { type:'out', text:'║  tape  "help"  pour voir les commandes    ║' },
    { type:'out', text:'╚══════════════════════════════════════════╝' },
  ]);
  const [input,   setInput]   = useState('');
  const [cmdHist, setCmdHist] = useState<string[]>([]);
  const [hIdx,    setHIdx]    = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [history]);

  const submit = () => {
    const raw = input.trim();
    const cmdLine: TermLine = { type:'cmd', text:`coline@cyberspace:~$ ${raw}` };
    const { lines, action } = processCmd(raw);

    if (action === 'clear') { setHistory([]);  setInput(''); return; }
    if (action === 'close') { onClose();                     return; }

    setHistory(h => [...h, cmdLine, ...lines.map(t=>({ type:'out' as const, text:t }))]);
    if (raw) setCmdHist(h => [raw, ...h]);
    setHIdx(-1);
    setInput('');
    if (action === 'cv')      setTimeout(onOpenCV,      280);
    if (action === 'rapport') setTimeout(onOpenRapport, 280);
    if (action === 'veille')  setTimeout(onOpenVeille,  280);
    if (action === 'dat')     setTimeout(onOpenDat,     280);
  };

  const onKD = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { submit(); return; }
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.split(' ');
      const cmd   = parts[0].toLowerCase();
      if (parts.length === 1) {
        const matches = TERM_CMDS.filter(c => c.startsWith(cmd));
        if (matches.length === 1) setInput(matches[0] + (matches[0].endsWith('.txt') ? '' : ' '));
        else if (matches.length > 1) setHistory(h => [...h, { type:'out', text: matches.join('  ') }]);
      } else if (cmd === 'cat') {
        const partial = parts[1] ?? '';
        const matches = CAT_FILES.filter(f => f.startsWith(partial));
        if (matches.length === 1) setInput('cat ' + matches[0]);
        else if (matches.length > 1) setHistory(h => [...h, { type:'out', text: matches.join('  ') }]);
      } else if (cmd === 'ping') {
        const partial = parts[1] ?? '';
        const matches = PING_HOSTS.filter(h => h.startsWith(partial));
        if (matches.length === 1) setInput('ping ' + matches[0]);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const n = Math.min(hIdx+1, cmdHist.length-1);
      setHIdx(n); setInput(cmdHist[n]??'');
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const n = Math.max(hIdx-1, -1);
      setHIdx(n); setInput(n<0?'':cmdHist[n]);
    }
  };

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, height:'44vh',
      background:'rgba(0,2,8,0.97)', backdropFilter:'blur(20px)',
      borderBottom:'2px solid rgba(0,185,255,0.28)',
      boxShadow:'0 8px 60px rgba(0,185,255,0.14)',
      display:'flex', flexDirection:'column',
      animation:'termSlideDown 0.32s cubic-bezier(0.16,1,0.3,1)',
      fontFamily:'monospace' }}>

      {/* Barre titre */}
      <div style={{ padding:'0.42rem 1rem', borderBottom:'1px solid rgba(0,185,255,0.1)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,185,255,0.03)' }}>
        <span style={{ fontSize:'0.55rem', letterSpacing:'0.5em', color:'rgba(0,185,255,0.55)', textTransform:'uppercase' }}>
          ▸ CYBERSPACE TERMINAL : coline@cyberspace:~
        </span>
        <button onClick={onClose}
          style={{ background:'none', border:'none', color:'rgba(0,185,255,0.4)', cursor:'pointer', fontFamily:'monospace', fontSize:'0.52rem', letterSpacing:'0.35em', textTransform:'uppercase' }}
          onMouseEnter={e=>e.currentTarget.style.color='rgba(255,50,80,0.85)'}
          onMouseLeave={e=>e.currentTarget.style.color='rgba(0,185,255,0.4)'}>
          [ESC] ✕
        </button>
      </div>

      {/* Output */}
      <div onClick={()=>inputRef.current?.focus()}
        style={{ flex:1, overflowY:'auto', padding:'0.6rem 1.2rem', cursor:'text' }}>
        {history.map((line,i) => (
          <div key={i} style={{ fontSize:'0.7rem', lineHeight:1.75,
            color: line.type==='cmd' ? '#ddeeff' : 'rgba(0,185,255,0.82)',
            whiteSpace:'pre', fontFamily:'monospace' }}>
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Saisie */}
      <div style={{ padding:'0.4rem 1.2rem', borderTop:'1px solid rgba(0,185,255,0.1)', display:'flex', alignItems:'center', gap:'0.6rem' }}>
        <span style={{ fontSize:'0.7rem', color:'rgba(0,185,255,0.55)', whiteSpace:'nowrap' }}>coline@cyberspace:~$</span>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKD}
          style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:'monospace', fontSize:'0.7rem', color:'#ddeeff', caretColor:'rgba(0,185,255,0.9)' }}
          autoComplete="off" spellCheck={false} autoCapitalize="none" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CV MODAL
// ─────────────────────────────────────────────────────────────────
function CVModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  useEscapeClose(open, onClose);
  if (!open) return null;
  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(0,1,5,0.65)', backdropFilter:'blur(8px)' }} />

      {/* Panneau centré */}
      <div style={{ position:'fixed', inset:0, zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem', pointerEvents:'none' }}>
        <div style={{ pointerEvents:'auto', width:'100%', maxWidth:620, maxHeight:'90vh', display:'flex', flexDirection:'column',
          background:'rgba(0,4,16,0.97)', border:'1px solid rgba(0,185,255,0.2)',
          boxShadow:'0 0 60px rgba(0,185,255,0.1), 0 0 120px rgba(0,185,255,0.04)',
          backdropFilter:'blur(24px)', position:'relative' }}>

          {/* Coins HUD */}
          {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} p={p} />)}

          {/* En-tête */}
          <div style={{ padding:'1.5rem 2rem 1rem', borderBottom:'1px solid rgba(0,185,255,0.08)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.7em', color:'rgba(0,185,255,0.35)', textTransform:'uppercase', marginBottom:'0.3rem' }}>DATA_STREAM // 08 ——</p>
              <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#ddeeff', letterSpacing:'-0.02em' }}>Curriculum Vitae</h2>
              <p style={{ ...mono, fontSize:'0.58rem', color:'rgba(0,185,255,0.4)', letterSpacing:'0.4em', textTransform:'uppercase', marginTop:'0.2rem' }}>Coline Derycke</p>
            </div>
            <button onClick={onClose}
              style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.35em', textTransform:'uppercase', padding:'0.3rem 0.7rem', cursor:'pointer', color:'rgba(0,185,255,0.55)', background:'rgba(0,12,32,0.6)', border:'1px solid rgba(0,185,255,0.2)', transition:'all 0.2s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.9)',borderColor:'rgba(255,30,60,0.4)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.55)',borderColor:'rgba(0,185,255,0.2)'})}>
              ✕ FERMER
            </button>
          </div>

          {/* Preview */}
          <div style={{ flex:1, overflowY:'auto', padding:'1.5rem 2rem' }}>
            {imgError ? (
              <div style={{ textAlign:'center', padding:'4rem 2rem', color:'rgba(0,185,255,0.4)', fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.3em' }}>
                [ CV bientôt disponible ]
              </div>
            ) : (
              <img src={`${import.meta.env.BASE_URL}CV.png`} alt="CV de Coline Derycke"
                onError={() => setImgError(true)}
                style={{ width:'100%', height:'auto', display:'block', border:'1px solid rgba(0,185,255,0.08)' }} />
            )}
          </div>

          {/* Footer téléchargement */}
          <div style={{ padding:'1rem 2rem 1.5rem', borderTop:'1px solid rgba(0,185,255,0.08)', display:'flex', justifyContent:'flex-end' }}>
            <a href={`${import.meta.env.BASE_URL}CV.pdf`} download="CV_Coline_Derycke.pdf"
              style={{ ...mono, fontSize:'0.58rem', letterSpacing:'0.4em', textTransform:'uppercase', padding:'0.5rem 1.2rem', color:'rgba(0,185,255,0.85)', background:'rgba(0,8,22,0.7)', border:'1px solid rgba(0,140,255,0.28)', textDecoration:'none', transition:'all 0.25s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(0,185,255,0.6)',boxShadow:'0 0 18px rgba(0,185,255,0.2)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.85)',borderColor:'rgba(0,140,255,0.28)',boxShadow:'none'})}>
              ↓ TÉLÉCHARGER PDF
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

const BREACH_MSG = [
  'IDENTIFICANT : Coline Derycke · Netrunner',
  'STATUT       : BTS SIO SLAM · Alternance active',
  'CLEARANCE    : VOODOO BOYS [ACCORDÉ]',
  '',
  'Tu viens de trouver la backdoor.',
  'Bonne pioche ! Peu de gens vont aussi loin.',
].join('\n');

function BreachModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase,    setPhase]    = useState(0);
  const [hexLines, setHexLines] = useState<string[]>([]);
  const [msgChars, setMsgChars] = useState(0);

  useEffect(() => {
    if (!open) { setPhase(0); setHexLines([]); setMsgChars(0); return; }
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 1100);
    const t3 = setTimeout(() => setPhase(3), 3200);
    return () => { [t1,t2,t3].forEach(clearTimeout); };
  }, [open]);

  useEffect(() => {
    if (phase !== 2) return;
    const gen = () => Array.from({length:20}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0').toUpperCase()).join(' ');
    const iv = setInterval(() => setHexLines(p => [...p.slice(-9), gen()]), 95);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase < 3) return;
    const iv = setInterval(() => setMsgChars(n => {
      if (n >= BREACH_MSG.length) { clearInterval(iv); return n; }
      return n + 2;
    }), 38);
    return () => clearInterval(iv);
  }, [phase]);

  if (!open) return null;

  const red  = 'rgba(255,30,55,0.9)';
  const red2 = 'rgba(255,30,55,0.35)';
  const dim  = 'rgba(255,30,55,0.18)';

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,2,0.97)', fontFamily:'monospace', cursor:'pointer', overflow:'hidden',
      animation:'breachFlicker 3s ease infinite' }}>

      {/* Scanlines rouges */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,20,40,0.028) 2px,rgba(255,20,40,0.028) 3px)' }} />

      {/* Coins rouges */}
      {(['tl','tr','bl','br'] as const).map(p => {
        const s: CSSProperties = { position:'absolute', width:32, height:32, borderColor:red2, borderStyle:'solid', borderTopWidth:0, borderRightWidth:0, borderBottomWidth:0, borderLeftWidth:0 };
        if (p==='tl') { s.top=24; s.left=24; s.borderTopWidth=2; s.borderLeftWidth=2; }
        if (p==='tr') { s.top=24; s.right=24; s.borderTopWidth=2; s.borderRightWidth=2; }
        if (p==='bl') { s.bottom=24; s.left=24; s.borderBottomWidth=2; s.borderLeftWidth=2; }
        if (p==='br') { s.bottom=24; s.right=24; s.borderBottomWidth=2; s.borderRightWidth=2; }
        return <div key={p} style={s} />;
      })}

      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'1.2rem', padding:'2rem', maxWidth:640, margin:'0 auto' }}>

        {/* En-tête */}
        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:'0.45rem', letterSpacing:'0.9em', color:dim, marginBottom:'0.6rem' }}>[ VOODOO BOYS NETWORK · ACCÈS NON AUTORISÉ ]</p>
          <h1 style={{ fontSize:'clamp(1.8rem,5vw,3rem)', fontWeight:900, letterSpacing:'0.05em', color:red, textShadow:`0 0 40px rgba(255,30,55,0.5)` }}>BREACH PROTOCOL</h1>
          <p style={{ fontSize:'0.42rem', letterSpacing:'0.7em', color:red2, marginTop:'0.3rem' }}>V . 2 0 7 7</p>
        </div>

        {/* Phase 1 : barre de progression */}
        {phase >= 1 && phase < 3 && (
          <div style={{ width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.48rem', letterSpacing:'0.4em', color:red2, marginBottom:'0.4rem' }}>
              <span>CONTOURNEMENT ICE</span>
              <span>{phase >= 2 ? '██ EN COURS' : '▌ INIT...'}</span>
            </div>
            <div style={{ width:'100%', height:3, background:'rgba(255,30,55,0.12)', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%', background:`linear-gradient(90deg,${dim},${red})`,
                boxShadow:`0 0 12px rgba(255,30,55,0.6)`,
                animation:'breachBar 2s ease forwards' }} />
            </div>
          </div>
        )}

        {/* Phase 2 : cascade hex */}
        {phase === 2 && (
          <pre style={{ fontSize:'0.52rem', color:'rgba(255,30,55,0.28)', lineHeight:1.6, letterSpacing:'0.1em', userSelect:'none', width:'100%', maxWidth:480, overflow:'hidden' }}>
            {hexLines.join('\n')}
          </pre>
        )}

        {/* Phase 3 : message */}
        {phase >= 3 && (
          <div style={{ width:'100%', maxWidth:480 }}>
            <p style={{ fontSize:'0.55rem', letterSpacing:'0.6em', color:'rgba(0,255,140,0.7)', marginBottom:'1.2rem', textShadow:'0 0 18px rgba(0,255,140,0.4)' }}>
              ██ ICE DÉFAIT · ACCÈS ACCORDÉ
            </p>
            <pre style={{ fontSize:'0.72rem', color:'rgba(255,200,200,0.75)', lineHeight:1.8, whiteSpace:'pre-wrap', letterSpacing:'0.01em' }}>
              {BREACH_MSG.slice(0, msgChars)}
              <span style={{ animation:'scrollHintPulse 0.8s ease infinite' }}>▌</span>
            </pre>
          </div>
        )}

        <p style={{ position:'absolute', bottom:'1.8rem', fontSize:'0.42rem', letterSpacing:'0.55em', color:'rgba(255,30,55,0.2)', textTransform:'uppercase' }}>
          Cliquer pour fermer
        </p>
      </div>
    </div>
  );
}

function RapportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  useEscapeClose(open, onClose);
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(0,1,5,0.65)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'fixed', inset:0, zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem', pointerEvents:'none' }}>
        <div style={{ pointerEvents:'auto', width:'100%', maxWidth:620, maxHeight:'90vh', display:'flex', flexDirection:'column',
          background:'rgba(0,4,16,0.97)', border:'1px solid rgba(0,200,180,0.2)',
          boxShadow:'0 0 60px rgba(0,200,180,0.08), 0 0 120px rgba(0,200,180,0.03)',
          backdropFilter:'blur(24px)', position:'relative' }}>
          {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} p={p} />)}
          <div style={{ padding:'1.5rem 2rem 1rem', borderBottom:'1px solid rgba(0,200,180,0.08)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.7em', color:'rgba(0,200,180,0.35)', textTransform:'uppercase', marginBottom:'0.3rem' }}>DATA_STREAM // 09 ——</p>
              <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#ddeeff', letterSpacing:'-0.02em' }}>Rapport de fabrication</h2>
              <p style={{ ...mono, fontSize:'0.58rem', color:'rgba(0,200,180,0.4)', letterSpacing:'0.4em', textTransform:'uppercase', marginTop:'0.2rem' }}>BTS SIO · Portfolio</p>
            </div>
            <button onClick={onClose}
              style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.35em', textTransform:'uppercase', padding:'0.3rem 0.7rem', cursor:'pointer', color:'rgba(0,200,180,0.55)', background:'rgba(0,12,32,0.6)', border:'1px solid rgba(0,200,180,0.2)', transition:'all 0.2s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.9)',borderColor:'rgba(255,30,60,0.4)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,200,180,0.55)',borderColor:'rgba(0,200,180,0.2)'})}>
              ✕ FERMER
            </button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'1.5rem 2rem' }}>
            {imgError ? (
              <div style={{ textAlign:'center', padding:'4rem 2rem', color:'rgba(0,200,180,0.4)', fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.3em' }}>
                [ Rapport bientôt disponible ]
              </div>
            ) : (
              <img src={`${import.meta.env.BASE_URL}rapport.png`} alt="Rapport de fabrication"
                onError={() => setImgError(true)}
                style={{ width:'100%', height:'auto', display:'block', border:'1px solid rgba(0,200,180,0.08)' }} />
            )}
          </div>
          <div style={{ padding:'1rem 2rem 1.5rem', borderTop:'1px solid rgba(0,200,180,0.08)', display:'flex', justifyContent:'flex-end' }}>
            <a href={`${import.meta.env.BASE_URL}rapport.pdf`} download="Rapport_Fabrication_Coline_Derycke.pdf"
              style={{ ...mono, fontSize:'0.58rem', letterSpacing:'0.4em', textTransform:'uppercase', padding:'0.5rem 1.2rem', color:'rgba(0,200,180,0.85)', background:'rgba(0,8,22,0.7)', border:'1px solid rgba(0,200,180,0.28)', textDecoration:'none', transition:'all 0.25s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(0,200,180,0.6)',boxShadow:'0 0 18px rgba(0,200,180,0.2)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,200,180,0.85)',borderColor:'rgba(0,200,180,0.28)',boxShadow:'none'})}>
              ↓ TÉLÉCHARGER PDF
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function VeilleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  useEscapeClose(open, onClose);
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(0,1,5,0.65)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'fixed', inset:0, zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem', pointerEvents:'none' }}>
        <div style={{ pointerEvents:'auto', width:'100%', maxWidth:620, maxHeight:'90vh', display:'flex', flexDirection:'column',
          background:'rgba(0,4,16,0.97)', border:'1px solid rgba(0,200,180,0.2)',
          boxShadow:'0 0 60px rgba(0,200,180,0.08), 0 0 120px rgba(0,200,180,0.03)',
          backdropFilter:'blur(24px)', position:'relative' }}>
          {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} p={p} />)}
          <div style={{ padding:'1.5rem 2rem 1rem', borderBottom:'1px solid rgba(0,200,180,0.08)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.7em', color:'rgba(0,200,180,0.35)', textTransform:'uppercase', marginBottom:'0.3rem' }}>DATA_STREAM // 10 ——</p>
              <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#ddeeff', letterSpacing:'-0.02em' }}>Veille technologique</h2>
              <p style={{ ...mono, fontSize:'0.58rem', color:'rgba(0,200,180,0.4)', letterSpacing:'0.4em', textTransform:'uppercase', marginTop:'0.2rem' }}>BTS SIO · Portfolio</p>
            </div>
            <button onClick={onClose}
              style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.35em', textTransform:'uppercase', padding:'0.3rem 0.7rem', cursor:'pointer', color:'rgba(0,200,180,0.55)', background:'rgba(0,12,32,0.6)', border:'1px solid rgba(0,200,180,0.2)', transition:'all 0.2s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.9)',borderColor:'rgba(255,30,60,0.4)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,200,180,0.55)',borderColor:'rgba(0,200,180,0.2)'})}>
              ✕ FERMER
            </button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'1.5rem 2rem' }}>
            {imgError ? (
              <div style={{ textAlign:'center', padding:'4rem 2rem', color:'rgba(0,200,180,0.4)', fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.3em' }}>
                [ Veille bientôt disponible ]
              </div>
            ) : (
              <img src={`${import.meta.env.BASE_URL}veille.webp`} alt="Veille technologique"
                onError={() => setImgError(true)}
                style={{ width:'100%', height:'auto', display:'block', border:'1px solid rgba(0,200,180,0.08)' }} />
            )}
          </div>
          <div style={{ padding:'1rem 2rem 1.5rem', borderTop:'1px solid rgba(0,200,180,0.08)', display:'flex', justifyContent:'flex-end' }}>
            <a href={`${import.meta.env.BASE_URL}veille.pdf`} download="Veille_Technologique_Coline_Derycke.pdf"
              style={{ ...mono, fontSize:'0.58rem', letterSpacing:'0.4em', textTransform:'uppercase', padding:'0.5rem 1.2rem', color:'rgba(0,200,180,0.85)', background:'rgba(0,8,22,0.7)', border:'1px solid rgba(0,200,180,0.28)', textDecoration:'none', transition:'all 0.25s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(0,200,180,0.6)',boxShadow:'0 0 18px rgba(0,200,180,0.2)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(0,200,180,0.85)',borderColor:'rgba(0,200,180,0.28)',boxShadow:'none'})}>
              ↓ TÉLÉCHARGER PDF
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function DatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  useEscapeClose(open, onClose);
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(0,1,5,0.65)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'fixed', inset:0, zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem', pointerEvents:'none' }}>
        <div style={{ pointerEvents:'auto', width:'100%', maxWidth:620, maxHeight:'90vh', display:'flex', flexDirection:'column',
          background:'rgba(0,4,16,0.97)', border:'1px solid rgba(255,60,80,0.2)',
          boxShadow:'0 0 60px rgba(255,40,70,0.08), 0 0 120px rgba(255,40,70,0.03)',
          backdropFilter:'blur(24px)', position:'relative' }}>
          {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} p={p} />)}
          <div style={{ padding:'1.5rem 2rem 1rem', borderBottom:'1px solid rgba(255,60,80,0.08)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.7em', color:'rgba(255,130,145,0.35)', textTransform:'uppercase', marginBottom:'0.3rem' }}>DATA_STREAM // 10 ——</p>
              <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'#ddeeff', letterSpacing:'-0.02em' }}>Architecture · DAT</h2>
              <p style={{ ...mono, fontSize:'0.58rem', color:'rgba(255,130,145,0.4)', letterSpacing:'0.4em', textTransform:'uppercase', marginTop:'0.2rem' }}>Projet Chaos</p>
            </div>
            <button onClick={onClose}
              style={{ ...mono, fontSize:'0.5rem', letterSpacing:'0.35em', textTransform:'uppercase', padding:'0.3rem 0.7rem', cursor:'pointer', color:'rgba(255,130,145,0.55)', background:'rgba(0,12,32,0.6)', border:'1px solid rgba(255,60,80,0.2)', transition:'all 0.2s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.9)',borderColor:'rgba(255,30,60,0.4)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,130,145,0.55)',borderColor:'rgba(255,60,80,0.2)'})}>
              ✕ FERMER
            </button>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'1.5rem 2rem' }}>
            {imgError ? (
              <div style={{ textAlign:'center', padding:'4rem 2rem', color:'rgba(255,130,145,0.4)', fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.3em' }}>
                [ Schéma bientôt disponible ]
              </div>
            ) : (
              <img src={`${import.meta.env.BASE_URL}dat.png`} alt="Dossier d'architecture technique du projet Chaos"
                onError={() => setImgError(true)}
                style={{ width:'100%', height:'auto', display:'block', border:'1px solid rgba(255,60,80,0.08)' }} />
            )}
          </div>
          <div style={{ padding:'1rem 2rem 1.5rem', borderTop:'1px solid rgba(255,60,80,0.08)', display:'flex', justifyContent:'flex-end' }}>
            <a href={`${import.meta.env.BASE_URL}dat.png`} download="DAT_Chaos_Coline_Derycke.png"
              style={{ ...mono, fontSize:'0.58rem', letterSpacing:'0.4em', textTransform:'uppercase', padding:'0.5rem 1.2rem', color:'rgba(255,130,145,0.85)', background:'rgba(22,0,8,0.7)', border:'1px solid rgba(255,60,80,0.28)', textDecoration:'none', transition:'all 0.25s' }}
              onMouseEnter={e=>Object.assign(e.currentTarget.style,{color:'#fff',borderColor:'rgba(255,60,80,0.6)',boxShadow:'0 0 18px rgba(255,40,70,0.2)'})}
              onMouseLeave={e=>Object.assign(e.currentTarget.style,{color:'rgba(255,130,145,0.85)',borderColor:'rgba(255,60,80,0.28)',boxShadow:'none'})}>
              ↓ TÉLÉCHARGER PNG
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────
export default function PortfolioMain({ onBack }: { onBack?: () => void }) {
  const zoneRef        = useRef<HTMLDivElement>(null);
  const scrollRef      = useRef<ScrollData>({ section:0, progress:0 });
  const targetProgRef  = useRef(0);
  const virtualProgRef = useRef(0);
  const isMobile       = useIsMobile();

  const [active,    setActive]    = useState(0);
  const [sp,        setSp]        = useState(0);
  const [totalProg, setTotalProg] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelSec,  setPanelSec]  = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [lightMode,   setLightMode]   = useState(false);
  const [cvOpen,      setCvOpen]      = useState(false);
  const [rapportOpen, setRapportOpen] = useState(false);
  const [veilleOpen,  setVeilleOpen]  = useState(false);
  const [datOpen,     setDatOpen]     = useState(false);
  const [breachOpen,  setBreachOpen]  = useState(false);
  const [termOpen,    setTermOpen]    = useState(false);
  const termOpenRef  = useRef(false);
  const panelOpenRef = useRef(false);
  const lightModeRef = useRef(false);
  const konamiIdxRef = useRef(0);
  useEffect(() => { termOpenRef.current  = termOpen;  }, [termOpen]);
  useEffect(() => { panelOpenRef.current = panelOpen; }, [panelOpen]);
  useEffect(() => { lightModeRef.current = lightMode; }, [lightMode]);

  const scrollToSection = useCallback((i: number) => {
    // +0.5 = atterrir au milieu : texte pleinement visible (fade-in terminé à sp>0.16)
    targetProgRef.current = (i + 0.5) / N_SEC;
    // Sur touch : met aussi à jour le scroll natif pour que la scrollbar soit cohérente
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      const zone = zoneRef.current;
      if (!zone) return;
      const totalScroll = zone.offsetHeight - window.innerHeight;
      window.scrollTo({ top: zone.offsetTop + targetProgRef.current * totalScroll, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'auto';
    let lastHashIdx = -1;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Applique un progrès (0-1) : met à jour scrollRef (Three.js) + état React (UI)
    const applyProg = (prog: number) => {
      const raw     = prog * N_SEC;
      const idx     = Math.min(N_SEC-1, Math.floor(raw));
      const secProg = raw - idx;
      scrollRef.current = { section:idx, progress:secProg };
      if (prog > 0.01) setHasScrolled(true);
      setActive(idx);
      setSp(secProg);
      setTotalProg(prog);
      if (idx !== lastHashIdx) { lastHashIdx = idx; history.replaceState(null,'','#'+SECTIONS[idx].id); }
    };

    const getNativeProg = () => {
      const zone = zoneRef.current;
      if (!zone) return 0;
      const rect   = zone.getBoundingClientRect();
      const scroll = zone.offsetHeight - window.innerHeight;
      return Math.max(0, Math.min(1, -rect.top / scroll));
    };

    // Scroll natif → aligne targetProg (touch : source principale ; desktop : scrollbar/clavier)
    const onScroll = () => {
      if (lightModeRef.current) return; // version lite : scroll natif, pas de scroll-jacking
      const prog = getNativeProg();
      targetProgRef.current = prog;
      if (isTouch) { virtualProgRef.current = prog; applyProg(prog); }
    };

    // Desktop : intercepte la molette → virtual scroll (touch génère touchmove, pas wheel)
    const onWheel = (e: WheelEvent) => {
      if (lightModeRef.current) return; // version lite : laisse la molette scroller la page nativement
      if (isTouch) return;
      if (panelOpenRef.current) return; // laisse le panneau gérer son propre scroll
      e.preventDefault();
      const zone = zoneRef.current;
      if (!zone) return;
      const scrollablePx = zone.offsetHeight - window.innerHeight;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 18;               // lignes → pixels
      if (e.deltaMode === 2) dy *= window.innerHeight; // pages  → pixels
      targetProgRef.current = Math.max(0, Math.min(1, targetProgRef.current + dy / scrollablePx));
    };

    // Boucle rAF desktop : inertie fluide à 60fps → pilote scrollRef + React state en continu
    let rafId = 0;
    if (!isTouch) {
      let lastUIUpdate = 0;
      const tick = () => {
        const curr  = virtualProgRef.current;
        const tgt   = targetProgRef.current;
        const delta = tgt - curr;
        if (Math.abs(delta) > 0.000002) {
          const next    = curr + delta * 0.10;
          virtualProgRef.current = next;
          // scrollRef à chaque frame (Three.js en a besoin)
          const raw     = next * N_SEC;
          const idx     = Math.min(N_SEC-1, Math.floor(raw));
          const secProg = raw - idx;
          scrollRef.current = { section:idx, progress:secProg };
          // React state à ~30fps : libère le thread JS pour le rendu 3D
          const now = performance.now();
          if (now - lastUIUpdate > 32) {
            lastUIUpdate = now;
            if (next > 0.01) setHasScrolled(true);
            setActive(idx);
            setSp(secProg);
            setTotalProg(next);
            if (idx !== lastHashIdx) { lastHashIdx = idx; history.replaceState(null,'','#'+SECTIONS[idx].id); }
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') { e.preventDefault(); setTermOpen(p => !p); return; }
      if (e.key === KONAMI[konamiIdxRef.current]) {
        konamiIdxRef.current++;
        if (konamiIdxRef.current === KONAMI.length) { konamiIdxRef.current = 0; setBreachOpen(true); }
      } else {
        konamiIdxRef.current = e.key === KONAMI[0] ? 1 : 0;
      }
      if (termOpenRef.current) return;
      if (panelOpenRef.current) { if (e.key === 'Escape') setPanelOpen(false); return; }
      if (lightModeRef.current) return; // version lite : flèches = scroll natif du navigateur
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); scrollToSection(Math.min(N_SEC-1, scrollRef.current.section + 1)); }
      if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  { e.preventDefault(); scrollToSection(Math.max(0,          scrollRef.current.section - 1)); }
    };

    window.addEventListener('scroll',  onScroll, { passive:true  });
    window.addEventListener('wheel',   onWheel,  { passive:false });
    window.addEventListener('keydown', onKey);
    const hash    = window.location.hash.slice(1);
    const hashIdx = SECTIONS.findIndex(s => s.id === hash);
    if (hashIdx !== -1) setTimeout(() => scrollToSection(hashIdx), 100);
    return () => {
      document.body.style.overflow = 'hidden';
      window.removeEventListener('scroll',  onScroll);
      window.removeEventListener('wheel',   onWheel);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (lightMode) return (
    <>
      <LightMode onBack={onBack} onHeavy={() => setLightMode(false)} onOpenCV={() => setCvOpen(true)} onOpenRapport={() => setRapportOpen(true)} onOpenVeille={() => setVeilleOpen(true)} onOpenDat={() => setDatOpen(true)} />
      <CVModal open={cvOpen} onClose={() => setCvOpen(false)} />
      <RapportModal open={rapportOpen} onClose={() => setRapportOpen(false)} />
      <VeilleModal open={veilleOpen} onClose={() => setVeilleOpen(false)} />
      <DatModal open={datOpen} onClose={() => setDatOpen(false)} />
      <BreachModal open={breachOpen} onClose={() => setBreachOpen(false)} />
      {termOpen && <Terminal onClose={() => setTermOpen(false)} onOpenCV={() => setCvOpen(true)} onOpenRapport={() => setRapportOpen(true)} onOpenVeille={() => setVeilleOpen(true)} onOpenDat={() => setDatOpen(true)} />}
    </>
  );

  return (
    <div style={{ background:'#000208' }}>

      {/* Canvas fixe - aria-hidden : purement décoratif, les lecteurs d'écran l'ignorent */}
      <div aria-hidden="true" style={{ position:'fixed', inset:0, zIndex:0 }}>
        <Canvas camera={{ position:[0,0,5], fov:72 }}
          gl={{ antialias:false, alpha:false }}
          dpr={[1, 1.5]}
          onCreated={({ gl }) => gl.setClearColor(0x000208, 1)}>
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
          {!isMobile && <div style={{ position:'absolute', top:22, left:54, ...mono, fontSize:'0.52rem', letterSpacing:'0.55em', color:'rgba(0,185,255,0.28)', textTransform:'uppercase', pointerEvents:'none' }}>
            CYBERSPACE ▸ NODE 7743 ▸ {SECTIONS[active].num}
          </div>}

          {/* Indicateur scroll initial */}
          <div style={{
            position:'absolute', bottom:'12vh', left:'50%',
            opacity: hasScrolled ? 0 : 1,
            transition: hasScrolled ? 'opacity 0.6s ease' : 'none',
            animation: hasScrolled ? 'none' : 'scrollHintFadeIn 0.8s ease 1.4s both, scrollHintBounce 1.6s ease-in-out 2.2s infinite',
            pointerEvents:'none', textAlign:'center',
          }}>
            <div style={{ fontFamily:'monospace', fontSize:'0.68rem', letterSpacing:'0.65em', color:'rgba(0,185,255,0.7)', textTransform:'uppercase', marginBottom:'0.6rem', animation: hasScrolled ? 'none' : 'scrollHintPulse 2s ease-in-out 2.2s infinite' }}>
              SCROLL
            </div>
            <div style={{ color:'rgba(0,185,255,0.7)', fontSize:'1.4rem', lineHeight:1, animation: hasScrolled ? 'none' : 'scrollHintPulse 2s ease-in-out 2.2s infinite' }}>↓</div>
          </div>

          {/* Contenu section courante */}
          <SectionText
            section={SECTIONS[active]}
            sp={sp}
            onOpen={() => { setPanelSec(active); setPanelOpen(true); }}
          />

          {/* Boutons HUD haut-droit */}
          <div style={{ position:'absolute', top:22, right: isMobile ? 12 : 54, display:'flex', gap:'0.4rem', zIndex:10 }}>
            <button onClick={() => setTermOpen(t => !t)}
              style={{ fontFamily:'monospace', fontSize:'0.52rem', letterSpacing:'0.35em', textTransform:'uppercase', padding:'0.28rem 0.65rem', cursor:'pointer', color: termOpen ? 'rgba(0,185,255,0.95)' : 'rgba(0,185,255,0.5)', background: termOpen ? 'rgba(0,185,255,0.08)' : 'rgba(0,8,22,0.55)', backdropFilter:'blur(4px)', border:`1px solid ${termOpen ? 'rgba(0,185,255,0.4)' : 'rgba(0,140,255,0.16)'}`, transition:'all 0.2s' }}
              onMouseEnter={e => Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.95)',borderColor:'rgba(0,185,255,0.4)'})}
              onMouseLeave={e => { if (!termOpen) Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.5)',borderColor:'rgba(0,140,255,0.16)'}); }}>
              {'>'}_ CLI
            </button>
            <button onClick={() => setLightMode(true)}
              style={{ fontFamily:'monospace', fontSize:'0.52rem', letterSpacing:'0.45em', textTransform:'uppercase', padding:'0.28rem 0.65rem', cursor:'pointer', color:'rgba(0,185,255,0.5)', background:'rgba(0,8,22,0.55)', backdropFilter:'blur(4px)', border:'1px solid rgba(0,140,255,0.16)', transition:'all 0.2s' }}
              onMouseEnter={e => Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.95)',borderColor:'rgba(0,185,255,0.4)'})}
              onMouseLeave={e => Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.5)',borderColor:'rgba(0,140,255,0.16)'})}>
              LITE
            </button>
            {onBack && (
              <button onClick={onBack}
                style={{ fontFamily:'monospace', fontSize:'0.52rem', letterSpacing:'0.45em', textTransform:'uppercase', padding:'0.28rem 0.65rem', cursor:'pointer', color:'rgba(0,185,255,0.5)', background:'rgba(0,8,22,0.55)', backdropFilter:'blur(4px)', border:'1px solid rgba(0,140,255,0.16)', transition:'all 0.2s' }}
                onMouseEnter={e => Object.assign(e.currentTarget.style,{color:'rgba(255,50,80,0.9)',borderColor:'rgba(255,30,60,0.38)'})}
                onMouseLeave={e => Object.assign(e.currentTarget.style,{color:'rgba(0,185,255,0.5)',borderColor:'rgba(0,140,255,0.16)'})}>
                ← ACCUEIL
              </button>
            )}
          </div>

          {/* Timeline en bas */}
          <Timeline active={active} total={totalProg} onJump={scrollToSection} />

        </div>
      </div>

      {/* Panel détail */}
      <DetailPanel secIdx={panelSec} open={panelOpen} onClose={() => setPanelOpen(false)} onOpenCV={() => setCvOpen(true)} onOpenRapport={() => setRapportOpen(true)} onOpenVeille={() => setVeilleOpen(true)} onOpenDat={() => setDatOpen(true)} />

      {/* CV modal */}
      <CVModal open={cvOpen} onClose={() => setCvOpen(false)} />

      {/* Rapport modal */}
      <RapportModal open={rapportOpen} onClose={() => setRapportOpen(false)} />

      {/* Veille modal */}
      <VeilleModal open={veilleOpen} onClose={() => setVeilleOpen(false)} />

      {/* DAT modal */}
      <DatModal open={datOpen} onClose={() => setDatOpen(false)} />

      {/* Breach easter egg */}
      <BreachModal open={breachOpen} onClose={() => setBreachOpen(false)} />

      {/* Terminal */}
      {termOpen && <Terminal onClose={() => setTermOpen(false)} onOpenCV={() => setCvOpen(true)} onOpenRapport={() => setRapportOpen(true)} onOpenVeille={() => setVeilleOpen(true)} onOpenDat={() => setDatOpen(true)} />}

    </div>
  );
}
