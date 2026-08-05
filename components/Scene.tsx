"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

/**
 * How much of the screen the overlay UI needs at the bottom, and how much
 * headroom to leave at the top. A phone stacks the copy, the countdown and —
 * once it is open — a full-width form, so it needs far more of the screen than
 * a desktop window does. `compact` is the open-form case.
 */
function band(width: number, height: number, compact: boolean) {
  const portrait = height >= width;

  // A roomy desktop window keeps the original framing.
  if (width >= 900 && !portrait && height >= 560) {
    return { top: 0.1, reserved: compact ? 0.46 : 0.4 };
  }

  // Everywhere else, work back from what the overlay actually needs in pixels.
  // The open form is about 360px tall — most of a 568px phone but only half of
  // an 852px one, and a single fraction gets one of those two badly wrong.
  const short = !portrait && height < 560; // landscape phone, short window
  const uiPx = short ? (compact ? 155 : 160) : compact ? 360 : 225;
  const clearance = short ? 0.07 : 0.06; // breathing room below the X
  return {
    top: short ? 0.05 : 0.06,
    reserved: Math.min(0.8, uiPx / height + clearance),
  };
}

// Seconds for one crossing. The highlight runs from just off the leading edge
// to just off the trailing one and immediately begins again, so there is no
// pause — and because it is fully out of frame at the wrap, the restart is
// invisible rather than a pop.
const SHEEN_PERIOD = 6;

const PLANE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The pool of light the X sits in. The scene clears to pure black, so without
 * something behind it a black shadow would fall on black and vanish — this is
 * what the shadow is actually cast onto.
 */
function useGlowMaterial() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERT,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            // Slightly wider than tall, and centred a little above middle to
            // match the rays coming down the page.
            vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(1.3, 1.0);
            float g = 1.0 - smoothstep(0.0, 0.5, length(p));
            gl_FragColor = vec4(vec3(1.0), pow(g, 3.4) * 0.055);
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/**
 * The X's own silhouette, blurred and offset down-right, so it reads as the
 * letter standing off the backdrop rather than pasted onto it.
 */
function useShadowMaterial(tex: THREE.Texture) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex }, uSpread: { value: 0.014 } },
        vertexShader: PLANE_VERT,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uSpread;
          varying vec2 vUv;

          float tap(vec2 o) { return texture2D(uMap, vUv + o * uSpread).a; }

          void main() {
            // Two rings of taps — enough to soften the silhouette into a
            // shadow without a separate blur pass.
            float a = tap(vec2(0.0)) * 0.18;
            a += (tap(vec2(1.0, 0.0)) + tap(vec2(-1.0, 0.0))
                + tap(vec2(0.0, 1.0)) + tap(vec2(0.0, -1.0))) * 0.093;
            a += (tap(vec2(0.7, 0.7)) + tap(vec2(-0.7, 0.7))
                + tap(vec2(0.7, -0.7)) + tap(vec2(-0.7, -0.7))) * 0.072;
            a += (tap(vec2(2.1, 0.0)) + tap(vec2(-2.1, 0.0))
                + tap(vec2(0.0, 2.1)) + tap(vec2(0.0, -2.1))) * 0.041;
            gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(a, 0.0, 1.0) * 0.8);
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    [tex]
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/**
 * All of the X's life comes from its surface rather than from moving the mesh
 * around: a broad reflection drifting over the chrome, plus a soft highlight
 * that crosses it like a light source passing by. Both ride on top of the
 * normal material, so three keeps handling colour space and tone mapping, and
 * both are masked by the texture's own alpha and luminance — they catch the
 * polished edges instead of washing over the whole plane.
 */
function useSheenMaterial(tex: THREE.Texture) {
  const { material, setFrame } = useMemo(() => {
    // The uniforms live inside the memo alongside the material they feed, so
    // the per-frame update is a plain function call rather than a reach-in
    // mutation of something handed back from a hook.
    const uTime = { value: 0 };
    const uMotion = { value: 1 };
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uMotion = uMotion;
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform float uTime;\nuniform float uMotion;\n\nvoid main() {")
        .replace(
          "#include <map_fragment>",
          /* glsl */ `
          #include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));

          // A wide, slow gradient rolling down the X — the suggestion of a room
          // reflected in polished metal. It runs darker as well as brighter,
          // which is what keeps it reading as a reflection and not a glow.
          float reflPos = vMapUv.y * 0.82 + vMapUv.x * 0.18;
          float refl = sin((reflPos * 2.2 - uTime * 0.055) * 6.28318);
          diffuseColor.rgb += diffuseColor.a * lum * refl * 0.07 * uMotion;

          // Over the top of it, the highlight — diagonal, so the light travels
          // down and to the right, crossing continuously.
          float sweepPos = vMapUv.x * 0.72 + (1.0 - vMapUv.y) * 0.28;
          float head = fract(uTime / ${SHEEN_PERIOD.toFixed(1)}) * 1.7 - 0.35;
          float bandMask = exp(-pow((sweepPos - head) / 0.18, 2.0));
          diffuseColor.rgb += bandMask * diffuseColor.a * (0.12 + lum * 0.6) * 0.5;

          // The X is lit from above-left, so let the lower-right shoulder fall
          // away. Keeps the chrome from reading as a flat cut-out.
          float formShade = vMapUv.x * 0.45 + (1.0 - vMapUv.y) * 0.55;
          diffuseColor.rgb *= 1.0 - smoothstep(0.3, 1.0, formShade) * 0.2;
`
        );
    };
    return {
      material: m,
      setFrame: (t: number, motion: number) => {
        uTime.value = t;
        uMotion.value = motion;
      },
    };
  }, [tex]);

  useEffect(() => () => material.dispose(), [material]);
  return { material, setFrame };
}

