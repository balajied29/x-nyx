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
/* Where the lockup sits once the reveal has landed. A shade above true centre,
   because the line hangs underneath and an optically centred group wants its
   mass a little high. */
const SOLO_CENTRE = 0.45;

function band(
  width: number,
  height: number,
  compact: boolean,
  solo = false,
): { top: number; reserved: number } {
  const portrait = height >= width;

  // After the reveal there is nothing under the X but a single line, so the
  // gap held open for the countdown, the notice and the register button is
  // just a hole in the middle of the screen. Keep the band the same size —
  // that is what sets how big the X is drawn — and move it, so the X and the
  // line under it read as one centred lockup instead of a top-heavy one.
  if (solo) {
    const rest = band(width, height, false);
    const bandH = 1 - rest.top - rest.reserved;
    const top = SOLO_CENTRE - bandH / 2;
    return { top, reserved: 1 - top - bandH };
  }

  // A roomy desktop window keeps the original framing.
  if (width >= 900 && !portrait && height >= 560) {
    return { top: 0.1, reserved: compact ? 0.48 : 0.43 };
  }

  // Everywhere else, work back from what the overlay actually needs in pixels.
  // The open form is about 360px tall — most of a 568px phone but only half of
  // an 852px one, and a single fraction gets one of those two badly wrong.
  const short = !portrait && height < 560; // landscape phone, short window
  const uiPx = short ? (compact ? 190 : 195) : compact ? 398 : 263;
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

/**
 * The X is one plane cut down the middle into two, which ride apart as the
 * lineup scrolls up between them — the pair of glass X's flanking the cards
 * on the artwork. Fraction of a screen height the scroll takes to finish the
 * split, and where the two halves end up: a share of the half-width, out past
 * the card row. A phone sends them further out, since the cards there take
 * the full width and the halves are only there to frame the edges.
 */
const SPLIT_SCROLL = 0.62;
const SPLIT_EDGE_WIDE = 0.44;
const SPLIT_EDGE_NARROW = 0.82;
// At rest the X sits in the band above the copy; split, it stands the full
// height of the screen alongside the cards.
const SPLIT_HEIGHT = 0.94;

/**
 * A unit plane carrying one half of the texture — the geometry is half as
 * wide and its u range is squeezed into that half, so the two together are
 * the whole letter with no seam when they are closed up.
 */
function halfPlane(side: 0 | 1) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * 0.5 + side * 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

function ChromeX({ still, compact, solo }: { still: boolean; compact: boolean; solo: boolean }) {
  const group = useRef<THREE.Group>(null);
  const halves = useRef<(THREE.Mesh | null)[]>([null, null]);
  const shadows = useRef<(THREE.Mesh | null)[]>([null, null]);
  const glow = useRef<THREE.Mesh>(null);
  const settled = useRef(false);
  const geometries = useMemo(() => [halfPlane(0), halfPlane(1)], []);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
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
  const { top, reserved } = band(size.width, size.height, compact, solo);
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
    const gl = glow.current;
    const [ml, mr] = halves.current;
    const [sl, sr] = shadows.current;
    if (!g || !gl || !ml || !mr || !sl || !sr) return;
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

    // How far the lineup has come up the screen. Read straight off the
    // scroll rather than passed down as a prop — this changes every frame of
    // a scroll, and a re-render per frame would cost far more than it buys.
    // Before the reveal there is nothing to scroll, so this is simply 0 and
    // the X behaves exactly as it did.
    const p = Math.min(1, Math.max(0, window.scrollY / (size.height * SPLIT_SCROLL)));
    const eased = p * p * (3 - 2 * p);

    // Closed, the two halves meet in the middle of the band. Open, they stand
    // full height at either edge with the cards in the gap between them.
    const openHeight = viewport.height * SPLIT_HEIGHT;
    const h = lerp(height, openHeight, eased);
    const halfW = (h * aspect) / 2;
    const edgeShare = size.width < 700 ? SPLIT_EDGE_NARROW : SPLIT_EDGE_WIDE;
    const openX = viewport.width * edgeShare;
    const x = lerp(halfW / 2, openX, eased);

    // Ease into the new size and position when the band changes (the form
    // opening, a rotation, a resize) rather than snapping to it.
    const e = settled.current ? (still ? 1 : Math.min(1, delta * 4)) : 1;
    g.position.y += (lerp(y, 0, eased) - g.position.y) * e;

    for (const [i, m] of [ml, mr].entries()) {
      const dir = i === 0 ? -1 : 1;
      m.scale.x += (halfW - m.scale.x) * e;
      m.scale.y += (h - m.scale.y) * e;
      m.position.x += (dir * x - m.position.x) * e;
      const sh = i === 0 ? sl : sr;
      // The shadow tracks its own half, a touch larger and offset down-right.
      sh.scale.set(m.scale.x * 1.04, m.scale.y * 1.04, 1);
      sh.position.set(m.position.x + shadowOffset, -shadowOffset, -0.6);
    }

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
        {/* Inside it: the shadows move with the halves that cast them. */}
        {[0, 1].map((i) => (
          <mesh
            key={`shadow-${i}`}
            ref={(node) => {
              shadows.current[i] = node;
            }}
            renderOrder={1}
            material={shadowMaterial}
            geometry={geometries[i]}
          />
        ))}
        {[0, 1].map((i) => (
          <mesh
            key={`half-${i}`}
            ref={(node) => {
              halves.current[i] = node;
            }}
            position={[((i === 0 ? -1 : 1) * height * aspect) / 4, 0, 0]}
            scale={[(height * aspect) / 2, height, 1]}
            renderOrder={2}
            material={material}
            geometry={geometries[i]}
          />
        ))}
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
  solo = false,
}: {
  onReady?: () => void;
  compact?: boolean;
  /* The reveal has landed: the copy below the X is down to a single line. */
  solo?: boolean;
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
          <ChromeX still={reducedMotion} compact={compact} solo={solo} />
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
          </EffectComposer>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
