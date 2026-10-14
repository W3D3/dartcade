<!--
  A minigolf hole in 3D, drawn with three.js in a light cartoon look: toon shading in a few flat
  tones, the ground's real heights ($shared/minigolf/3d/ground.ts), soft shadows. Draws the balls in
  their colours, the aim dial and reach rings (`aim`) and the shot preview's lines (`aims`) on the
  ground. The camera looks over the whole hole, tilted; with `orbit` it circles a cup (a hole just
  played out); with `follow` it frames the ball and the
  next stretch of its roll from behind and above (chaseStep), and glides back when it's over.
  `freeCamera` hands the camera to OrbitControls (drag to orbit, wheel to zoom) and glides it back
  on once that's switched off. Course mm are scene units: x stays x, the course's y is three's z,
  heights go up in y.
-->
<script lang="ts">
  import * as THREE from 'three'
  import { onMount } from 'svelte'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { HALF, SEGS, segAngle } from '$shared/board'
  import { CUP_DEPTH, groundMesh, heightAt } from '$shared/minigolf/3d/ground'
  import { BALL_R, type Hole, type PathPt, type Pt } from '$shared/minigolf/types'
  import {
    CHASE_FOV,
    ORBIT_SPEED,
    chaseStep,
    framing,
    heightTint,
    orbitPose,
    startRenderer,
    type ChaseCam,
    type Insets,
  } from '$lib/minigolf/view3d'

  let {
    hole,
    ball,
    ballColor = '#c6f24e',
    others = [],
    aim = null,
    aims = [],
    follow = null,
    orbit = null,
    freeCamera = false,
    wallThickness = 20,
    felt = 'checker',
    shading = 'toon',
    insets = { left: 0, right: 0, top: 0, bottom: 0 },
    relief = 1,
    onfail,
  }: {
    hole: Hole
    /** The ball's centre: course x, y and its height, mm (on the ground when left out). */
    ball: PathPt
    ballColor?: string
    /** Other players' balls, in their colours. */
    others?: { seat: number; at: PathPt; color: string }[]
    /** The aim dial and reach rings (flat-felt roll, mm, for a treble and a double) around `at`. */
    aim?: { at: Pt; treble: number; double: number } | null
    /** Shot preview lines: dots as far as each putt would roll on flat felt; the current one bright. */
    aims?: { from: Pt; dir: Pt; roll: number; current: boolean }[]
    /** Chase the ball along its rolling path, at playback frame `at` (fractional, 60 Hz). */
    follow?: { path: PathPt[]; at: number } | null
    /** Circle the camera round this cup (a hole just played out). */
    orbit?: Pt | null
    /** Bench only: mouse/touch (OrbitControls) drives the camera instead of the automatic one. */
    freeCamera?: boolean
    wallThickness?: number
    /** Bench only: the ground's pattern, the 2D view's diagonal stripes or a checkerboard. */
    felt?: 'stripes' | 'checker'
    /** The felt's shading: a few flat tones (the cartoon look), or smooth, which shows gentle slopes. */
    shading?: 'toon' | 'smooth'
    /** How much of the canvas panels over it cover (px): the hole is framed in the rest. */
    insets?: Insets
    /** Bench only: how much taller than true the ground is drawn (the physics keeps true heights). */
    relief?: number
    /** WebGL couldn't start, or lost its context. */
    onfail?: () => void
  } = $props()

  const RAIL_HEIGHT = 70
  /** The aiming camera's tilt from straight down. */
  const TILT = THREE.MathUtils.degToRad(35)
  const FELT = '#2e7d4c'
  const FELT_DARK = '#28703f'
  const RAIL = '#efe6cc'
  const BUMPER = '#e04545'

  let host: HTMLDivElement
  let canvas: HTMLCanvasElement
  let failed = $state(false)

  /** Three tones and no blending between them: the cartoon look. */
  function toonRamp(): THREE.DataTexture {
    const tex = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat)
    tex.minFilter = tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true
    return tex
  }
  const ramp = toonRamp()
  const toon = (color: string, side: THREE.Side = THREE.FrontSide) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, side })

  /** The felt's pattern, `size` mm a tile: it bends and shrinks with the ground, showing its shape. */
  const FELT_TILE = { stripes: 56, checker: 100 }
  function feltTexture(kind: 'stripes' | 'checker'): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    if (g) {
      g.fillStyle = FELT_DARK
      g.fillRect(0, 0, 64, 64)
      g.fillStyle = FELT
      if (kind === 'checker') {
        g.fillRect(0, 0, 32, 32)
        g.fillRect(32, 32, 32, 32)
      } else g.fillRect(0, 0, 32, 64)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.anisotropy = 8
    // The 2D felt's stripes run at 35°
    if (kind === 'stripes') tex.rotation = THREE.MathUtils.degToRad(35)
    return tex
  }

  /** How far out the dial's numbers reach, in dial radii: the dial's plane is this big. */
  const DIAL_REACH = 1.6
  /** The 2D view's aim dial (HoleView), drawn once onto a texture: up the texture is -y on the course. */
  function dialTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')
    const d = 256 / DIAL_REACH
    const toward = (a: number, len: number) => [Math.cos(a) * len, -Math.sin(a) * len] as const
    if (g) {
      g.translate(256, 256)
      // A dark ring under the spokes, clear in the middle so the ball shows
      g.beginPath()
      g.arc(0, 0, d, 0, Math.PI * 2)
      g.arc(0, 0, d * 0.3, 0, Math.PI * 2, true)
      g.fillStyle = 'rgba(15, 16, 14, 0.62)'
      g.fill('evenodd')
      g.beginPath()
      g.arc(0, 0, d, 0, Math.PI * 2)
      g.lineWidth = d * 0.03
      g.strokeStyle = 'rgba(239, 238, 230, 0.55)'
      g.stroke()
      g.font = `700 ${d * 0.3}px ${getComputedStyle(document.body).fontFamily}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      SEGS.forEach((n, i) => {
        const a = segAngle(i)
        g.beginPath()
        g.moveTo(...toward(a + HALF, d * 0.3))
        g.lineTo(...toward(a + HALF, d))
        g.lineWidth = d * 0.02
        g.strokeStyle = 'rgba(239, 238, 230, 0.35)'
        g.stroke()
        const [x, y] = toward(a, d * 1.36)
        g.lineWidth = d * 0.07
        g.strokeStyle = '#0a0b09'
        g.strokeText(String(n), x, y)
        g.fillStyle = '#efeee6'
        g.fillText(String(n), x, y)
      })
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return tex
  }

  /** Lays a flat geometry (already in place on x/z) onto the ground, `lift` mm above it. */
  function hug(geo: THREE.BufferGeometry, lift: number): THREE.BufferGeometry {
    const pos = geo.getAttribute('position')
    for (let k = 0; k < pos.count; k++) pos.setY(k, heightAt(hole, [pos.getX(k), pos.getZ(k)]) * relief + lift)
    return geo
  }
  /** The aim guides (dial, reach rings, aim dots): drawn after everything else and through it, so a
   *  rail or bumper standing in front never cuts them off. */
  const GUIDES = 10
  const overlay = (o: THREE.MeshBasicMaterialParameters) =>
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, ...o })
  const guide = <T extends THREE.Object3D>(m: T): T => ((m.renderOrder = GUIDES), m)

  /** A ball's height as drawn: its own, or resting on the ground; raised with the ground's relief. */
  const drawnY = (p: PathPt) => {
    const ground = heightAt(hole, [p[0], p[1]])
    return (p[2] ?? ground + BALL_R) + (relief - 1) * ground
  }

  /** A block along ab, standing on the ground (rails and walls). */
  function block(a: Pt, b: Pt, material: THREE.Material, thickness = wallThickness): THREE.Mesh {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + thickness
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, RAIL_HEIGHT * 2, thickness), material)
    mesh.position.set(mid[0], heightAt(hole, mid) * relief, mid[1])
    mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0])
    mesh.castShadow = mesh.receiveShadow = true
    return mesh
  }

  function build(h: Hole): THREE.Group {
    const g = new THREE.Group()
    const { positions, indices } = groundMesh(h)
    for (let k = 1; k < positions.length; k += 3) positions[k] *= relief
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeVertexNormals()
    const tile = FELT_TILE[felt]
    const uv = new Float32Array((positions.length / 3) * 2)
    for (let k = 0; k < positions.length / 3; k++) uv.set([positions[k * 3] / tile, positions[k * 3 + 2] / tile], k * 2)
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    // Lighter up, darker down (from the true heights, before relief): the ground's shape shows from above
    const tint = new Float32Array(positions.length)
    for (let k = 0; k < positions.length / 3; k++) tint.fill(heightTint(positions[k * 3 + 1] / relief), k * 3, k * 3 + 3)
    geo.setAttribute('color', new THREE.BufferAttribute(tint, 3))
    const feltMat =
      shading === 'smooth'
        ? new THREE.MeshLambertMaterial({ map: feltTexture(felt), vertexColors: true })
        : new THREE.MeshToonMaterial({ map: feltTexture(felt), gradientMap: ramp, vertexColors: true })
    const ground = new THREE.Mesh(geo, feltMat)
    ground.receiveShadow = true
    g.add(ground)

    const rail = toon(RAIL)
    const ring = (pts: readonly Pt[], closed: boolean) => (closed ? [...pts, pts[0]] : pts)
    const edges = ring(h.outline, true)
    for (let i = 1; i < edges.length; i++) g.add(block(edges[i - 1], edges[i], rail))
    for (const w of h.walls) {
      const pts = ring(w.points, w.closed ?? false)
      for (let i = 1; i < pts.length; i++) g.add(block(pts[i - 1], pts[i], rail, w.thickness))
    }
    for (const b of h.bumpers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, RAIL_HEIGHT * 2, 32), toon(BUMPER))
      m.position.set(b.at[0], heightAt(h, b.at) * relief, b.at[1])
      m.castShadow = m.receiveShadow = true
      g.add(m)
    }

    // The cup: a dark tube down into the hole (48 sides, on the ground's rim points), and the flag
    const [cx, cy] = h.cup.at
    const cupH = heightAt(h, h.cup.at) * relief
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(h.cup.r, h.cup.r, CUP_DEPTH, 48, 1, true), toon('#15170f', THREE.BackSide))
    tube.position.set(cx, cupH - CUP_DEPTH / 2, cy)
    g.add(tube)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(h.cup.r, 48), toon('#0a0b07'))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(cx, cupH - CUP_DEPTH, cy)
    g.add(floor)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 520, 8), toon('#f4f1e6'))
    pole.position.set(cx + h.cup.r * 0.55, cupH + 260, cy)
    pole.castShadow = true
    g.add(pole)
    const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(170, -45), new THREE.Vector2(0, -90)])
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), toon('#c6f24e', THREE.DoubleSide))
    flag.position.set(cx + h.cup.r * 0.55, cupH + 520, cy)
    flag.castShadow = true
    g.add(flag)

    // The tee: a darker mat
    const tee = new THREE.Mesh(new THREE.BoxGeometry(110, 4, 110), toon('#1f5a36'))
    tee.position.set(h.tee[0], heightAt(h, h.tee) * relief + 1, h.tee[1])
    tee.receiveShadow = true
    g.add(tee)
    return g
  }

  // `instanceof THREE.Mesh` narrows to Mesh<any>; three's own flag doesn't
  const isMesh = (o: THREE.Object3D): o is THREE.Mesh => 'isMesh' in o

  function dispose(g: THREE.Object3D): void {
    g.traverse(o => {
      if (!isMesh(o)) return
      o.geometry.dispose()
      for (const m of [o.material].flat()) {
        if (m instanceof THREE.MeshToonMaterial) m.map?.dispose()
        m.dispose()
      }
    })
  }

  // Set up once, untracked: the loop reads the props every frame, and a re-run would rebuild the scene and snap the camera
  onMount(() => {
    const renderer = startRenderer(canvas)
    if (!renderer) {
      failed = true
      onfail?.()
      return
    }
    const lost = () => onfail?.()
    canvas.addEventListener('webglcontextlost', lost)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0a0b09')
    const camera = new THREE.PerspectiveCamera(CHASE_FOV, 1, 10, 40000)
    // Drives the camera only while `freeCamera` is on; disabled otherwise so the automatic camera owns it
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.enabled = false
    let controlsOn = false
    scene.add(new THREE.HemisphereLight('#ffffff', '#4a5a40', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 2.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.radius = 4
    scene.add(sun, sun.target)

    // Shot preview lines: up to AIM_DOTS dots each, AIM_GAP mm apart; the current one bright, replaced ones faint
    const AIM_DOTS = 120
    const AIM_GAP = 50
    const dotLine = (opacity: number) => {
      const m = guide(new THREE.InstancedMesh(new THREE.CircleGeometry(9, 12), overlay({ color: '#c6f24e', opacity }), AIM_DOTS * 3))
      m.frustumCulled = false
      scene.add(m)
      return m
    }
    const bright = dotLine(0.9)
    const faint = dotLine(0.35)
    const dot = new THREE.Object3D()
    dot.rotation.x = -Math.PI / 2
    function placeDots(): void {
      bright.count = faint.count = 0
      for (const line of aims) {
        const dots = line.current ? bright : faint
        for (let k = 0; k < Math.min(AIM_DOTS, Math.floor(line.roll / AIM_GAP)) && dots.count < AIM_DOTS * 3; k++) {
          const p: Pt = [line.from[0] + line.dir[0] * AIM_GAP * (k + 1), line.from[1] + line.dir[1] * AIM_GAP * (k + 1)]
          dot.position.set(p[0], heightAt(hole, p) * relief + 3, p[1])
          dot.updateMatrix()
          dots.setMatrixAt(dots.count++, dot.matrix)
        }
      }
      bright.instanceMatrix.needsUpdate = faint.instanceMatrix.needsUpdate = true
    }

    // The aim dial and the reach rings, laid on the ground around the ball
    const dialMat = overlay({ map: dialTexture() })
    const ringMat = overlay({ color: '#efeee6', opacity: 0.45 })
    let aimGroup = new THREE.Group()
    function placeAim(): void {
      scene.remove(aimGroup)
      // Its materials are kept for the next layout
      for (const m of aimGroup.children) if (isMesh(m)) m.geometry.dispose()
      aimGroup = new THREE.Group()
      scene.add(aimGroup)
      if (!aim) return
      const [x, z] = aim.at
      // The dial keeps the 2D view's size: a share of the hole
      const dial = (Math.max(box.w, box.d) + 240) * 0.06
      const flat = (geo: THREE.BufferGeometry) => hug(geo.rotateX(-Math.PI / 2).translate(x, 0, z), 2)
      for (const r of [aim.treble, aim.double]) {
        aimGroup.add(guide(new THREE.Mesh(flat(new THREE.RingGeometry(r - dial * 0.025, r + dial * 0.025, 128)), ringMat)))
      }
      const size = dial * DIAL_REACH * 2
      aimGroup.add(guide(new THREE.Mesh(flat(new THREE.PlaneGeometry(size, size, 16, 16)), dialMat)))
    }

    const sphere = new THREE.SphereGeometry(BALL_R, 24, 16)
    const ballMesh = new THREE.Mesh(sphere, toon(ballColor))
    ballMesh.castShadow = true
    scene.add(ballMesh)
    const otherMeshes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshToonMaterial>[] = []
    function placeBalls(): void {
      ballMesh.material.color.set(ballColor)
      // While aiming the ball sits on top of its dial, as in 2D; rolling, walls hide it as they should
      ballMesh.renderOrder = aim ? GUIDES + 1 : 0
      ballMesh.material.depthTest = !aim
      ballMesh.position.set(ball[0], drawnY(ball), ball[1])
      others.forEach((o, i) => {
        if (!otherMeshes[i]) {
          otherMeshes[i] = new THREE.Mesh(sphere, toon(o.color))
          otherMeshes[i].castShadow = true
          scene.add(otherMeshes[i])
        }
        otherMeshes[i].material.color.set(o.color)
        // A ball below the rim is drawn down in the cup: its height says so
        otherMeshes[i].position.set(o.at[0], drawnY(o.at), o.at[1])
      })
      otherMeshes.forEach((m, i) => (m.visible = i < others.length))
    }

    let course = new THREE.Group()
    let built: Hole | null = null
    let builtFelt = felt
    let builtShading = shading
    let builtRelief = relief
    const box = { cx: 0, cz: 0, w: 1, d: 1 }
    function rebuild(h: Hole): void {
      scene.remove(course)
      dispose(course)
      course = build(h)
      scene.add(course)
      built = h
      builtFelt = felt
      builtShading = shading
      builtRelief = relief
      const xs = h.outline.map(p => p[0])
      const ys = h.outline.map(p => p[1])
      box.w = Math.max(...xs) - Math.min(...xs)
      box.d = Math.max(...ys) - Math.min(...ys)
      box.cx = (Math.max(...xs) + Math.min(...xs)) / 2
      box.cz = (Math.max(...ys) + Math.min(...ys)) / 2
      // A low sun from the left, so slopes facing it and facing away land in different tones
      const reach = Math.max(box.w, box.d)
      sun.position.set(box.cx - reach * 1.1, reach * 0.6, box.cz - reach * 0.3)
      sun.target.position.set(box.cx, 0, box.cz)
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: reach * 4 })
      sun.shadow.camera.updateProjectionMatrix()
      placed = null
    }
    /** What the overlays were last laid out for: they're redone when it changes. */
    let placed: { aim: typeof aim; aims: typeof aims } | null = null
    // The chase camera's path, as drawn (with the relief), worked out once a roll
    let chased: { path: PathPt[]; drawn: PathPt[] } | null = null

    let size = { w: 1, h: 1 }
    let framed = ''
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      size = { w: Math.max(1, w), h: Math.max(1, h) }
      renderer.setSize(w, h, false)
      camera.aspect = size.w / size.h
      framed = ''
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    // The camera glides between where it should be, rather than jumping
    const eye = new THREE.Vector3()
    const look = new THREE.Vector3()
    let first = true
    let chaseCam: ChaseCam | null = null
    let orbitAngle: number | null = null
    let then = performance.now()
    renderer.setAnimationLoop(now => {
      const dt = Math.min(0.1, (now - then) / 1000)
      then = now
      if (built !== hole || builtFelt !== felt || builtShading !== shading || builtRelief !== relief) rebuild(hole)
      if (!placed || placed.aim !== aim || placed.aims !== aims) {
        placeAim()
        placeDots()
        placed = { aim, aims }
      }
      placeBalls()
      // The hole is framed where the panels leave the canvas free: the camera's centre goes there
      const view = framing(size.w, size.h, insets)
      const key = `${size.w}:${size.h}:${view.offsetX}:${view.offsetY}`
      if (key !== framed) {
        camera.setViewOffset(size.w, size.h, view.offsetX, view.offsetY, size.w, size.h)
        camera.updateProjectionMatrix()
        framed = key
      }

      if (freeCamera) {
        // Orbiting owns the camera; seed its pivot on the ball the moment it's switched on
        if (!controlsOn) {
          controls.target.set(ball[0], drawnY(ball), ball[1])
          controls.enabled = controlsOn = true
        }
        controls.update()
        // Kept live so the automatic camera glides on from here once free camera switches off
        eye.copy(camera.position)
        look.copy(controls.target)
        chaseCam = null
      } else {
        if (controlsOn) controls.enabled = controlsOn = false
        if (orbit) {
          chaseCam = null
          const cup: [number, number, number] = [orbit[0], orbit[1], heightAt(hole, orbit) * relief]
          // Round from wherever the camera is, gliding onto the circle
          orbitAngle ??= Math.atan2(eye.z - cup[1], eye.x - cup[0])
          orbitAngle += ORBIT_SPEED * dt
          const pose = orbitPose(cup, orbitAngle)
          const k = 1 - Math.exp(-dt * 2)
          eye.lerp(new THREE.Vector3(pose.eye[0], pose.eye[2], pose.eye[1]), k)
          look.lerp(new THREE.Vector3(cup[0], cup[2], cup[1]), k)
        } else if (follow) {
          orbitAngle = null
          if (chased?.path !== follow.path) chased = { path: follow.path, drawn: follow.path.map(p => [p[0], p[1], drawnY(p)]) }
          // The chase eases on from wherever the camera is (in course space: x, y, height)
          const from = new THREE.Vector3().subVectors(look, eye)
          const flat = new THREE.Vector2(from.x, from.z).normalize()
          chaseCam ??= first
            ? null
            : {
                look: [look.x, look.z, look.y],
                dir: [flat.x, flat.y],
                pitch: Math.asin(-from.y / from.length()),
                dist: from.length() / view.scale,
              }
          const step = chaseStep(chaseCam, chased.drawn, follow.at, dt, view.aspect)
          chaseCam = step.cam
          look.set(step.look[0], step.look[2], step.look[1])
          // Backed off so what the chase frames fits the free part of the canvas
          eye.set(step.eye[0], step.eye[2], step.eye[1]).sub(look).multiplyScalar(view.scale).add(look)
        } else {
          chaseCam = null
          orbitAngle = null
          const wantEye = new THREE.Vector3()
          const wantLook = new THREE.Vector3()
          // From above and a little behind the tee's end (the course's y runs down the screen, as
          // in 2D), tilted enough that the ground's ups and downs show
          const fit = Math.max(box.d, box.w / view.aspect) * 1.12
          const dist = ((fit / 2) * view.scale) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
          wantEye.set(box.cx, dist * Math.cos(TILT), box.cz + dist * Math.sin(TILT))
          wantLook.set(box.cx, 0, box.cz)
          const k = first ? 1 : 1 - Math.exp(-dt * 3)
          eye.lerp(wantEye, k)
          look.lerp(wantLook, k)
        }
        camera.position.copy(eye)
        camera.lookAt(look)
      }
      first = false
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      controls.dispose()
      canvas.removeEventListener('webglcontextlost', lost)
      observer.disconnect()
      dispose(course)
      for (const m of aimGroup.children) if (isMesh(m)) m.geometry.dispose()
      dialMat.map?.dispose()
      dialMat.dispose()
      ringMat.dispose()
      for (const o of [ballMesh, bright, faint, ...otherMeshes]) dispose(o)
      renderer.dispose()
    }
  })
</script>

<div bind:this={host} class="h-full w-full" data-testid="hole-3d">
  <canvas bind:this={canvas} hidden={failed} class="block h-full w-full"></canvas>
</div>
