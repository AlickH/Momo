import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import earthDay from '../assets/earth/earth-day.webp';
import earthNight from '../assets/earth/earth-night.webp';

export interface GlobeMarker {
  lat: number;
  lon: number;
  city: string;
  country: string;
  countryCode?: string;
  count: number;
  node?: string;
  nodes?: string[];
}

const RADIUS = 1.8;

function toVector(lat: number, lon: number, radius = RADIUS): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function Globe3D({ markers, origin }: { markers: GlobeMarker[]; origin: GlobeMarker | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<{ x: number; y: number; marker: GlobeMarker } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; marker: GlobeMarker } | null>(null);
  const clearHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const hideSoon = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setHover(null), 180);
  };
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    labelRenderer: CSS2DRenderer;
    controls: OrbitControls;
    markerGroup: THREE.Group;
    arcGroup: THREE.Group;
    earth: THREE.Mesh;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05070d');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.9, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.className = 'block h-full w-full';
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'pointer-events-none absolute inset-0 overflow-hidden';
    container.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 8;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerGroup.children, false);
      const marker = hits.find((hit) => hit.object.userData.marker)?.object.userData.marker as GlobeMarker | undefined;
      renderer.domElement.style.cursor = marker ? 'pointer' : 'grab';
      if (marker) {
        clearHideTimer();
        const info = { x: event.clientX, y: event.clientY, marker };
        hoverRef.current = info;
        setHover(info);
      } else {
        hoverRef.current = null;
        hideSoon();
      }
    };
    const onPointerLeave = () => {
      hoverRef.current = null;
      hideSoon();
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(5, 2, 4);
    scene.add(sun);

    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    const texture = new THREE.TextureLoader().load(earthDay);
    texture.colorSpace = THREE.SRGBColorSpace;
    const nightTexture = new THREE.TextureLoader().load(earthNight);
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 96, 96),
      new THREE.MeshPhongMaterial({ map: texture, emissiveMap: nightTexture, emissive: new THREE.Color(0x1b2a48), shininess: 6 }),
    );
    earthGroup.add(earth);

    const stars = new THREE.BufferGeometry();
    const positions = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index += 1) {
      const radius = 18 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x9fb4d8, size: 0.05, transparent: true, opacity: 0.8 })));

    const markerGroup = new THREE.Group();
    const arcGroup = new THREE.Group();
    earthGroup.add(markerGroup, arcGroup);

    const state = { scene, camera, renderer, labelRenderer, controls, markerGroup, arcGroup, earth };
    sceneRef.current = state;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      labelRenderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      controls.dispose();
      renderer.dispose();
      texture.dispose();
      nightTexture.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry?.dispose();
          const material = object.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material?.dispose();
        }
      });
      labelRenderer.domElement.remove();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.markerGroup.clear();
    state.arcGroup.clear();
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x4da3ff });
    const originMaterial = new THREE.MeshBasicMaterial({ color: 0x49aa19 });

    const addMarker = (marker: GlobeMarker, colorMaterial: THREE.MeshBasicMaterial, label: boolean) => {
      const point = toVector(marker.lat, marker.lon, RADIUS * 1.015);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.028 + Math.min(0.04, Math.sqrt(marker.count) * 0.008), 12, 12), colorMaterial);
      sphere.position.copy(point);
      sphere.userData.marker = marker;
      state.markerGroup.add(sphere);
      if (label && (marker.city || marker.country)) {
        const element = document.createElement('div');
        element.className = 'rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white/85 backdrop-blur-sm';
        element.textContent = [marker.city || marker.country, marker.node].filter(Boolean).join(' · ');
        const object = new CSS2DObject(element);
        object.position.copy(point.clone().multiplyScalar(1.035));
        state.markerGroup.add(object);
      }
    };

    if (origin) {
      addMarker(origin, originMaterial, true);
      for (const marker of markers) {
        addMarker(marker, markerMaterial, true);
        const start = toVector(origin.lat, origin.lon, RADIUS * 1.002);
        const end = toVector(marker.lat, marker.lon, RADIUS * 1.002);
        const middle = start.clone().add(end).normalize().multiplyScalar(RADIUS * 1.28);
        const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.45 }));
        state.arcGroup.add(line);
      }
    } else {
      for (const marker of markers) addMarker(marker, markerMaterial, true);
    }
  }, [markers, origin]);

  return (
    <div ref={containerRef} className="relative h-[520px] w-full overflow-hidden rounded-xl bg-black">
      <div className="pointer-events-none absolute right-2 bottom-2 z-10 text-[9px] text-white/35">拖动旋转 · 滚轮缩放</div>
      {hover ? (
        <div
          className="fixed z-[80] w-[280px] rounded-lg border border-white/10 bg-black/85 px-2.5 py-2 text-[10px] text-white/90 shadow-xl backdrop-blur"
          style={{ left: Math.min(hover.x + 14, window.innerWidth - 296), top: Math.min(hover.y + 14, window.innerHeight - 220) }}
          onPointerEnter={clearHideTimer}
          onPointerLeave={hideSoon}
        >
          <div className="font-medium">{hover.marker.city || hover.marker.country}</div>
          <div className="mt-0.5 text-white/55">{hover.marker.countryCode} · {hover.marker.count} 节点</div>
          <div className="mt-1 max-h-[50vh] overflow-y-auto pr-1 text-white/75">
            {hover.marker.nodes?.length ? hover.marker.nodes.map((name, index) => (
              <div key={`${name}-${index}`} className="truncate" title={name}>{name}</div>
            )) : <div>{hover.marker.node || 'DIRECT'}</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
