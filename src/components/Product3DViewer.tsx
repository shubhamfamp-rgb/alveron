import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCw, Layers, RotateCcw } from 'lucide-react';
import type { FinishOption, Model3DBlueprint } from '../types.ts';

interface Product3DViewerProps {
  blueprint: Model3DBlueprint;
  productTitle: string;
  selectedFinish?: string;
  onSelectFinish?: (finishName: string) => void;
  compact?: boolean;
}

function createProceduralWeaveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2d3036';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 4) {
      for (let x = 0; x < 256; x += 4) {
        const shade = ((x + y) % 8 === 0) ? 58 : 38;
        ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.12)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWatchDialTexture(accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#181c22';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#6c7684';
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r1 = 185;
      const r2 = i % 3 === 0 ? 215 : 204;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
      ctx.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '600 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALVERON', 256, 175);
    // Hands
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(188, 178);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(352, 165);
    ctx.stroke();

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256, 285);
    ctx.lineTo(256, 118);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface ExplodablePart {
  mesh: THREE.Object3D;
  restPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

function buildCompositeProductModel(
  blueprint: Model3DBlueprint,
  primaryMat: THREE.MeshPhysicalMaterial,
  secondaryMat: THREE.MeshStandardMaterial,
  accentMat: THREE.MeshPhysicalMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  weaveTex: THREE.CanvasTexture,
): { group: THREE.Group; parts: ExplodablePart[] } {
  const group = new THREE.Group();
  const parts: ExplodablePart[] = [];

  const registerPart = (mesh: THREE.Object3D, explodeOffset: THREE.Vector3) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parts.push({
      mesh,
      restPos: mesh.position.clone(),
      explodeOffset,
    });
    group.add(mesh);
  };

  const shape = blueprint.shape;

  if (shape === 'headphones') {
    // Headband arch
    const archGeo = new THREE.TorusGeometry(0.95, 0.09, 20, 64, Math.PI * 1.06);
    const arch = new THREE.Mesh(archGeo, primaryMat);
    arch.position.set(0, 1.32, 0);
    arch.rotation.z = -0.09;
    registerPart(arch, new THREE.Vector3(0, 0.45, 0));

    // Inner padded headband cushion
    const padGeo = new THREE.TorusGeometry(0.87, 0.065, 16, 48, Math.PI * 0.85);
    const pad = new THREE.Mesh(padGeo, secondaryMat);
    pad.position.set(0, 1.32, 0);
    pad.rotation.z = 0.24;
    registerPart(pad, new THREE.Vector3(0, 0.28, 0));

    // Left & Right yokes, shells, cushions, and acoustic rings
    for (const side of [-1, 1]) {
      const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 20), primaryMat);
      yoke.position.set(side * 0.94, 0.95, 0);
      yoke.rotation.z = side * 0.1;
      registerPart(yoke, new THREE.Vector3(side * 0.3, 0.15, 0));

      const cupShell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.39, 0.18, 40), primaryMat);
      cupShell.rotation.z = Math.PI / 2;
      cupShell.position.set(side * 0.85, 0.56, 0);
      registerPart(cupShell, new THREE.Vector3(side * 0.5, 0, 0));

      const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 24, 48), secondaryMat);
      cushion.rotation.y = Math.PI / 2;
      cushion.position.set(side * 0.72, 0.56, 0);
      registerPart(cushion, new THREE.Vector3(side * 0.22, 0, 0));

      const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 16, 48), accentMat);
      trimRing.rotation.y = Math.PI / 2;
      trimRing.position.set(side * 0.95, 0.56, 0);
      registerPart(trimRing, new THREE.Vector3(side * 0.65, 0, 0));
    }
  } else if (shape === 'watch') {
    const bandMat = new THREE.MeshStandardMaterial({
      color: blueprint.secondaryColor,
      map: weaveTex,
      roughness: 0.85,
      metalness: 0.05,
    });
    const dialTex = createWatchDialTexture(blueprint.accentColor);
    const dialMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      roughness: 0.3,
      metalness: 0.1,
    });

    // Rounded rectangular case via ExtrudeGeometry
    const caseShape = new THREE.Shape();
    const w = 0.54;
    const h = 0.66;
    const r = 0.14;
    caseShape.moveTo(-w + r, -h);
    caseShape.lineTo(w - r, -h);
    caseShape.quadraticCurveTo(w, -h, w, -h + r);
    caseShape.lineTo(w, h - r);
    caseShape.quadraticCurveTo(w, h, w - r, h);
    caseShape.lineTo(-w + r, h);
    caseShape.quadraticCurveTo(-w, h, -w, h - r);
    caseShape.lineTo(-w, -h + r);
    caseShape.quadraticCurveTo(-w, -h, -w + r, -h);

    const caseGeo = new THREE.ExtrudeGeometry(caseShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
    });
    caseGeo.center();
    const chassis = new THREE.Mesh(caseGeo, primaryMat);
    chassis.position.set(0, 0.98, 0);
    registerPart(chassis, new THREE.Vector3(0, 0, 0));

    // Watch dial
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.12), dialMat);
    dial.position.set(0, 0.98, 0.165);
    registerPart(dial, new THREE.Vector3(0, 0, 0.28));

    // Sapphire glass dome
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.18, 0.04), glassMat);
    glass.position.set(0, 0.98, 0.19);
    registerPart(glass, new THREE.Vector3(0, 0, 0.55));

    // Digital Crown & Side Action Button
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 24), primaryMat);
    crown.rotation.z = Math.PI / 2;
    crown.position.set(0.62, 1.15, 0);
    registerPart(crown, new THREE.Vector3(0.35, 0, 0));

    const actionBtn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.1), accentMat);
    actionBtn.position.set(-0.59, 0.92, 0);
    registerPart(actionBtn, new THREE.Vector3(-0.35, 0, 0));

    // Woven loop band
    const bandLoop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.52, 48, 1, true, Math.PI * 0.25, Math.PI * 1.5),
      bandMat,
    );
    bandLoop.rotation.z = Math.PI / 2;
    bandLoop.rotation.y = Math.PI / 2;
    bandLoop.position.set(0, 0.62, -0.35);
    registerPart(bandLoop, new THREE.Vector3(0, -0.35, -0.35));
  } else if (shape === 'camera') {
    // Milled camera body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.05, 0.54), secondaryMat);
    body.position.set(0, 0.62, 0);
    registerPart(body, new THREE.Vector3(0, 0, 0));

    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.28, 0.56), primaryMat);
    topPlate.position.set(0, 1.18, 0);
    registerPart(topPlate, new THREE.Vector3(0, 0.35, 0));

    // Lens barrel + inner optics
    const barrelOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.55, 48), secondaryMat);
    barrelOuter.rotation.x = Math.PI / 2;
    barrelOuter.position.set(-0.1, 0.62, 0.48);
    registerPart(barrelOuter, new THREE.Vector3(0, 0, 0.45));

    const focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.03, 16, 48), primaryMat);
    focusRing.position.set(-0.1, 0.62, 0.58);
    registerPart(focusRing, new THREE.Vector3(0, 0, 0.65));

    const frontGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 36), glassMat);
    frontGlass.rotation.x = Math.PI / 2;
    frontGlass.position.set(-0.1, 0.62, 0.76);
    registerPart(frontGlass, new THREE.Vector3(0, 0, 0.85));

    // Top dials + viewfinder + red accent dot
    const shutterDial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 32), primaryMat);
    shutterDial.position.set(0.58, 1.36, 0);
    registerPart(shutterDial, new THREE.Vector3(0, 0.55, 0));

    const isoDial = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 32), primaryMat);
    isoDial.position.set(-0.55, 1.35, 0);
    registerPart(isoDial, new THREE.Vector3(0, 0.55, 0));

    const viewfinder = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), glassMat);
    viewfinder.position.set(-0.58, 1.18, 0.29);
    registerPart(viewfinder, new THREE.Vector3(0, 0.35, 0.25));

    const badgeDot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 24), accentMat);
    badgeDot.rotation.x = Math.PI / 2;
    badgeDot.position.set(0.55, 0.92, 0.28);
    registerPart(badgeDot, new THREE.Vector3(0, 0, 0.25));
  } else if (shape === 'lamp') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.78), primaryMat);
    base.position.set(-0.35, 0.08, 0);
    registerPart(base, new THREE.Vector3(0, -0.25, 0));

    const dimmerDial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 28), primaryMat);
    dimmerDial.position.set(-0.1, 0.18, 0.15);
    registerPart(dimmerDial, new THREE.Vector3(0, 0.2, 0));

    const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.45, 24), primaryMat);
    lowerArm.position.set(-0.22, 0.78, 0);
    lowerArm.rotation.z = -0.35;
    registerPart(lowerArm, new THREE.Vector3(-0.2, 0.15, 0));

    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 32), secondaryMat);
    hinge.rotation.x = Math.PI / 2;
    hinge.position.set(0.04, 1.46, 0);
    registerPart(hinge, new THREE.Vector3(0, 0.38, 0));

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 24), primaryMat);
    upperArm.position.set(0.45, 1.18, 0);
    upperArm.rotation.z = 0.92;
    registerPart(upperArm, new THREE.Vector3(0.25, 0.35, 0));

    const headBar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.78, 24), primaryMat);
    headBar.rotation.z = Math.PI / 2;
    headBar.position.set(0.98, 0.9, 0);
    registerPart(headBar, new THREE.Vector3(0.5, 0.3, 0));

    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.04, 0.09),
      new THREE.MeshStandardMaterial({
        color: '#FFF4D8',
        emissive: new THREE.Color('#FFD996'),
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    ledStrip.position.set(0.98, 0.84, 0);
    registerPart(ledStrip, new THREE.Vector3(0.5, 0.12, 0));
  } else {
    // Default sculptural acoustic speaker / hardware cylinder
    const weaveMat = new THREE.MeshStandardMaterial({
      color: blueprint.primaryColor,
      map: weaveTex,
      roughness: 0.78,
      metalness: 0.12,
    });
    const baseFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.62, 0.14, 48), secondaryMat);
    baseFoot.position.set(0, 0.08, 0);
    registerPart(baseFoot, new THREE.Vector3(0, -0.35, 0));

    const metalCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.42, 48), primaryMat);
    metalCollar.position.set(0, 0.36, 0);
    registerPart(metalCollar, new THREE.Vector3(0, -0.1, 0));

    const acousticBody = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 1.12, 48), weaveMat);
    acousticBody.position.set(0, 1.12, 0);
    registerPart(acousticBody, new THREE.Vector3(0, 0.22, 0));

    const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.67, 0.08, 48), primaryMat);
    topPlate.position.set(0, 1.72, 0);
    registerPart(topPlate, new THREE.Vector3(0, 0.55, 0));

    const touchRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 16, 48), accentMat);
    touchRing.rotation.x = Math.PI / 2;
    touchRing.position.set(0, 1.77, 0);
    registerPart(touchRing, new THREE.Vector3(0, 0.72, 0));
  }

  return { group, parts };
}

