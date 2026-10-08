import * as THREE from 'three'

export function createTurfTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1344
  const ctx = canvas.getContext('2d')!
  const pixels = ctx.createImageData(canvas.width, canvas.height)
  let seed = 41
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 4294967296
  }
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      const stripe = Math.floor(x / 128) % 2 ? 9 : 0
      const grain = random() * 23 - 11
      pixels.data[i] = 42 + grain + stripe * 0.5
      pixels.data[i + 1] = 97 + grain + stripe
      pixels.data[i + 2] = 46 + grain * 0.6 + stripe * 0.4
      pixels.data[i + 3] = 255
    }
  ctx.putImageData(pixels, 0, 0)
  for (let i = 0; i < 70000; i++) {
    const x = random() * 2048,
      y = random() * 1344
    ctx.strokeStyle = i % 2 ? '#98b07028' : '#103d2220'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.5, y + 1 + random() * 3)
    ctx.stroke()
  }
  for (const x of [55, 1993]) {
    const wear = ctx.createRadialGradient(x, 672, 5, x, 672, 115)
    wear.addColorStop(0, '#8a896832')
    wear.addColorStop(1, '#8a896800')
    ctx.fillStyle = wear
    ctx.fillRect(x - 115, 557, 230, 230)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function createKitTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = x % 32 ? '#f8f8f8' : '#e8e8e8'
    ctx.fillRect(x, 0, 8, 256)
  }
  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = '#8080800c'
    ctx.fillRect(0, y, 256, 1)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function createFootballGeometry(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 0)
  const raw = ico.getAttribute('position')
  const corners: THREE.Vector3[] = []
  const triangles: number[][] = []
  const ids = new Map<string, number>()
  for (let i = 0; i < raw.count; i += 3) {
    const face: number[] = []
    for (let j = 0; j < 3; j++) {
      const p = new THREE.Vector3().fromBufferAttribute(raw, i + j)
      const key = p
        .toArray()
        .map((v) => v.toFixed(5))
        .join(',')
      let id = ids.get(key)
      if (id === undefined) {
        id = corners.length
        ids.set(key, id)
        corners.push(p)
      }
      face.push(id)
    }
    triangles.push(face)
  }
  ico.dispose()
  const points: number[] = [],
    normals: number[] = [],
    colors: number[] = []
  const cut = (a: number, b: number) =>
    corners[a]!.clone().multiplyScalar(2).add(corners[b]!).divideScalar(3)
  function emit(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    color: THREE.Color,
    depth: number,
  ) {
    if (depth) {
      const ab = a.clone().add(b).multiplyScalar(0.5),
        bc = b.clone().add(c).multiplyScalar(0.5),
        ca = c.clone().add(a).multiplyScalar(0.5)
      emit(a, ab, ca, color, depth - 1)
      emit(ab, b, bc, color, depth - 1)
      emit(ca, bc, c, color, depth - 1)
      emit(ab, bc, ca, color, depth - 1)
      return
    }
    for (const p of [a, b, c]) {
      const normal = p.clone().normalize()
      points.push(normal.x * 0.16, normal.y * 0.16, normal.z * 0.16)
      normals.push(normal.x, normal.y, normal.z)
      colors.push(color.r, color.g, color.b)
    }
  }
  function panel(polygon: THREE.Vector3[], color: number) {
    const center = polygon
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .divideScalar(polygon.length)
    const outward = new THREE.Vector3()
      .subVectors(polygon[1]!, polygon[0]!)
      .cross(new THREE.Vector3().subVectors(polygon[2]!, polygon[0]!))
      .dot(center)
    if (outward < 0) polygon.reverse()
    for (let i = 0; i < polygon.length; i++)
      emit(center, polygon[i]!, polygon[(i + 1) % polygon.length]!, new THREE.Color(color), 2)
  }
  for (const [a, b, c] of triangles as [number, number, number][]) {
    panel([cut(a, b), cut(b, a), cut(b, c), cut(c, b), cut(c, a), cut(a, c)], 0xeff3ed)
  }
  corners.forEach((center, id) => {
    const neighbors = new Set<number>()
    for (const face of triangles)
      if (face.includes(id)) for (const vertex of face) if (vertex !== id) neighbors.add(vertex)
    const normal = center.clone().normalize(),
      axis = new THREE.Vector3(0, 1, 0)
    if (Math.abs(normal.y) > 0.9) axis.set(1, 0, 0)
    const u = axis.cross(normal).normalize(),
      v = normal.clone().cross(u)
    const polygon = Array.from(neighbors).map((other) => cut(id, other))
    polygon.sort((a, b) => Math.atan2(a.dot(v), a.dot(u)) - Math.atan2(b.dot(v), b.dot(u)))
    panel(polygon, 0x101b2c)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}
