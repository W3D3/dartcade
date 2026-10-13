<!--
  A minigolf hole in 3D (a bench experiment), drawn with three.js in a light cartoon look: toon
  shading in a few flat tones, the ground's real heights ($shared/minigolf/3d/ground.ts), soft shadows.
  The camera looks straight down while aiming; with `follow` it chases the ball from behind and
  above, and glides back when the ball stops. Course mm are scene units: x stays x, the course's y
  is three's z, heights go up in y.
-->
<script lang="ts">
  import * as THREE from 'three'
  import { untrack } from 'svelte'
  import { groundMesh, heightAt } from '$shared/minigolf/3d/ground'
  import { BALL_R, type Hole, type Pt } from '$shared/minigolf/types'

  let {
    hole,
    ball,
    ballColor = '#c6f24e',
    follow = false,
    wallThickness = 20,
    felt = 'stripes',
    relief = 1,
    aim = null,
  }: {
    hole: Hole
    /** The ball's centre: course x, y and its height, mm. */
    ball: readonly [number, number, number]
    ballColor?: string
    /** Chase the ball (while it rolls); otherwise look down on the whole hole. */
    follow?: boolean
    wallThickness?: number
    /** The ground's pattern: the 2D view's diagonal stripes, or a checkerboard. */
    felt?: 'stripes' | 'checker'
    /** How much taller than true the ground is drawn (the physics keeps true heights). */
    relief?: number
    /** The putt the pointer would make: dots along the ground as far as it would roll on flat felt. */
    aim?: { from: Pt; dir: Pt; roll: number } | null
  } = $props()

  const RAIL_HEIGHT = 70
  /** The aiming camera's tilt from straight down. */
  const TILT = THREE.MathUtils.degToRad(35)
  const CUP_DEPTH = 120
  const FELT = '#2e7d4c'
  const FELT_DARK = '#28703f'
  const RAIL = '#efe6cc'
  const BUMPER = '#e04545'

  let host: HTMLDivElement
  let canvas: HTMLCanvasElement

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

  /** A block along ab, standing on the ground (rails and walls). */
  function block(a: Pt, b: Pt, material: THREE.Material): THREE.Mesh {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + wallThickness
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, RAIL_HEIGHT * 2, wallThickness), material)
    mesh.position.set(mid[0], heightAt(hole, mid) * relief, mid[1])
    mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0])
    mesh.castShadow = mesh.receiveShadow = true
    return mesh
  }

  function build(h: Hole): THREE.Group {
    const g = new THREE.Group()
    const { positions, indices } = groundMesh(h, 20)
    for (let k = 1; k < positions.length; k += 3) positions[k] *= relief
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.computeVertexNormals()
    const tile = FELT_TILE[felt]
    const uv = new Float32Array((positions.length / 3) * 2)
    for (let k = 0; k < positions.length / 3; k++) uv.set([positions[k * 3] / tile, positions[k * 3 + 2] / tile], k * 2)
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const feltMat = new THREE.MeshToonMaterial({ map: feltTexture(felt), gradientMap: ramp })
    const ground = new THREE.Mesh(geo, feltMat)
    ground.receiveShadow = true
    g.add(ground)

    const rail = toon(RAIL)
    const ring = (pts: readonly Pt[], closed: boolean) => (closed ? [...pts, pts[0]] : pts)
    const edges = ring(h.outline, true)
    for (let i = 1; i < edges.length; i++) g.add(block(edges[i - 1], edges[i], rail))
    for (const w of h.walls) {
      const pts = ring(w.points, w.closed ?? false)
      for (let i = 1; i < pts.length; i++) g.add(block(pts[i - 1], pts[i], rail))
    }
    for (const b of h.bumpers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, RAIL_HEIGHT * 2, 32), toon(BUMPER))
      m.position.set(b.at[0], heightAt(h, b.at) * relief, b.at[1])
      m.castShadow = m.receiveShadow = true
      g.add(m)
    }

    // The cup: a dark tube down into the hole, and the flag
    const [cx, cy] = h.cup.at
    const cupH = heightAt(h, h.cup.at) * relief
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(h.cup.r, h.cup.r, CUP_DEPTH, 32, 1, true), toon('#15170f', THREE.BackSide))
    tube.position.set(cx, cupH - CUP_DEPTH / 2, cy)
    g.add(tube)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(h.cup.r, 32), toon('#0a0b07'))
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

  $effect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0a0b09')
    const camera = new THREE.PerspectiveCamera(32, 1, 10, 40000)
    scene.add(new THREE.HemisphereLight('#ffffff', '#4a5a40', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 2.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.radius = 4
    scene.add(sun, sun.target)

    // The aim line: up to AIM_DOTS dots, AIM_GAP mm apart, drawn just above the ground
    const AIM_DOTS = 120
    const AIM_GAP = 50
    const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(9, 12), new THREE.MeshBasicMaterial({ color: '#c6f24e' }), AIM_DOTS)
    dots.frustumCulled = false
    scene.add(dots)
    const dot = new THREE.Object3D()
    dot.rotation.x = -Math.PI / 2
    function placeDots(): void {
      const n = aim ? Math.min(AIM_DOTS, Math.floor(aim.roll / AIM_GAP)) : 0
      for (let k = 0; k < n && aim; k++) {
        const p: Pt = [aim.from[0] + aim.dir[0] * AIM_GAP * (k + 1), aim.from[1] + aim.dir[1] * AIM_GAP * (k + 1)]
        dot.position.set(p[0], heightAt(hole, p) * relief + 3, p[1])
        dot.updateMatrix()
        dots.setMatrixAt(k, dot.matrix)
      }
      dots.count = n
      dots.instanceMatrix.needsUpdate = true
    }

    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), toon(ballColor))
    ballMesh.castShadow = true
    scene.add(ballMesh)

    let course = new THREE.Group()
    let built: Hole | null = null
    let builtFelt = untrack(() => felt)
    let builtRelief = untrack(() => relief)
    const box = { cx: 0, cz: 0, w: 1, d: 1 }
    function rebuild(h: Hole): void {
      scene.remove(course)
      dispose(course)
      course = build(h)
      scene.add(course)
      built = h
      builtFelt = felt
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
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    // The camera glides between where it should be, rather than jumping
    const eye = new THREE.Vector3()
    const look = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const heading = new THREE.Vector3(0, 0, -1)
    const last = new THREE.Vector3()
    let first = true
    let then = performance.now()
    renderer.setAnimationLoop(now => {
      const dt = Math.min(0.1, (now - then) / 1000)
      then = now
      if (built !== hole || builtFelt !== felt || builtRelief !== relief) rebuild(hole)
      // The ball keeps its height above the ground, which is drawn `relief` times taller
      const at = new THREE.Vector3(ball[0], ball[2] + (relief - 1) * heightAt(hole, [ball[0], ball[1]]), ball[1])
      ballMesh.position.copy(at)
      placeDots()
      const moved = at.clone().sub(last).setY(0)
      if (moved.lengthSq() > 1) heading.lerp(moved.normalize(), 1 - Math.exp(-dt * 6)).normalize()
      last.copy(at)

      const wantEye = new THREE.Vector3()
      const wantLook = new THREE.Vector3()
      const wantUp = new THREE.Vector3()
      if (follow) {
        wantEye
          .copy(at)
          .addScaledVector(heading, -650)
          .setY(at.y + 420)
        wantLook.copy(at).addScaledVector(heading, 350)
        wantUp.set(0, 1, 0)
      } else {
        // From above and a little behind the tee's end (the course's y runs down the screen, as
        // in 2D), tilted enough that the ground's ups and downs show
        const fit = Math.max(box.d, box.w / camera.aspect) * 1.12
        const dist = fit / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        wantEye.set(box.cx, dist * Math.cos(TILT), box.cz + dist * Math.sin(TILT))
        wantLook.set(box.cx, 0, box.cz)
        wantUp.set(0, 1, 0)
      }
      const k = first ? 1 : 1 - Math.exp(-dt * 3)
      first = false
      eye.lerp(wantEye, k)
      look.lerp(wantLook, k)
      up.lerp(wantUp, k).normalize()
      camera.position.copy(eye)
      camera.up.copy(up)
      camera.lookAt(look)
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      dispose(course)
      dispose(ballMesh)
      dots.geometry.dispose()
      dots.material.dispose()
      renderer.dispose()
    }
  })
</script>

<div bind:this={host} class="h-full w-full" data-testid="hole-3d"><canvas bind:this={canvas} class="block h-full w-full"></canvas></div>
