import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Direction, Match } from './simulation'
import { createTurfTexture, createKitTexture, createFootballGeometry } from './surfaces'

export interface SceneHandle {
  render: (
    match: Match,
    alpha: number,
    dt: number,
    playing: boolean,
    inputDirection: Direction,
    shotCharging: boolean,
  ) => void
  dispose: () => void
  setQuality: (quality: string) => void
  setCamera: (wide: boolean) => void
}
const HOME = 0x1677db,
  AWAY = 0xce203e
export async function createScene(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#172332')
  scene.fog = new THREE.Fog('#172332', 120, 260)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400)
  camera.position.set(12, 14, 28)
  const target = new THREE.Vector3(0, 0, 0),
    wanted = new THREE.Vector3(),
    look = new THREE.Vector3()
  scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x263921, 1.1))
  const sun = new THREE.DirectionalLight(0xe4edff, 3.1)
  sun.position.set(-36, 65, -35)
  sun.castShadow = true
  sun.shadow.mapSize.set(1536, 1536)
  sun.shadow.camera.left = -64
  sun.shadow.camera.right = 64
  sun.shadow.camera.top = 56
  sun.shadow.camera.bottom = -56
  sun.shadow.normalBias = 0.04
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xa8c9ff, 1.5)
  fill.position.set(40, 38, 25)
  scene.add(fill)
  const mats = new Set<THREE.Material>(),
    geos = new Set<THREE.BufferGeometry>(),
    textures = new Set<THREE.Texture>()
  const material = (color: THREE.ColorRepresentation) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88 })
    mats.add(m)
    return m
  }
  const concrete = material('#4b5663'),
    dark = material('#121c2a'),
    white = material('#e8edd7'),
    wood = material('#7d8995')
  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    shadow = false,
  ) => {
    const g = new THREE.BoxGeometry(w, h, d)
    geos.add(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    m.receiveShadow = true
    m.castShadow = shadow
    scene.add(m)
    return m
  }
  addBox(340, 0.8, 270, 0, -1, 0, material('#263329'))
  addBox(123, 1.1, 85, 0, -0.45, 0, dark)
  const turf = createTurfTexture()
  textures.add(turf)
  const turfMat = new THREE.MeshStandardMaterial({
    map: turf,
    roughness: 1,
    bumpMap: turf,
    bumpScale: 0.055,
  })
  mats.add(turfMat)
  const turfGeo = new THREE.PlaneGeometry(104, 68)
  geos.add(turfGeo)
  const grass = new THREE.Mesh(turfGeo, turfMat)
  grass.rotation.x = -Math.PI / 2
  grass.position.y = 0.19
  grass.receiveShadow = true
  scene.add(grass)
  // One line mesh for the complete pitch keeps the markings inexpensive.
  const vertices: number[] = []
  const line = (x1: number, z1: number, x2: number, z2: number) =>
    vertices.push(x1, 0.205, z1, x2, 0.205, z2)
  const rect = (x: number, z: number, w: number, h: number) => {
    line(x, z, x + w, z)
    line(x + w, z, x + w, z + h)
    line(x + w, z + h, x, z + h)
    line(x, z + h, x, z)
  }
  const circle = (x: number, z: number, r: number) => {
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2,
        b = ((i + 1) / 96) * Math.PI * 2
      line(x + Math.cos(a) * r, z + Math.sin(a) * r, x + Math.cos(b) * r, z + Math.sin(b) * r)
    }
  }
  rect(-52, -34, 104, 68)
  line(0, -34, 0, 34)
  circle(0, 0, 9.15)
  circle(0, 0, 0.2)
  for (const s of [-1, 1]) {
    rect(s === -1 ? -52 : 35.5, -20.16, 16.5, 40.32)
    rect(s === -1 ? -52 : 46.5, -9.16, 5.5, 18.32)
    circle(s * 41, 0, 0.2)
  }
  const markingPositions: number[] = []
  for (let i = 0; i < vertices.length; i += 6) {
    const x1 = vertices[i]!,
      z1 = vertices[i + 2]!,
      x2 = vertices[i + 3]!,
      z2 = vertices[i + 5]!
    const length = Math.hypot(x2 - x1, z2 - z1) || 1,
      nx = (-(z2 - z1) / length) * 0.055,
      nz = ((x2 - x1) / length) * 0.055
    markingPositions.push(
      x1 + nx,
      0.205,
      z1 + nz,
      x2 + nx,
      0.205,
      z2 + nz,
      x2 - nx,
      0.205,
      z2 - nz,
      x1 + nx,
      0.205,
      z1 + nz,
      x2 - nx,
      0.205,
      z2 - nz,
      x1 - nx,
      0.205,
      z1 - nz,
    )
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(markingPositions, 3))
  geos.add(lineGeo)
  const lineMat = new THREE.MeshBasicMaterial({
    color: 0xdbe5df,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  })
  mats.add(lineMat)
  scene.add(new THREE.Mesh(lineGeo, lineMat))
  for (const s of [-1, 1]) {
    for (const z of [-4.2, 4.2]) addBox(0.16, 2.8, 0.16, s * 52, 1.55, z, white, true)
    addBox(0.16, 0.16, 8.55, s * 52, 2.95, 0, white, true)
    const net: number[] = []
    for (let z = -4.2; z <= 4.21; z += 0.42) {
      net.push(s * 54, 0.25, z, s * 54, 2.95, z)
      net.push(s * 52, 2.95, z, s * 54, 2.95, z)
    }
    for (let y = 0.25; y <= 3; y += 0.3) {
      net.push(s * 54, y, -4.2, s * 54, y, 4.2)
      for (const z of [-4.2, 4.2]) net.push(s * 52, y, z, s * 54, y, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(net, 3))
    geos.add(g)
    const m = new THREE.LineBasicMaterial({ color: 0xe5e9dd, transparent: true, opacity: 0.38 })
    mats.add(m)
    scene.add(new THREE.LineSegments(g, m))
    for (const z of [-34, 34]) {
      addBox(0.08, 1.8, 0.08, s * 52, 1, z, white)
      addBox(0.65, 0.4, 0.035, s * 52 + 0.3, 1.7, z, material(HOME))
    }
  }
  // A full bowl with two tiers and 7,200 instanced spectators.
  const seatGeo = new THREE.BoxGeometry(0.7, 0.35, 0.65)
  geos.add(seatGeo)
  const seats = new THREE.InstancedMesh(seatGeo, material('#263a59'), 7200)
  const crowdGeo = new THREE.CapsuleGeometry(0.19, 0.32, 3, 5)
  const headsGeo = new THREE.SphereGeometry(0.115, 6, 5)
  geos.add(crowdGeo)
  geos.add(headsGeo)
  const crowd = new THREE.InstancedMesh(crowdGeo, material('#ffffff'), 7200)
  const heads = new THREE.InstancedMesh(headsGeo, material('#ffffff'), 7200)
  const transform = new THREE.Object3D()
  let index = 0
  for (const side of [-1, 1]) {
    for (let row = 0; row < 18; row++) {
      const y = row * 0.87 + 0.35,
        z = side * (43 + row * 1.35)
      addBox(134, 0.9, 1.35, 0, y - 0.6, z, concrete)
      addBox(1.35, 0.9, 80, side * (62 + row * 1.35), y - 0.6, 0, concrete)
      for (let col = 0; col < 200; col++) {
        const end = col >= 120
        const x = end ? side * (62 + row * 1.35) : -65.5 + col * 1.1
        const pz = end ? -39.5 + (col - 120) : z
        transform.rotation.set(0, 0, 0)
        transform.position.set(x, y, pz)
        transform.updateMatrix()
        seats.setMatrixAt(index, transform.matrix)
        transform.position.y = y + 0.49
        transform.rotation.set(0.035 * Math.sin(index * 0.19), 0, 0.045 * Math.sin(index * 0.47))
        transform.updateMatrix()
        crowd.setMatrixAt(index, transform.matrix)
        crowd.setColorAt(
          index,
          new THREE.Color(
            ['#2867a8', '#cfd6df', '#29394e', '#77293c', '#727e8c', '#233950', '#d9b34d', '#f1eee2', '#735a45', '#af604e', '#496c4c', '#253244', '#b1c6d7', '#735477'][
              (index * 13 + row) % 14
            ]!,
          ),
        )
        transform.position.y = y + 0.93
        transform.rotation.set(0, 0, 0)
        transform.updateMatrix()
        heads.setMatrixAt(index, transform.matrix)
        heads.setColorAt(
          index,
          new THREE.Color(['#b68161', '#e0ad8c', '#784c36', '#c4936d'][index % 4]!),
        )
        index++
      }
    }
    addBox(141, 0.8, 14, 0, 22, side * 65, dark, true)
    addBox(14, 0.8, 82, side * 84, 22, 0, dark, true)
    for (const x of [-65, -44, -22, 0, 22, 44, 65]) {
      addBox(0.35, 23, 0.35, x, 11, side * 69, wood)
      addBox(0.15, 0.15, 19, x, 21, side * 62, wood)
    }
    addBox(132, 0.15, 0.2, 0, 17, side * 66, white)
    addBox(130, 2, 1, 0, 8, side * 53, material('#172332'))
  }
  seats.instanceMatrix.needsUpdate = true
  crowd.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  scene.add(seats, crowd, heads)
  function sign(text: string, x: number, z: number, rotation = 0) {
    const c = document.createElement('canvas')
    c.width = 2048
    c.height = 256
    const ctx = c.getContext('2d')!
    const gradient = ctx.createLinearGradient(0, 0, 2048, 256)
    gradient.addColorStop(0, '#061522')
    gradient.addColorStop(0.55, '#10293b')
    gradient.addColorStop(1, '#071521')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 2048, 256)
    ctx.fillStyle = '#c7f476'
    ctx.fillRect(0, 0, 18, 256)
    ctx.fillStyle = '#c7f476'
    ctx.font = '700 28px Arial'
    ctx.textAlign = 'left'
    ctx.fillText('FIRST TOUCH  /  EXHIBITION FOOTBALL', 64, 62)
    ctx.fillStyle = '#eff6eb'
    ctx.font = 'bold 76px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(text, 1024, 176)
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    textures.add(texture)
    const g = new THREE.PlaneGeometry(25, 3.1)
    geos.add(g)
    const m = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    mats.add(m)
    const mesh = new THREE.Mesh(g, m)
    mesh.position.set(x, 1.5, z)
    mesh.rotation.y = rotation
    scene.add(mesh)
  }
  for (const x of [-40, -13, 14, 41]) {
    sign(x < 0 ? 'FIRST TOUCH' : 'PLAY BEAUTIFULLY', x, -38)
    sign(x < 0 ? 'THE GAME IS YOURS' : 'FIRST TOUCH', x, 38, Math.PI)
  }
  for (const x of [-60, 60])
    for (const z of [-41, 41]) {
      addBox(0.5, 23, 0.5, x, 11, z, dark, true)
      addBox(5, 2, 0.8, x, 23, z, white)
      for (let i = 0; i < 5; i++)
        addBox(0.65, 1, 0.1, x - 1.8 + i * 0.9, 23, z + 0.45, material('#fff4c8'))
    }
  const gltf = await new GLTFLoader()
    .loadAsync('/models/footballer.glb')
    .catch((error: unknown) => {
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      renderer.dispose()
      throw error
    })
  // Each body part is one instanced draw for all 22 footballers.
  const batches = new Map<string, { mesh: THREE.InstancedMesh; sources: THREE.Mesh[] }>()
  const kitTexture = createKitTexture()
  textures.add(kitTexture)
  const playerMeshes: THREE.Group[] = []
  const stridePhases = new Float32Array(22)
  const strideSpeeds = new Float32Array(22)
  const limbs: {
    leftLeg: THREE.Object3D | undefined
    rightLeg: THREE.Object3D | undefined
    leftArm: THREE.Object3D | undefined
    rightArm: THREE.Object3D | undefined
    leftKnee: THREE.Object3D | undefined
    rightKnee: THREE.Object3D | undefined
    leftElbow: THREE.Object3D | undefined
    rightElbow: THREE.Object3D | undefined
    body: THREE.Object3D | undefined
  }[] = []
  for (let i = 0; i < 22; i++) {
    const player = gltf.scene.clone(true)
    player.scale.setScalar(1.12)
    player.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      geos.add(o.geometry)
      const original = o.material as THREE.MeshStandardMaterial
      let batch = batches.get(o.name)
      if (!batch) {
        const m = original.clone()
        m.color.set(0xffffff)
        if (original.name === 'Kit') m.map = kitTexture
        mats.add(m)
        const mesh = new THREE.InstancedMesh(o.geometry, m, 22)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        batch = { mesh, sources: [] }
        batches.set(o.name, batch)
        scene.add(mesh)
      }
      const tint = original.color.clone()
      if (original.name === 'Kit')
        tint.set(i % 11 === 0 ? (i < 11 ? '#eebd63' : '#86bfd2') : i < 11 ? HOME : AWAY)
      if (original.name === 'Shorts') tint.set(i < 11 ? '#eff3f9' : '#152333')
      if (original.name === 'Skin')
        tint.set(['#865237', '#b77e58', '#dfaf8e', '#513322', '#bd9478'][i % 5]!)
      batch.mesh.setColorAt(i, tint)
      batch.sources.push(o)
    })
    playerMeshes.push(player)
    limbs.push({
      leftLeg: player.getObjectByName('LeftLeg'),
      rightLeg: player.getObjectByName('RightLeg'),
      leftArm: player.getObjectByName('LeftArm'),
      rightArm: player.getObjectByName('RightArm'),
      leftKnee: player.getObjectByName('LeftKnee'),
      rightKnee: player.getObjectByName('RightKnee'),
      leftElbow: player.getObjectByName('LeftElbow'),
      rightElbow: player.getObjectByName('RightElbow'),
      body: player.getObjectByName('Body'),
    })
  }
  const numbers: { mesh: THREE.Mesh; local: THREE.Matrix4 }[] = []
  const numberGeo = new THREE.PlaneGeometry(0.23, 0.32)
  geos.add(numberGeo)
  for (let i = 0; i < 22; i++) {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 192
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f4f7ff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 21px Arial'
    ctx.fillText(i < 11 ? 'NORTHSIDE' : 'EAST END', 64, 27)
    ctx.font = 'bold 116px Arial'
    ctx.fillText(String((i % 11) + 1), 64, 149)
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    textures.add(texture)
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
    mats.add(m)
    const mesh = new THREE.Mesh(numberGeo, m)
    mesh.matrixAutoUpdate = false
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1.285, -0.143),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
      new THREE.Vector3(1, 1, 1),
    )
    numbers.push({ mesh, local })
    scene.add(mesh)
  }
  const ballGeo = createFootballGeometry()
  geos.add(ballGeo)
  const ballMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })
  mats.add(ballMat)
  const ball = new THREE.Mesh(ballGeo, ballMat)
  ball.castShadow = true
  scene.add(ball)
  const ringGeo = new THREE.RingGeometry(0.75, 0.85, 40)
  geos.add(ringGeo)
  const ringMat = new THREE.MeshBasicMaterial({ color: HOME, side: THREE.DoubleSide })
  mats.add(ringMat)
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  scene.add(ring)
  const receiverMat = new THREE.MeshBasicMaterial({
    color: 0xffdf76,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75,
  })
  mats.add(receiverMat)
  const receiverRing = new THREE.Mesh(ringGeo, receiverMat)
  receiverRing.rotation.x = -Math.PI / 2
  scene.add(receiverRing)
  const arrowGeo = new THREE.ConeGeometry(0.25, 0.4, 3)
  geos.add(arrowGeo)
  const arrow = new THREE.Mesh(arrowGeo, ringMat)
  arrow.rotation.z = Math.PI
  scene.add(arrow)
  const aimPositions = new Float32Array(6)
  const aimGeo = new THREE.BufferGeometry()
  aimGeo.setAttribute('position', new THREE.BufferAttribute(aimPositions, 3))
  geos.add(aimGeo)
  const aimMat = new THREE.MeshBasicMaterial({ color: 0xc7f476, transparent: true, opacity: 0.9 })
  mats.add(aimMat)
  const aimLine = new THREE.Line(aimGeo, aimMat)
  aimLine.frustumCulled = false
  scene.add(aimLine)
  const tipGeo = new THREE.ConeGeometry(0.31, 0.9, 5)
  geos.add(tipGeo)
  const aimTip = new THREE.Mesh(tipGeo, aimMat)
  aimTip.frustumCulled = false
  scene.add(aimTip)
  const flightPositions = new Float32Array(18 * 3)
  const flightGeo = new THREE.BufferGeometry()
  flightGeo.setAttribute('position', new THREE.BufferAttribute(flightPositions, 3))
  geos.add(flightGeo)
  const flightMat = new THREE.LineBasicMaterial({
    color: 0x9fe8ff,
    transparent: true,
    opacity: 0.88,
  })
  mats.add(flightMat)
  const flightLine = new THREE.Line(flightGeo, flightMat)
  flightLine.frustumCulled = false
  flightLine.visible = false
  scene.add(flightLine)
  let quality = 'balanced',
    wide = false,
    disposed = false
  const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  const updatePixelRatio = () => {
    const cap = quality === 'low' ? 1 : quality === 'high' ? (touchDevice ? 1.5 : 2) : touchDevice ? 1.25 : 1.5
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap))
  }
  const resize = () => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    if (camera.aspect < 1) {
      camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(45) / 2) / Math.max(camera.aspect, 0.52)),
      )
    } else camera.fov = 45
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()
  return {
    setQuality(value) {
      // Keep the handset cool while preserving the soft shadow and antialiasing.
      quality = value
      updatePixelRatio()
      const shadowSize = quality === 'low' ? 768 : touchDevice ? 1024 : quality === 'high' ? 2048 : 1536
      sun.shadow.mapSize.set(shadowSize, shadowSize)
      sun.shadow.needsUpdate = true
      renderer.shadowMap.enabled = quality !== 'low'
      resize()
    },
    setCamera(value) {
      wide = value
    },
    render(match, alpha, dt, playing, inputDirection, shotCharging) {
      if (disposed) return
      for (const p of match.players) {
        const mesh = playerMeshes[p.id]!
        mesh.position.set(
          THREE.MathUtils.lerp(p.prevX, p.x, alpha),
          0.14,
          THREE.MathUtils.lerp(p.prevZ, p.z, alpha),
        )
        const angle = Math.atan2(p.facingX, p.facingZ)
        let delta = angle - mesh.rotation.y
        delta = Math.atan2(Math.sin(delta), Math.cos(delta))
        mesh.rotation.y += delta * (1 - Math.exp(-14 * dt))
        const speed = Math.hypot(p.vx, p.vz)
        strideSpeeds[p.id] =
          strideSpeeds[p.id]! + (speed - strideSpeeds[p.id]!) * (1 - Math.exp(-10 * dt))
        if (match.phase === 'playing')
          stridePhases[p.id] = stridePhases[p.id]! + strideSpeeds[p.id]! * 1.6 * dt
        const stride = stridePhases[p.id]! + p.id * 0.4
        const amplitude = Math.min(0.72, strideSpeeds[p.id]! * 0.09)
        const swing = Math.sin(stride) * amplitude
        const parts = limbs[p.id]!
        if (parts.leftLeg) parts.leftLeg.rotation.x = swing
        if (parts.rightLeg) parts.rightLeg.rotation.x = -swing
        if (parts.leftKnee)
          parts.leftKnee.rotation.x = Math.max(0, Math.cos(stride)) * amplitude * 1.5
        if (parts.rightKnee)
          parts.rightKnee.rotation.x = Math.max(0, -Math.cos(stride)) * amplitude * 1.5
        if (parts.leftArm) parts.leftArm.rotation.x = -swing * 0.75 - 0.08
        if (parts.rightArm) parts.rightArm.rotation.x = swing * 0.75 - 0.08
        if (parts.leftElbow) parts.leftElbow.rotation.x = -0.45 - Math.abs(swing) * 0.5
        if (parts.rightElbow) parts.rightElbow.rotation.x = -0.45 - Math.abs(swing) * 0.5
        if (parts.body) {
          parts.body.rotation.z = Math.sin(stride) * amplitude * 0.05
          parts.body.rotation.x = Math.min(0.16, speed * 0.014)
        }
        mesh.position.y += Math.abs(Math.sin(stride)) * Math.min(0.055, speed * 0.006)
        if (p.action === 'kick' || p.action === 'tackle') {
          const duration = p.action === 'kick' ? 0.38 : 0.3
          const progress = 1 - p.actionTime / duration
          const extension = Math.sin(progress * Math.PI)
          if (parts.rightLeg) parts.rightLeg.rotation.x = -extension * 1.15
          if (parts.rightKnee) parts.rightKnee.rotation.x = 0.12
          if (parts.leftArm) parts.leftArm.rotation.z = -extension * 0.4
          if (parts.rightArm) parts.rightArm.rotation.z = extension * 0.4
        } else {
          if (parts.leftArm) parts.leftArm.rotation.z = -0.05
          if (parts.rightArm) parts.rightArm.rotation.z = 0.05
        }
        mesh.rotation.z =
          p.action === 'save'
            ? Math.sin(Math.PI * (1 - p.actionTime / 0.65)) * p.diveSide * p.facingX * 0.8
            : 0
        if (p.action === 'save' || (match.keeperInHands && match.owner === p.id)) {
          if (parts.leftArm) parts.leftArm.rotation.x = -1.2
          if (parts.rightArm) parts.rightArm.rotation.x = -1.2
        }
        const preparingThrow = match.setPiece?.kind === 'throw-in' && match.setPiece.taker === p.id
        if (preparingThrow || p.action === 'throw') {
          const followThrough = preparingThrow ? 0 : Math.min(1, (0.45 - p.actionTime) / 0.3)
          if (parts.leftArm) {
            parts.leftArm.rotation.x = -2.8 + followThrough * 1.5
            parts.leftArm.rotation.z = -0.12
          }
          if (parts.rightArm) {
            parts.rightArm.rotation.x = -2.8 + followThrough * 1.5
            parts.rightArm.rotation.z = 0.12
          }
          if (parts.leftElbow) parts.leftElbow.rotation.x = -0.6 + followThrough * 0.4
          if (parts.rightElbow) parts.rightElbow.rotation.x = -0.6 + followThrough * 0.4
          if (parts.leftLeg) parts.leftLeg.rotation.x = 0
          if (parts.rightLeg) parts.rightLeg.rotation.x = 0
          if (parts.leftKnee) parts.leftKnee.rotation.x = 0
          if (parts.rightKnee) parts.rightKnee.rotation.x = 0
          mesh.position.y = 0.14
        }
        mesh.updateMatrixWorld(true)
      }
      for (let i = 0; i < numbers.length; i++) {
        numbers[i]!.mesh.matrix.multiplyMatrices(playerMeshes[i]!.matrixWorld, numbers[i]!.local)
      }
      for (const batch of batches.values()) {
        for (let i = 0; i < batch.sources.length; i++)
          batch.mesh.setMatrixAt(i, batch.sources[i]!.matrixWorld)
        batch.mesh.instanceMatrix.needsUpdate = true
      }
      const b = match.ball
      ball.position.set(
        THREE.MathUtils.lerp(b.prevX, b.x, alpha),
        THREE.MathUtils.lerp(b.prevY, b.y, alpha),
        THREE.MathUtils.lerp(b.prevZ, b.z, alpha),
      )
      if (match.phase === 'playing') {
        ball.rotation.z -= (b.vx * dt) / 0.16
        ball.rotation.x += (b.vz * dt) / 0.16
      }
      receiverRing.visible = match.passTarget !== null
      if (match.passTarget !== null) {
        const receiver = playerMeshes[match.passTarget]!
        receiverRing.position.set(receiver.position.x, 0.24, receiver.position.z)
      }
      const active = playerMeshes[match.selected]!
      ring.position.set(active.position.x, 0.24, active.position.z)
      arrow.position.set(
        active.position.x,
        2.8 + Math.sin(match.elapsed * 3) * 0.08,
        active.position.z,
      )
      ring.visible = arrow.visible = playing
      const carrier = match.owner === null ? null : match.players[match.owner]!
      const showAim = playing && match.phase === 'playing' && carrier?.team === 0
      if (showAim && carrier) {
        const magnitude = Math.hypot(inputDirection.x, inputDirection.z)
        const direction =
          magnitude > 0.12
            ? { x: inputDirection.x / magnitude, z: inputDirection.z / magnitude }
            : { x: carrier.facingX, z: carrier.facingZ }
        let endX: number, endZ: number
        if (shotCharging && !match.keeperInHands) {
          endX = 53
          endZ = THREE.MathUtils.clamp(inputDirection.z, -1, 1) * 3.3
          aimMat.color.set(0xffd675)
        } else {
          endX = carrier.x + direction.x * 8
          endZ = carrier.z + direction.z * 8
          aimMat.color.set(0xc7f476)
        }
        const startX = ball.position.x,
          startZ = ball.position.z
        aimPositions[0] = startX
        aimPositions[1] = 0.27
        aimPositions[2] = startZ
        aimPositions[3] = endX
        aimPositions[4] = 0.27
        aimPositions[5] = endZ
        aimGeo.attributes.position!.needsUpdate = true
        aimGeo.computeBoundingSphere()
        aimTip.position.set(endX, 0.48, endZ)
        aimTip.rotation.set(Math.PI / 2, Math.atan2(endX - startX, endZ - startZ), 0)
        aimLine.visible = aimTip.visible = true
      } else aimLine.visible = aimTip.visible = false

      const hasUserKickInFlight =
        playing &&
        match.phase === 'playing' &&
        match.owner === null &&
        match.lastTouch === 0 &&
        Math.hypot(b.vx, b.vz) > 2
      flightLine.visible = hasUserKickInFlight
      if (hasUserKickInFlight) {
        const positions = flightGeo.attributes.position as THREE.BufferAttribute
        const goalShot = match.shotInFlightFor === 0
        const receiver = match.passTarget === null ? null : match.players[match.passTarget]!
        const time = goalShot
          ? THREE.MathUtils.clamp((53 - b.x) / Math.max(1, b.vx), 0.12, 1.8)
          : receiver
            ? THREE.MathUtils.clamp(
                Math.hypot(receiver.x - b.x, receiver.z - b.z) / Math.max(3, Math.hypot(b.vx, b.vz)),
                0.18,
                1.6,
              )
            : 0.75
        flightMat.color.set(goalShot ? 0xffd675 : 0x9fe8ff)
        for (let i = 0; i < 18; i++) {
          const t = (time * i) / 17
          positions.setXYZ(
            i,
            THREE.MathUtils.lerp(b.prevX, b.x, alpha) + b.vx * t,
            Math.max(0.29, THREE.MathUtils.lerp(b.prevY, b.y, alpha) + b.vy * t - 4.905 * t * t),
            THREE.MathUtils.lerp(b.prevZ, b.z, alpha) + b.vz * t,
          )
        }
        positions.needsUpdate = true
        flightGeo.computeBoundingSphere()
      }
      const aspect = camera.aspect
      const narrow = aspect < 1.2
      if (playing && match.setPiece && !wide) {
        const sign = match.setPiece.team === 0 ? 1 : -1
        const corner = match.setPiece.kind === 'corner'
        const throwing = match.setPiece.kind === 'throw-in'
        wanted.set(
          corner ? sign * 39 : b.x * 0.8,
          36 + (narrow ? 12 : 0),
          (corner ? b.z * 0.35 : throwing ? b.z * 0.72 : b.z * 0.4) + 48,
        )
        look.set(
          corner ? sign * 41 : b.x * 0.8,
          0,
          corner ? b.z * 0.35 : throwing ? b.z * 0.72 : b.z * 0.4,
        )
      } else if (playing && !wide) {
        wanted.set(b.x * 0.78, 29 + (narrow ? 13 : 0), b.z * 0.42 + 43)
        look.set(b.x * 0.78, 0, b.z * 0.42)
      } else {
        if (playing) {
          wanted.set(b.x * 0.3, 54 + (narrow ? 30 : 0), 74)
          look.set(b.x * 0.3, 0, 0)
        } else {
          wanted.set(12, 14 + (narrow ? 4 : 0), 28)
          look.set(0, 1, 0)
        }
      }
      const damping = 1 - Math.exp(-2.6 * dt)
      camera.position.lerp(wanted, damping)
      target.lerp(look, damping)
      camera.lookAt(target)
      renderer.render(scene, camera)
    },
    dispose() {
      disposed = true
      observer.disconnect()
      seats.dispose()
      crowd.dispose()
      heads.dispose()
      batches.forEach((b) => b.mesh.dispose())
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const materials = Array.isArray(o.material) ? o.material : [o.material]
          materials.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
    },
  }
}
