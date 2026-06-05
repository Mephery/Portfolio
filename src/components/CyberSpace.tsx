import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

// ────────────────────────────────────────────────────
// SHADER ÉTOILES + NŒUDS
// ────────────────────────────────────────────────────
const CosmicNodeShader = {
  uniforms: {
    uTime:   { value: 0 },
    uMouse:  { value: new THREE.Vector2(-10, -10) },
    uBreath: { value: 0.5 },
    uGlitch: { value: 0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uBreath;
    uniform float uGlitch;
    attribute float aSize;
    attribute float aType;
    attribute float aRnd;
    varying float vFocus;
    varying float vType;
    varying float vPulse;
    varying float vPhase;
    varying float vWave;

    float h(float n) { return fract(sin(n) * 43758.5453); }

    // Value noise 2D — interpolation entre valeurs aléatoires, aucune structure directionnelle
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i+vec2(1,0)), u.x),
                 mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y);
    }

    void main() {
      vec3 pos = position;
      vType  = aType;
      vPhase = aRnd * 6.28318;

      float wt = uTime * 0.38;
      float w1 = sin(pos.x * 0.52 + pos.y * 0.30 + wt)       * 0.20;
      float w2 = sin(pos.y * 0.68 - pos.x * 0.38 + wt * 0.72) * 0.12;
      float w3 = cos(pos.x * 0.30 + pos.y * 0.50 + wt * 0.55) * 0.10;
      float waveSum = w1 + w2 + w3;
      pos.z += waveSum * 1.2;
      pos.x += w1 * 0.15;
      pos.y += w2 * 0.10;
      // Value noise multi-couches — taches aléatoires, aucune direction
      float n1 = vnoise(pos.xy * 0.75 + vec2(uTime * 0.11,  uTime * 0.08));
      float n2 = vnoise(pos.xy * 1.8  + vec2(-uTime * 0.07, uTime * 0.14));
      float spatial  = n1 * 0.62 + n2 * 0.38;
      float personal = 0.5 + 0.5 * sin(uTime * (0.15 + aRnd * 0.3) + aRnd * 9.74);
      vWave = mix(spatial, personal, 0.25);

      if (uGlitch > 0.01 && aType > 0.5) {
        pos.x += (h(aRnd + floor(uTime * 15.0)) - 0.5) * uGlitch * 0.28;
        pos.y += (h(aRnd * 2.3 + floor(uTime * 12.0)) - 0.5) * uGlitch * 0.12;
      }

      vec4 projected = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      vec2 screenPos = projected.xy / projected.w;
      float dist     = distance(screenPos, uMouse);
      float factor   = max(0.0, 1.0 - dist / 0.40);
      vFocus = factor;

      if (factor > 0.0) {
        vec2 toMouse = uMouse - screenPos;
        if (aType > 0.5) {
          pos.xy += toMouse * factor * 0.10 * 3.5;
          pos.z  -= factor * 0.14;
          float ripple = sin(dist * 12.0 - uTime * 5.0)
                       * max(0.0, 1.0 - dist / 0.40) * 0.09;
          pos.z += ripple;
        } else {
          float ripple = sin(dist * 10.0 - uTime * 4.0)
                       * max(0.0, 1.0 - dist / 0.50) * 0.05;
          pos.z += ripple;
        }
      }

      vPulse = 0.5 + 0.5 * sin(uTime * (0.48 + aRnd * 1.4) + vPhase);

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;

      float breathScale = 0.82 + uBreath * 0.18;
      float sizeBonus   = aType > 0.5 ? factor * 0.17 + vPulse * 0.007 : factor * 0.06;
      gl_PointSize = (aSize + sizeBonus) * breathScale * (250.0 / -mv.z);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uBreath;
    uniform float uGlitch;
    varying float vFocus;
    varying float vType;
    varying float vPulse;
    varying float vPhase;
    varying float vWave;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;

      float twinkle = sin(uTime * 1.4 + vPhase) * 0.38 + 0.62;
      float sparkle = max(0.0, sin(uTime * 3.8 + vPhase * 2.1)) * 0.28;
      float waveLum = 0.62 + vWave * 0.38;
      float breath  = 0.78 + uBreath * 0.22;
      float halo    = smoothstep(0.5,  0.06, d);
      float core    = smoothstep(0.18, 0.0,  d);

      vec3  col;
      float alpha;

      if (vType < 0.5) {
        col   = mix(vec3(0.0, 0.72, 1.0), vec3(1.0), 0.44);
        alpha = halo * (0.28 + sparkle * 0.40 + vFocus * 0.45) * twinkle * waveLum * breath;
      } else if (vType < 1.5) {
        col   = mix(vec3(0.0, 0.72, 1.0), vec3(0.88, 0.96, 1.0), vFocus * 0.9);
        alpha = (halo * (0.14 + vPulse * 0.15 + vFocus * 0.52)
               + core * (0.42 + vFocus * 0.58)) * waveLum * breath;
      } else {
        col   = mix(vec3(1.0, 0.05, 0.18), vec3(1.0, 0.52, 0.58), vFocus * 0.85);
        alpha = (halo * (0.18 + vPulse * 0.16 + vFocus * 0.48)
               + core * (0.48 + vFocus * 0.52)) * waveLum * breath;
      }

      // Flash glitch : les nœuds réseau clignotent en blanc-rouge intense
      float isNode    = step(0.5, vType);
      float glitchAmt = isNode * smoothstep(0.2, 0.9, uGlitch);
      col   = mix(col, vec3(1.0, 0.18, 0.28), glitchAmt * 0.9);
      alpha = min(1.0, alpha + isNode * glitchAmt * (halo * 0.7 + core * 1.2));

      gl_FragColor = vec4(col, alpha);
    }
  `
};

// ─────────────────────────────────────────────────────────────────
// SHADER LIGNES DE CONNEXION
// ─────────────────────────────────────────────────────────────────
const CosmicLineShader = {
  uniforms: {
    uTime:   { value: 0 },
    uMouse:  { value: new THREE.Vector2(-10, -10) },
    uBreath: { value: 0.5 },
  },
  vertexShader: `
    uniform float uTime;
    uniform vec2  uMouse;
    varying float vFocus;

    float lh2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float lvnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(lh2(i), lh2(i+vec2(1,0)), u.x),
                 mix(lh2(i+vec2(0,1)), lh2(i+vec2(1,1)), u.x), u.y);
    }
    varying vec3  vWorldPos;
    varying float vWave;

    void main() {
      vec3 pos = position;
      vWorldPos = position;

      float wt = uTime * 0.38;
      float w1 = sin(pos.x * 0.52 + pos.y * 0.30 + wt)        * 0.20;
      float w2 = sin(pos.y * 0.68 - pos.x * 0.38 + wt * 0.72) * 0.12;
      float w3 = cos(pos.x * 0.30 + pos.y * 0.50 + wt * 0.55) * 0.10;
      pos.z += (w1 + w2 + w3) * 1.2;
      pos.x += w1 * 0.15;
      pos.y += w2 * 0.10;
      float ln1 = lvnoise(pos.xy * 0.75 + vec2(uTime * 0.11,  uTime * 0.08));
      float ln2 = lvnoise(pos.xy * 1.8  + vec2(-uTime * 0.07, uTime * 0.14));
      vWave = ln1 * 0.62 + ln2 * 0.38;

      vec4 projected = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      vec2 screenPos = projected.xy / projected.w;
      float dist = distance(screenPos, uMouse);
      vFocus = max(0.0, 1.0 - dist / 0.40);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uBreath;
    varying float vFocus;
    varying vec3  vWorldPos;
    varying float vWave;

    void main() {
      float pulse = sin(vWorldPos.x * 2.5 + vWorldPos.y * 2.5 + uTime * 1.4);
      pulse = smoothstep(0.80, 0.98, pulse);

      float breath  = 0.78 + uBreath * 0.22;
      float waveLum = 0.65 + vWave * 0.35;
      vec3  col     = mix(vec3(0.0, 0.10, 0.38), vec3(0.0, 0.65, 1.0), pulse * 0.55);
      col = mix(col, vec3(0.82, 0.95, 1.0), vFocus);

      float alpha = (0.022 + pulse * 0.13 + vFocus * 0.65) * waveLum * breath;
      gl_FragColor = vec4(col, alpha);
    }
  `
};

// ─────────────────────────────────────────────────────────────────
// TUNNEL HYPERESPACE V2
// Tubes spiralés + anneaux + ondulation dynamique + glitch flash
// ─────────────────────────────────────────────────────────────────
function HyperspaceTunnel({ isDiving, diveProgress }: {
  isDiving: boolean;
  diveProgress: { current: number };
}) {
  // ── Matériau tubes spiralés ──────────────────────────────────────
  const tubeMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `
      uniform float uProgress;
      uniform float uTime;
      attribute float aPhase;
      varying float vAlpha;
      varying float vDepth;
      varying float vPhase;
      void main() {
        vec3 pos = position;
        vPhase = aPhase;
        float r = length(pos.xy);
        if (r > 0.01) {
          vec2 radialDir = normalize(pos.xy);
          vec2 perpDir   = vec2(-radialDir.y, radialDir.x);
          // Ondulation perpendiculaire qui grandit avec la vitesse
          float w1 = sin(uTime * 2.1 + aPhase + pos.z * 0.20) * uProgress * 0.30;
          float w2 = cos(uTime * 1.3 + aPhase * 1.7 + pos.z * 0.13) * uProgress * 0.18;
          pos.xy += perpDir * w1 * r + radialDir * w2 * r;
        }
        vec4 mv     = modelViewMatrix * vec4(pos, 1.0);
        vDepth      = -mv.z;
        float fade  = smoothstep(40.0, 0.8, vDepth);
        vAlpha      = uProgress * uProgress * fade;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uProgress;
      varying float vAlpha;
      varying float vDepth;
      varying float vPhase;
      void main() {
        if (vAlpha < 0.005) discard;
        float shimmer = 0.55 + 0.45 * sin(vDepth * 1.1 - uTime * (4.0 + uProgress * 7.0));
        // Glitch flash aléatoire : certains tubes s'illuminent brièvement
        float g = fract(sin(vPhase * 127.3 + floor(uTime * 14.0) * 74.9) * 43758.5);
        float glitch = step(0.91, g) * uProgress;
        vec3  col = mix(vec3(0.04, 0.72, 1.0), vec3(0.85, 0.97, 1.0), glitch * 0.9);
        gl_FragColor = vec4(col, min(1.0, vAlpha * shimmer * (0.8 + glitch * 1.4)));
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── Matériau anneaux ─────────────────────────────────────────────
  const ringMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `
      uniform float uProgress;
      uniform float uTime;
      attribute float aInitZ;
      attribute float aRingR;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        // Les anneaux avancent vers la caméra en boucle
        float speed   = 0.4 + aRingR * 0.06;
        float travel  = uTime * speed * uProgress * 12.0;
        float range   = 38.0;
        pos.z = mod(aInitZ + travel + 34.0, range) - 34.0;
        // Légère oscillation radiale
        float pulse = 1.0 + 0.06 * sin(uTime * 3.0 + aRingR);
        pos.xy *= pulse;
        vec4 mv   = modelViewMatrix * vec4(pos, 1.0);
        float d   = -mv.z;
        float far  = smoothstep(40.0, 2.0, d);
        float near = smoothstep(0.3, 2.5, d); // s'évanouit quand ça passe la caméra
        vAlpha    = uProgress * uProgress * far * near * 0.55;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        if (vAlpha < 0.005) discard;
        gl_FragColor = vec4(0.08, 0.78, 1.0, vAlpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  // ── Géométrie tubes : spirale pré-calculée + courbure aléatoire ──
  const { tubePos, tubePhases } = useMemo(() => {
    const RINGS  = 5;
    const SPOKES = 28;
    const SEGS   = 14;
    const radii  = [0.22, 0.65, 1.35, 2.4, 3.8];
    const Z_NEAR = 4.0;
    const Z_FAR  = -34.0;
    const totalVerts = RINGS * SPOKES * SEGS * 2;
    const pos    = new Float32Array(totalVerts * 3);
    const phases = new Float32Array(totalVerts);
    let vi = 0;

    for (let r = 0; r < RINGS; r++) {
      const radius = radii[r];
      for (let s = 0; s < SPOKES; s++) {
        const baseAngle = (s / SPOKES) * Math.PI * 2 + r * 0.22;
        const phase     = Math.random() * Math.PI * 2;
        const bendAmt   = (0.06 + Math.random() * 0.14) * radius;

        for (let seg = 0; seg < SEGS; seg++) {
          for (const t of [seg / SEGS, (seg + 1) / SEGS]) {
            const z = Z_NEAR + (Z_FAR - Z_NEAR) * t;
            // Spirale : l'angle tourne au fil de la profondeur
            const spiralAngle = baseAngle + z * (-0.055);
            // Courbure latérale sinusoïdale (ondulation statique)
            const bend = Math.sin(phase + z * 0.15) * bendAmt;
            const perpX = -Math.sin(spiralAngle);
            const perpY =  Math.cos(spiralAngle);
            pos[vi*3]     = Math.cos(spiralAngle) * radius + perpX * bend;
            pos[vi*3 + 1] = Math.sin(spiralAngle) * radius + perpY * bend;
            pos[vi*3 + 2] = z;
            phases[vi]    = phase;
            vi++;
          }
        }
      }
    }
    return { tubePos: pos, tubePhases: phases };
  }, []);

  // ── Géométrie anneaux : cercles à diverses profondeurs ───────────
  const { ringPos, ringInitZs, ringRs } = useMemo(() => {
    const RING_COUNT = 14;
    const PTS        = 52;
    const totalVerts = RING_COUNT * PTS * 2;
    const pos   = new Float32Array(totalVerts * 3);
    const initZ = new Float32Array(totalVerts);
    const rrs   = new Float32Array(totalVerts);
    let vi = 0;

    for (let r = 0; r < RING_COUNT; r++) {
      const z      = -1.5 - r * 2.4;
      const radius = 0.3 + Math.random() * 4.0;
      for (let p = 0; p < PTS; p++) {
        const a0 = (p / PTS) * Math.PI * 2;
        const a1 = ((p + 1) / PTS) * Math.PI * 2;
        pos[vi*3]=Math.cos(a0)*radius; pos[vi*3+1]=Math.sin(a0)*radius; pos[vi*3+2]=z;
        initZ[vi]=z; rrs[vi]=radius; vi++;
        pos[vi*3]=Math.cos(a1)*radius; pos[vi*3+1]=Math.sin(a1)*radius; pos[vi*3+2]=z;
        initZ[vi]=z; rrs[vi]=radius; vi++;
      }
    }
    return { ringPos: pos, ringInitZs: initZ, ringRs: rrs };
  }, []);

  useFrame(({ clock }) => {
    if (!isDiving) return;
    const t = clock.getElapsedTime();
    tubeMat.uniforms.uProgress.value = diveProgress.current;
    tubeMat.uniforms.uTime.value     = t;
    ringMat.uniforms.uProgress.value = diveProgress.current;
    ringMat.uniforms.uTime.value     = t;
  });

  if (!isDiving) return null;

  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[tubePos,    3]} />
          <bufferAttribute attach="attributes-aPhase"   args={[tubePhases, 1]} />
        </bufferGeometry>
        <primitive object={tubeMat} />
      </lineSegments>

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[ringPos,    3]} />
          <bufferAttribute attach="attributes-aInitZ"   args={[ringInitZs, 1]} />
          <bufferAttribute attach="attributes-aRingR"   args={[ringRs,     1]} />
        </bufferGeometry>
        <primitive object={ringMat} />
      </lineSegments>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// CYBERCOSMOS — génération de la scène
// ─────────────────────────────────────────────────────────────────
function CyberCosmos({ diveProgress }: { diveProgress: { current: number } }) {
  const nodeMat = useMemo(() => new THREE.ShaderMaterial({ ...CosmicNodeShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const lineMat = useMemo(() => new THREE.ShaderMaterial({ ...CosmicLineShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const groupRef = useRef<THREE.Group>(null);

  const TOTAL     = 2600;
  const NET_COUNT = 300;
  const MAX_DIST  = 1.35;

  const { positions, sizes, types, rnds, linePositions } = useMemo(() => {
    const pos  = new Float32Array(TOTAL * 3);
    const sz   = new Float32Array(TOTAL);
    const type = new Float32Array(TOTAL);
    const rnd  = new Float32Array(TOTAL);

    const anchors = [
      [ 5.8,  3.2,  0.0], [-5.8,  3.2,  0.0],
      [ 5.8, -3.2,  0.0], [-5.8, -3.2,  0.0],
      [ 6.2,  0.0,  0.2], [-6.2,  0.0,  0.2],
      [ 0.0,  3.4, -0.3], [ 0.0, -3.4, -0.3],
      [ 3.5,  2.2,  0.3], [-3.5,  2.2,  0.3],
      [ 3.5, -2.2,  0.3], [-3.5, -2.2,  0.3],
      [ 0.0,  0.0,  0.0], [ 1.8,  0.8, -0.2], [-1.8, -0.8, -0.2],
    ];

    for (let i = 0; i < TOTAL; i++) {
      if (i < NET_COUNT) {
        if (i < NET_COUNT * 0.65) {
          const a = anchors[Math.floor(Math.random() * anchors.length)];
          pos[i*3]   = a[0] + (Math.random()-0.5) * 2.8;
          pos[i*3+1] = a[1] + (Math.random()-0.5) * 1.8;
          pos[i*3+2] = a[2] + (Math.random()-0.5) * 1.0;
        } else {
          pos[i*3]   = (Math.random()-0.5) * 13;
          pos[i*3+1] = (Math.random()-0.5) *  7.5;
          pos[i*3+2] = (Math.random()-0.5) *  2.0;
        }
        const isHot = Math.random() < 0.11;
        type[i] = isHot ? 2 : 1;
        sz[i]   = isHot
          ? Math.random() * 0.040 + 0.090
          : Math.random() * 0.050 + 0.048;
      } else {
        const deep = Math.random() < 0.45; // 45% étoiles lointaines en fond
        pos[i*3]   = (Math.random()-0.5) * (deep ? 32 : 22);
        pos[i*3+1] = (Math.random()-0.5) * (deep ? 20 : 14);
        pos[i*3+2] = deep
          ? -(4 + Math.random() * 11)   // fond : z de -4 à -15
          : (Math.random()-0.5) * 5;    // premier plan : z de -2.5 à +2.5
        type[i] = 0;
        sz[i] = deep
          ? Math.random() * 0.009 + 0.007  // minuscules, très loin
          : Math.random() * 0.018 + 0.014;
      }
      rnd[i] = Math.random();
    }

    const lines: number[] = [];
    for (let i = 0; i < NET_COUNT; i++) {
      for (let j = i+1; j < NET_COUNT; j++) {
        const dx = pos[i*3]-pos[j*3], dy = pos[i*3+1]-pos[j*3+1], dz = pos[i*3+2]-pos[j*3+2];
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < MAX_DIST) {
          lines.push(pos[i*3],pos[i*3+1],pos[i*3+2], pos[j*3],pos[j*3+1],pos[j*3+2]);
        }
      }
    }

    return { positions: pos, sizes: sz, types: type, rnds: rnd, linePositions: new Float32Array(lines) };
  }, []);

  const glitchClock = useRef(4 + Math.random() * 5);
  const glitchVal   = useRef(0);

  useFrame(({ clock, pointer }, delta) => {
    const t      = clock.getElapsedTime();
    const breath = 0.5 + 0.5 * Math.sin(t * 0.45);

    nodeMat.uniforms.uTime.value   = t;
    nodeMat.uniforms.uMouse.value.copy(pointer);
    nodeMat.uniforms.uBreath.value = breath;
    lineMat.uniforms.uTime.value   = t;
    lineMat.uniforms.uMouse.value.copy(pointer);
    lineMat.uniforms.uBreath.value = breath;

    glitchClock.current -= delta;
    if (glitchClock.current <= 0) {
      glitchVal.current   = glitchVal.current > 0 ? 0 : 0.5 + Math.random() * 0.8;
      glitchClock.current = glitchVal.current > 0 ? 0.08+Math.random()*0.28 : 1.5+Math.random()*4.5;
    }
    nodeMat.uniforms.uGlitch.value = glitchVal.current;

    if (diveProgress.current > 0.01 && groupRef.current) {
      groupRef.current.position.z = diveProgress.current * diveProgress.current * 15;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <primitive object={lineMat} />
      </lineSegments>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions,  3]} />
          <bufferAttribute attach="attributes-aSize"    args={[sizes,      1]} />
          <bufferAttribute attach="attributes-aType"    args={[types,      1]} />
          <bufferAttribute attach="attributes-aRnd"     args={[rnds,       1]} />
        </bufferGeometry>
        <primitive object={nodeMat} />
      </points>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
// CAMERA RIG — plongée hyperespace
// ─────────────────────────────────────────────────────────────────
function CameraRig({
  isDiving, diveProgress, onDiveComplete, onProgress,
}: {
  isDiving: boolean;
  diveProgress: { current: number };
  onDiveComplete: () => void;
  onProgress: (p: number) => void;
}) {
  const done = useRef(false);
  useFrame(({ camera }, delta) => {
    if (!isDiving || done.current) return;
    diveProgress.current = Math.min(1, diveProgress.current + delta * 0.45);
    const p = diveProgress.current;
    onProgress(p);
    camera.position.z = 5 - p * 35;
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 72 + p * 58;
    cam.updateProjectionMatrix();
    if (p >= 1 && !done.current) { done.current = true; onDiveComplete(); }
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────
export default function CyberSpace({ onDiveComplete }: { onDiveComplete?: () => void } = {}) {
  const [isDiving, setIsDiving]     = useState(false);
  const [showFlash, setShowFlash]   = useState(false);
  const [loadingPct, setLoadingPct] = useState(0);
  const diveProgress = useRef(0);

  function handleDive() { setIsDiving(true); diveProgress.current = 0; }
  function handleDiveComplete() {
    setShowFlash(true);
    setTimeout(() => { setShowFlash(false); onDiveComplete?.(); }, 700);
  }

  return (
    <div className="absolute inset-0 w-screen h-screen overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 45% 52%, #001133 0%, #000510 38%, #000208 100%)' }}>

      {showFlash && (
        <div className="absolute inset-0 z-50 pointer-events-none"
          style={{ background:'radial-gradient(ellipse at center,rgba(0,160,255,0.85) 0%,#000208 65%)', animation:'cyberFlash 0.8s ease-out forwards' }} />
      )}

      <Canvas camera={{ position:[0, 0, 5], fov:72 }} gl={{ antialias:true, alpha:false }}
        style={{ background:'transparent' }}>
        <fog attach="fog" args={['#000208', 16, 38]} />

        <CameraRig
          isDiving={isDiving}
          diveProgress={diveProgress}
          onDiveComplete={handleDiveComplete}
          onProgress={p => setLoadingPct(Math.round(p * 100))}
        />
        <CyberCosmos diveProgress={diveProgress} />
        <HyperspaceTunnel isDiving={isDiving} diveProgress={diveProgress} />

        <EffectComposer>
          <Bloom intensity={1.8} luminanceThreshold={0.15} luminanceSmoothing={0.70} mipmapBlur />
        </EffectComposer>
      </Canvas>

      {/* Overlay — pointer-events:none container, auto sur contenu */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
        style={{ pointerEvents:'none' }}>

        {/* Intro text */}
        <div className="text-center select-none"
          style={{ opacity: isDiving ? 0 : 1, transition:'opacity 0.4s ease', pointerEvents: isDiving ? 'none' : 'auto' }}>

          <p className="font-mono text-[10px] tracking-[0.7em] uppercase mb-4"
            style={{ color:'rgba(0,170,255,0.4)' }}>
            CYBERSPACE ▸ NODE 7743 ▸ ONLINE
          </p>

          <h1 className="font-bold tracking-tighter mb-1 leading-none"
            style={{ fontSize:'clamp(3rem,8vw,6rem)', color:'#ddeeff',
              textShadow:'0 0 80px rgba(0,150,255,0.28), 0 0 20px rgba(0,80,200,0.25)' }}>
            Coline Derycke
          </h1>

          <p className="font-mono text-xs tracking-[0.55em] uppercase mb-12"
            style={{ color:'rgba(0,185,255,0.5)' }}>
            DEV · INFRA · SÉCURITÉ
          </p>

          <button onClick={handleDive}
            className="font-mono text-xs tracking-[0.45em] uppercase px-10 py-3 cursor-pointer"
            style={{ color:'rgba(0,185,255,0.85)', border:'1px solid rgba(0,155,255,0.28)',
              background:'rgba(0,8,22,0.65)', backdropFilter:'blur(6px)',
              boxShadow:'0 0 25px rgba(0,100,255,0.06)', transition:'all 0.28s ease' }}
            onMouseEnter={e => Object.assign(e.currentTarget.style,{
              color:'rgba(255,50,80,0.95)', borderColor:'rgba(255,20,50,0.5)',
              background:'rgba(28,0,8,0.65)', boxShadow:'0 0 40px rgba(255,15,45,0.14)' })}
            onMouseLeave={e => Object.assign(e.currentTarget.style,{
              color:'rgba(0,185,255,0.85)', borderColor:'rgba(0,155,255,0.28)',
              background:'rgba(0,8,22,0.65)', boxShadow:'0 0 25px rgba(0,100,255,0.06)' })}>
            INITIER LA CONNEXION
          </button>

          <p className="font-mono text-[9px] tracking-[0.35em] uppercase mt-5"
            style={{ color:'rgba(255,255,255,0.10)' }}>
            ⚠ AVERTISSEMENT : ACCÈS AU CYBERESPACE NON RÉGULÉ
          </p>
        </div>

        {/* Loading % — pendant la plongée */}
        <div style={{
          position: 'absolute', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
          opacity: isDiving ? 1 : 0, transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}>
          <p className="font-mono text-[9px] tracking-[0.6em] uppercase"
            style={{ color: 'rgba(0,185,255,0.45)' }}>
            CONNEXION EN COURS
          </p>
          <p className="font-mono font-bold"
            style={{ fontSize: '2.2rem', color: 'rgba(0,185,255,0.92)',
                     textShadow: '0 0 30px rgba(0,150,255,0.7)', lineHeight: 1 }}>
            {loadingPct}%
          </p>
          <div style={{ width: '10rem', height: '1px', background: 'rgba(0,60,140,0.35)' }}>
            <div style={{
              height: '1px', width: `${loadingPct}%`,
              background: 'linear-gradient(90deg, rgba(0,100,255,0.6), rgba(0,200,255,0.95))',
              boxShadow: '0 0 8px rgba(0,185,255,0.7)',
              transition: 'width 0.08s linear',
            }} />
          </div>
        </div>

      </div>

      <style>{`
        @keyframes cyberFlash {
          0%  { opacity:0; } 18% { opacity:1; } 100% { opacity:0; }
        }
      `}</style>
    </div>
  );
}