function ChromeX({ still, compact }: { still: boolean; compact: boolean }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const settled = useRef(false);
  const { viewport, size } = useThree();
  const tex = useTexture("/x.png", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  });
  const img = tex.image as { width: number; height: number };
  const aspect = img.width / img.height;
  const { material, setFrame } = useSheenMaterial(tex);
  const shadowMaterial = useShadowMaterial(tex);
  const glowMaterial = useGlowMaterial();

  // Fit the X into the space above the text block, whatever the screen shape.
  const { top, reserved } = band(size.width, size.height, compact);
  const bandH = Math.max(0.18, 1 - top - reserved);
  const height = Math.min(viewport.height * bandH, (viewport.width * 0.88) / aspect);
  // Centre it in that band. World y counts up from the middle of the screen.
  const y = viewport.height * (0.5 - (top + bandH / 2));

  // The shadow sits a little down and to the right of the X, and the light
  // pool behind it is a good deal larger than the letter itself.
  const shadowOffset = height * 0.045;
  const glowSize = height * 1.5;

  useFrame((state, delta) => {
    const g = group.current;
    const m = mesh.current;
    const sh = shadow.current;
    const gl = glow.current;
    if (!g || !m || !sh || !gl) return;
    const t = state.clock.elapsedTime;
    const drift = still ? 0 : 1;
    // t = 0 parks the highlight just off the leading edge, so reduced-motion
    // visitors get the plain chrome with neither sweep nor reflection.
    setFrame(still ? 0 : t, drift);

    // The X holds its position — no pointer tracking, so it behaves the same
    // on a phone as under a mouse. Just a slow sway to keep it from feeling
    // like a flat pasted image.
    const targetY = Math.sin(t * 0.19) * 0.06 * drift;
    const targetX = Math.sin(t * 0.13 + 1.7) * 0.025 * drift;
    const k = Math.min(1, delta * 2.5);
    g.rotation.y += (targetY - g.rotation.y) * k;
    g.rotation.x += (targetX - g.rotation.x) * k;

    // Ease into the new size and position when the band changes (the form
    // opening, a rotation, a resize) rather than snapping to it.
    const e = settled.current ? (still ? 1 : Math.min(1, delta * 4)) : 1;
    g.position.y += (y - g.position.y) * e;
    m.scale.x += (height * aspect - m.scale.x) * e;
    m.scale.y += (height - m.scale.y) * e;
    // The shadow tracks the X a touch larger, the light pool tracks its size.
    sh.scale.set(m.scale.x * 1.04, m.scale.y * 1.04, 1);
    sh.position.set(shadowOffset, -shadowOffset, -0.6);
    gl.scale.set(glowSize * 1.15, glowSize, 1);
    settled.current = true;
  });

  return (
    <group ref={group} position={[0, y, 0]}>
      {/* Outside the Float: the light stays put while the X drifts in it. */}
      <mesh ref={glow} position={[0, 0, -1.4]} renderOrder={0} material={glowMaterial}>
        <planeGeometry />
      </mesh>
      <Float
        speed={still ? 0 : 1.1}
        rotationIntensity={0}
        floatIntensity={still ? 0 : 0.25}
      >
        {/* Inside it: the shadow moves with the letter that casts it. */}
        <mesh ref={shadow} renderOrder={1} material={shadowMaterial}>
          <planeGeometry />
        </mesh>
        <mesh
          ref={mesh}
          scale={[height * aspect, height, 1]}
          renderOrder={2}
          material={material}
        >
          <planeGeometry />
        </mesh>
      </Float>
    </group>
  );
}

function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}

export default function Scene({
  onReady,
  compact = false,
}: {
  onReady?: () => void;
  compact?: boolean;
}) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Bloom at 3x on a phone is a lot of fill rate for no visible gain.
  const phone = typeof window !== "undefined" && window.innerWidth < 560;

  return (
    <div className="stage" aria-hidden>
      <Canvas
        dpr={[1, phone ? 1.75 : 2]}
        camera={{ position: [0, 0, 10], fov: 38 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor("#000000")}
      >
        <Suspense fallback={null}>
          <ChromeX still={reducedMotion} compact={compact} />
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
          </EffectComposer>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