export function Product3DViewer({
  blueprint,
  productTitle,
  selectedFinish,
  onSelectFinish,
  compact = false,
}: Product3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [autoSpin, setAutoSpin] = useState(true);
  const [explode, setExplode] = useState(0);
  const [contextLost, setContextLost] = useState(false);

  const autoSpinRef = useRef(autoSpin);
  const explodeRef = useRef(explode);
  const resetCamRef = useRef<(() => void) | null>(null);
  const finishColorRef = useRef<FinishOption | null>(null);

  autoSpinRef.current = autoSpin;
  explodeRef.current = explode;

  const activeFinish =
    blueprint.finishes.find((f) => f.name === selectedFinish) ?? blueprint.finishes[0];
  finishColorRef.current = activeFinish ?? null;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = Math.max(300, container.clientWidth);
    const height = Math.max(280, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F5F5F7');
    scene.fog = new THREE.Fog('#F5F5F7', 8, 18);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 40);
    camera.position.set(2.8, 2.0, 3.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Three-point warm/cool studio lighting
    const hemi = new THREE.HemisphereLight(0xf1f5f9, 0xd6d3d1, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.55);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 2.5;
    keyLight.shadow.camera.bottom = -2.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.95);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    // Contact shadow plane
    const shadowTex = createContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.005;
    scene.add(shadowPlane);

    const weaveTex = createProceduralWeaveTexture();
    weaveTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const primaryMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(blueprint.primaryColor),
      metalness: blueprint.metalness,
      roughness: blueprint.roughness,
      clearcoat: blueprint.clearcoat,
      anisotropy: 0.65,
    });
    const secondaryMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(blueprint.secondaryColor),
      metalness: 0.35,
      roughness: 0.55,
    });
    const accentMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(blueprint.accentColor),
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.8,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.9,
      transparent: true,
      opacity: isSoftwareGl ? 0.35 : 1,
      ior: 1.55,
      thickness: 0.4,
      clearcoat: 1.0,
    });

    const { group, parts } = buildCompositeProductModel(
      blueprint,
      primaryMat,
      secondaryMat,
      accentMat,
      glassMat,
      weaveTex,
    );
    scene.add(group);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.82, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 6.5;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();

    resetCamRef.current = () => {
      camera.position.set(2.8, 2.0, 3.6);
      controls.target.set(0, 0.82, 0);
      controls.update();
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let currentExplode = 0;
    const clock = new THREE.Clock();
    const targetColor = new THREE.Color();

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } catch {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());

      if (autoSpinRef.current) {
        group.rotation.y += dt * 0.45;
      }

      currentExplode = THREE.MathUtils.damp(currentExplode, explodeRef.current, 7, dt);
      for (const p of parts) {
        p.mesh.position.set(
          p.restPos.x + p.explodeOffset.x * currentExplode,
          p.restPos.y + p.explodeOffset.y * currentExplode,
          p.restPos.z + p.explodeOffset.z * currentExplode,
        );
      }

      if (finishColorRef.current) {
        targetColor.set(finishColorRef.current.hex);
        primaryMat.color.lerp(targetColor, 1 - Math.exp(-8 * dt));
        primaryMat.metalness = THREE.MathUtils.damp(
          primaryMat.metalness,
          finishColorRef.current.metalness,
          8,
          dt,
        );
        primaryMat.roughness = THREE.MathUtils.damp(
          primaryMat.roughness,
          finishColorRef.current.roughness,
          8,
          dt,
        );
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const resizeObserver = new ResizeObserver((entries) => {
      if (disposed) return;
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(240, Math.floor(entry.contentRect.width));
      const h = Math.max(240, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      weaveTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, [blueprint]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-[#F5F5F7] ${
        compact ? 'h-[320px]' : 'h-[420px] md:h-[460px]'
      }`}
    >
      <div
        ref={mountRef}
        aria-label={`Interactive 360 degree 3D model of ${productTitle}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {contextLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F5F5F7] p-6 text-center">
          <p className="font-display text-sm font-semibold text-[#1D1D1F]">
            3D Studio Viewport Paused
          </p>
          <p className="mt-1 text-xs text-[#6E6E73]">
            WebGL context is restoring for {productTitle}.
          </p>
        </div>
      )}

      {/* Minimal top-left studio label */}
      <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2 text-xs text-[#6E6E73]">
        <span className="font-medium text-[#1D1D1F]">360° AI Studio Twin</span>
        <span aria-hidden="true">·</span>
        <span>{blueprint.dimensionsLabel}</span>
      </div>

      {/* Unified bottom control dock (solid/translucent rgba without backdrop-blur over WebGL) */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-black/10 bg-[#FFFFFF]/92 px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => setAutoSpin((s) => !s)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            autoSpin
              ? 'bg-[#1D1D1F] text-white'
              : 'bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]'
          }`}
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>{autoSpin ? 'Spinning' : 'Spin'}</span>
        </button>

        <label className="flex items-center gap-2 text-xs font-medium text-[#1D1D1F] whitespace-nowrap shrink-0">
          <Layers className="h-3.5 w-3.5 text-[#6E6E73]" />
          <span className="hidden sm:inline">Explode</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
            className="w-16 accent-[#0071E3] cursor-pointer"
          />
        </label>

        {blueprint.finishes.length > 0 && (
          <div className="flex items-center gap-1.5 border-l border-black/10 pl-2.5">
            {blueprint.finishes.map((f) => {
              const isSelected = activeFinish?.name === f.name;
              return (
                <button
                  key={f.name}
                  type="button"
                  title={f.name}
                  onClick={() => onSelectFinish?.(f.name)}
                  className={`h-4 w-4 rounded-full border transition-transform ${
                    isSelected
                      ? 'scale-110 ring-2 ring-[#0071E3] ring-offset-1 border-white'
                      : 'border-black/20 hover:scale-105'
                  }`}
                  style={{ backgroundColor: f.hex }}
                />
              );
            })}
          </div>
        )}

        <button
          type="button"
          title="Reset camera angle"
          onClick={() => resetCamRef.current?.()}
          className="rounded-lg p-1.5 text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F] transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
