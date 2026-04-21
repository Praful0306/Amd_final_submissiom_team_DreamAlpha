import { useRef, useMemo } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Points, PointMaterial } from "@react-three/drei"
import * as THREE from "three"

function Helix() {
  const ref = useRef<THREE.Points>(null!)
  const count = 300

  const [positions, _colors] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 8
      const strand = i % 2 === 0 ? 1 : -1

      // Double helix geometry
      pos[i * 3]     = Math.cos(t) * 1.2 * strand
      pos[i * 3 + 1] = (i / count) * 6 - 3
      pos[i * 3 + 2] = Math.sin(t) * 1.2 * strand

      // Gradient from orange to purple
      const ratio = i / count
      col[i * 3]     = 0.97 + ratio * 0.1       // R
      col[i * 3 + 1] = 0.45 - ratio * 0.2        // G
      col[i * 3 + 2] = 0.07 + ratio * 0.7        // B
    }
    return [pos, col]
  }, [])

  // Connector bars between strands
  const barGeom = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const verts: number[] = []
    for (let i = 0; i < count; i += 6) {
      const t = (i / count) * Math.PI * 8
      verts.push(
        Math.cos(t) * 1.2, (i / count) * 6 - 3, Math.sin(t) * 1.2,
        -Math.cos(t) * 1.2, (i / count) * 6 - 3, -Math.sin(t) * 1.2
      )
    }
    geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3))
    return geom
  }, [])

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.35
  })

  return (
    <group rotation={[0.2, 0, 0]}>
      <Points ref={ref} positions={positions}>
        <PointMaterial
          vertexColors
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </Points>
      {/* Connection bars — subtle lines */}
      <lineSegments geometry={barGeom}>
        <lineBasicMaterial color="#f97316" opacity={0.15} transparent />
      </lineSegments>
    </group>
  )
}

function Particles() {
  const ref = useRef<THREE.Points>(null!)
  const count = 800

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 12
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12
    }
    return pos
  }, [])

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.04
    ref.current.rotation.x += delta * 0.02
  })

  return (
    <Points ref={ref} positions={positions}>
      <PointMaterial
        color="#f97316"
        size={0.015}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </Points>
  )
}

export function DNAHelix() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={1} color="#f97316" />
      <pointLight position={[-5, -5, -5]} intensity={0.5} color="#7c3aed" />
      <Helix />
      <Particles />
    </Canvas>
  )
}
