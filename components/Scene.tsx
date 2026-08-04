"use client";

import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, useTexture } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

function ChromeX({ still }: { still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const tex = useTexture("/x.png", (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  });
  const img = tex.image as { width: number; height: number };
  const aspect = img.width / img.height;

  // Fit the X into the space above the text block, whatever the screen shape.
  const height = Math.min(viewport.height * 0.5, (viewport.width * 0.92) / aspect);
  const y = viewport.height * 0.15;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const drift = still ? 0 : 1;
    const targetY = state.pointer.x * 0.22 + Math.sin(t * 0.25) * 0.05 * drift;
    const targetX = -state.pointer.y * 0.1;
    const k = Math.min(1, delta * 2.5);
    g.rotation.y += (targetY - g.rotation.y) * k;
    g.rotation.x += (targetX - g.rotation.x) * k;
    g.position.x += (state.pointer.x * 0.25 - g.position.x) * k;
  });

  return (
    <group ref={group} position={[0, y, 0]}>
      <Float
        speed={still ? 0 : 1.1}
        rotationIntensity={0}
        floatIntensity={still ? 0 : 0.25}
      >
        <mesh scale={[height * aspect, height, 1]}>
          <planeGeometry />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
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

export default function Scene({ onReady }: { onReady?: () => void }) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="stage" aria-hidden>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 10], fov: 38 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => gl.setClearColor("#000000")}
      >
        <Suspense fallback={null}>
          <ChromeX still={reducedMotion} />
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
          </EffectComposer>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
