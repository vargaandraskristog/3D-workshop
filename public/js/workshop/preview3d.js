import * as THREE from 'three';
import { FBXLoader } from '/vendor/three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from '/vendor/three/examples/jsm/controls/OrbitControls.js';

const loader = new FBXLoader();

export function createPreviewController({ objectsGrid, detailsCanvas, detailsPopup, showToast }) {
  let cardStates = [];
  let detailState = null;
  let activeItem = null;

  function createSceneForCanvas(canvas, withControls = false) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const width = canvas.clientWidth || 300;
    const height = canvas.clientHeight || 150;
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    const bgColor = getComputedStyle(document.body).getPropertyValue('--surface-2').trim() || '#f2f4f8';
    scene.background = new THREE.Color(bgColor);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 4000);
    camera.position.set(140, 110, 170);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x506180, 1.15);
    const dir = new THREE.DirectionalLight(0xffffff, 1.05);
    dir.position.set(120, 180, 95);
    scene.add(hemi, dir);

    let controls = null;
    if (withControls) {
      controls = new OrbitControls(camera, canvas);
      controls.enablePan = false;
      controls.minDistance = 40;
      controls.maxDistance = 1500;
      controls.target.set(0, 40, 0);
      controls.update();
    }

    return { renderer, scene, camera, controls };
  }

  function fitObjectToCamera(object, camera) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = (camera.fov * Math.PI) / 180;
    let distance = Math.abs(maxDim / Math.sin(fov / 2));
    distance *= 0.78;

    camera.position.set(distance * 1.08, distance * 0.8, distance * 1.28);
    camera.lookAt(0, 0, 0);
  }

  function loadObject(url, scene, camera) {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (obj) => {
          fitObjectToCamera(obj, camera);
          scene.add(obj);
          resolve(obj);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  function cleanupCards() {
    cardStates.forEach((state) => {
      state.renderer.dispose();
      if (state.controls) state.controls.dispose();
    });
    cardStates = [];
  }

  function cleanupDetails() {
    if (!detailState) return;
    detailState.stop = true;
    detailState.renderer.dispose();
    if (detailState.controls) detailState.controls.dispose();
    detailState = null;
  }

  async function renderCardPreviews(items) {
    cleanupCards();
    const canvases = objectsGrid.querySelectorAll('.preview-canvas');
    for (let i = 0; i < canvases.length; i += 1) {
      const canvas = canvases[i];
      const item = items[i];
      const env = createSceneForCanvas(canvas, false);

      try {
        await loadObject(item.fileUrl, env.scene, env.camera);
        env.renderer.render(env.scene, env.camera);

        // Card previews are static snapshots, so dispose renderer resources.
        env.renderer.dispose();
      } catch (_error) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const bg = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#ffffff';
          const fg = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#5c6475';
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = fg;
          ctx.font = '14px sans-serif';
          ctx.fillText('Preview failed', 12, 22);
        }

        env.renderer.dispose();
      }
    }
  }

  async function openDetailsPreview(item) {
    activeItem = item;
    cleanupDetails();

    const env = createSceneForCanvas(detailsCanvas, true);
    detailState = { ...env, stop: false, object: null };

    try {
      const obj = await loadObject(item.fileUrl, env.scene, env.camera);
      detailState.object = obj;

      const tick = () => {
        if (!detailState || detailState.stop) return;
        if (detailState.object) {
          detailState.object.rotation.y += 0.01;
        }
        detailState.controls.update();
        detailState.renderer.render(detailState.scene, detailState.camera);
        requestAnimationFrame(tick);
      };

      tick();
    } catch (_error) {
      showToast('Unable to load detailed preview.', true);
    }
  }

  function clearActiveItem() {
    activeItem = null;
  }

  function getActiveItem() {
    return activeItem;
  }

  function handleResize() {
    if (detailState) {
      const canvas = detailState.renderer.domElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      detailState.camera.aspect = width / height;
      detailState.camera.updateProjectionMatrix();
      detailState.renderer.setSize(width, height, false);
    }
  }

  return {
    cleanupCards,
    cleanupDetails,
    renderCardPreviews,
    openDetailsPreview,
    clearActiveItem,
    getActiveItem,
    handleResize,
  };
}
