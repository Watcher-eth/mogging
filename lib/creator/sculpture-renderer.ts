import { drawDentalStudy } from "./sculpture-dental";
import { videoThemeContext, originalVideoContext } from "./video-theme";
import sculptureRegistration from "./sculpture-registration.json";
import type * as THREE from "three";
import {
  sculptureWindowContour,
  sculptureInsetFrame,
  sculptureTargetAnchor,
  sculptureGuideAnchors,
  sculptureLayerTreatment,
  sculptureLayerMotion,
  sculptureLayerEdge,
  sculptureAssetVersion,
  studioSculptureModels,
  sculptureCutawaySurface,
  sculptureAnglePoints,
  sculptureRegion,
  sculptureFeatureConfig,
  sculptureSample,
  sculptureLabels,
  sculptureEase,
  sculptureHandoff,
  sculptureFrameCenter,
  sculptureInstrumentMotion,
  type SculpturePrevious,
  type SculptureStudy,
} from "./cephra-study";
import {
  sampleEditorialCursor,
  drawEditorialCursor,
  prepareEditorialCursors,
} from "./editorial-cursor";
import { applyGlassInk } from "./glass-overlay";
import { drawVideoTextMorph } from "./video-pill-morph";
import { drawSculptureEditorial, sculptureEditorialUsesBaseline } from "./sculpture-editorial";
import { drawSculptureBackdrop } from "./sculpture-backdrop";
import { drawCaptionBackdrop } from "./video-progressive-blur";
import { drawNativeReportMetric } from "./native-report-metric";
import { timelinePoint } from "./mobile-report-geometry";
import { videoSize } from "./video-layout";

let studioEnvironmentPixels: Float32Array | undefined;
const surfaceTrees = new WeakMap<THREE.BufferGeometry, import("three-mesh-bvh").MeshBVH>();

type P = { x: number; y: number; visible?: boolean; facing?: number };
export type SculptureRenderer = {
  seek: (
    study: SculptureStudy,
    time: number,
    duration: number,
    reduced?: boolean,
    signal?: AbortSignal,
    previous?: SculpturePrevious,
  ) => Promise<void>;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  drawPortrait: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
  fork: () => Promise<SculptureRenderer>;
  dispose: () => void;
};
const anchors = (sex: SculptureStudy["model"]) =>
  sculptureRegistration[sex].anchors;
const loaded = new Map<string, Promise<THREE.Group>>();

/** Keep the complete library on the CPU; upload only the active low/high pair. */
export class SculptureMorphs {
  private meshes = new Map<
    THREE.Mesh,
    {
      source: THREE.BufferGeometry;
      names: Record<string, number>;
      feature: string;
    }
  >();

  select(mesh: THREE.Mesh, feature: string) {
    let entry = this.meshes.get(mesh);
    if (!entry) {
      if (!mesh.geometry.morphAttributes.position?.length) return;
      entry = {
        source: mesh.geometry,
        names: { ...mesh.morphTargetDictionary },
        feature: "",
      };
      this.meshes.set(mesh, entry);
    }
    if (entry.feature === feature) return;
    if (mesh.geometry !== entry.source) mesh.geometry.dispose();
    const source = entry.source;
    const Geometry = source.constructor as typeof THREE.BufferGeometry;
    const view = new Geometry();
    view.index = source.index;
    view.attributes = { ...source.attributes };
    view.groups = source.groups.map((group) => ({ ...group }));
    view.drawRange = { ...source.drawRange };
    view.boundingBox = source.boundingBox;
    view.boundingSphere = source.boundingSphere;
    view.morphTargetsRelative = source.morphTargetsRelative;
    const names = [feature + "-low", feature + "-high"].filter(
      (name) => entry.names[name] !== undefined,
    );
    for (const kind of ["position", "normal", "color"] as const) {
      const attributes = source.morphAttributes[kind];
      if (attributes && names.length)
        view.morphAttributes[kind] = names.map(
          (name) => attributes[entry.names[name]],
        );
    }
    mesh.geometry = view;
    mesh.morphTargetDictionary = names.length
      ? Object.fromEntries(names.map((name, i) => [name, i]))
      : undefined;
    mesh.morphTargetInfluences = names.length ? names.map(() => 0) : undefined;
    entry.feature = feature;
  }

  release(root: THREE.Object3D) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const entry = this.meshes.get(mesh);
      if (!entry) return;
      if (mesh.geometry !== entry.source) mesh.geometry.dispose();
      mesh.geometry = entry.source;
      this.meshes.delete(mesh);
    });
  }
}

/** Preview and export share the same lights, materials and baked surface detail. */
export async function prepareSculptureRenderer(
  highResolution = false,
  theme: "light" | "dark" = "light",
): Promise<SculptureRenderer> {
  const [T, { GLTFLoader }, { RectAreaLightUniformsLib }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/lights/RectAreaLightUniformsLib.js"),
  ]);
  RectAreaLightUniformsLib.init();
  await prepareEditorialCursors();
  const gl = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  gl.setSize(highResolution ? 1080 : 810, highResolution ? 1440 : 1080, false);
  gl.setPixelRatio(1);
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = T.VSMShadowMap;
  gl.toneMapping = T.ACESFilmicToneMapping;
  gl.toneMappingExposure = 0.88;
  gl.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  // Composite the backdrop in 2D so tone mapping never turns white into gray or black.
  scene.background = null;
  gl.setClearColor("#ffffff", 0);
  // A studio reflection field gives lacquer broad softbox reflections rather than pin highlights.
  const environmentWidth = 512,
    environmentHeight = 256;
  const surroundPixels = studioEnvironmentPixels ?? new Float32Array(
    environmentWidth * environmentHeight * 4,
  );
  if (!studioEnvironmentPixels) for (let y = 0; y < environmentHeight; y++) {
    for (let x = 0; x < environmentWidth; x++) {
      const u = x / environmentWidth,
        v = y / environmentHeight;
      const softbox = (cx: number, cy: number, w: number, h: number) =>
        Math.exp(-Math.pow((u - cx) / w, 8) - Math.pow((v - cy) / h, 8));
      const key = softbox(0.22, 0.34, 0.055, 0.15);
      const fill = softbox(0.73, 0.4, 0.085, 0.2);
      const overhead = softbox(0.48, 0.14, 0.19, 0.045);
      const value = 0.14 + key * 2.8 + fill * 1.1 + overhead * 1.4;
      surroundPixels.set(
        [value, value * 1.005, value * 1.015, 1],
        (y * environmentWidth + x) * 4,
      );
    }
  }
  studioEnvironmentPixels = surroundPixels;
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const surround = new T.DataTexture(
    surroundPixels,
    environmentWidth,
    environmentHeight,
    T.RGBAFormat,
    T.FloatType,
  );
  surround.mapping = T.EquirectangularReflectionMapping;
  surround.needsUpdate = true;
  scene.environment = surround;
  scene.environmentIntensity = 0.3;
  const camera = new T.PerspectiveCamera(
    32.5,
    gl.domElement.width / gl.domElement.height,
    0.005,
    20,
  );
  scene.add(new T.HemisphereLight("#f7f9fc", "#a8a39b", 0.24));
  const panel = (position: [number, number, number], intensity: number, width: number, height: number, color: string) => {
    const light = new T.RectAreaLight(color, intensity, width, height);
    light.position.set(...position);
    light.lookAt(0, 0.43, 0);
    scene.add(light);
    return light;
  };
  const key = panel([-0.34, 0.66, 0.52], 2.8, 0.46, 0.62, "#fff7ec");
  key.userData.keyLight = true;
  panel([0.34, 0.56, -0.24], 1.8, 0.22, 0.48, "#f0f4ff");
  panel([0.48, 0.44, 0.42], 1.05, 0.45, 0.60, "#f3f6fb");
  const shadowKey = new T.DirectionalLight("#fff7ec", 1.1);
  shadowKey.userData.keyLight = true;
  shadowKey.position.copy(key.position);
  shadowKey.target.position.set(0, 0.44, 0);
  shadowKey.castShadow = true;
  shadowKey.shadow.mapSize.set(512, 512);
  shadowKey.shadow.radius = 9;
  shadowKey.shadow.blurSamples = 8;
  shadowKey.shadow.camera.left = shadowKey.shadow.camera.bottom = -0.3;
  shadowKey.shadow.camera.right = shadowKey.shadow.camera.top = 0.3;
  shadowKey.shadow.camera.near = 0.01;
  shadowKey.shadow.camera.far = 2;
  shadowKey.shadow.bias = -0.000015;
  shadowKey.shadow.normalBias = 0.00015;
  scene.add(shadowKey, shadowKey.target);

  // The transparent receiver adds a soft cast shadow without painting a rectangular backdrop.
  const studioWallGeometry = new T.PlaneGeometry(4, 4);
  const studioWallMaterial = new T.ShadowMaterial({
    color: "#30343c",
    opacity: theme === "dark" ? 0.12 : 0.075,
  });
  const studioWall = new T.Mesh(studioWallGeometry, studioWallMaterial);
  studioWall.position.set(0, 0.4, -0.24);
  studioWall.receiveShadow = true;
  scene.add(studioWall);
  const [
    stoneNormal,
    stoneRoughness,
    concreteNormal,
    concreteRoughness,
    concreteColor,
    hairNormal,
  ] = await Promise.all([
    new T.TextureLoader().loadAsync("/creator/sculpture/stone-normal.png"),
    new T.TextureLoader().loadAsync("/creator/sculpture/stone-roughness.png"),
    new T.TextureLoader().loadAsync(
      `/creator/sculpture/concrete-normal.png?v=${sculptureAssetVersion}`,
    ),
    new T.TextureLoader().loadAsync(
      `/creator/sculpture/concrete-roughness.png?v=${sculptureAssetVersion}`,
    ),
    new T.TextureLoader().loadAsync(
      `/creator/sculpture/concrete-color.png?v=${sculptureAssetVersion}`,
    ),
    new T.TextureLoader().loadAsync("/creator/sculpture/hair-normal.png"),
  ]);
  for (const texture of [
    stoneNormal,
    stoneRoughness,
    concreteNormal,
    concreteRoughness,
    concreteColor,
  ]) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(
      texture === stoneNormal || texture === stoneRoughness ? 3 : 1.2,
      texture === stoneNormal || texture === stoneRoughness ? 3 : 1.2,
    );
    texture.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    texture.colorSpace =
      texture === concreteColor ? T.SRGBColorSpace : T.NoColorSpace;
  }
  hairNormal.colorSpace = T.NoColorSpace;
  hairNormal.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
  const hairMaterials: THREE.MeshPhysicalMaterial[] = [];
  const material = new T.MeshPhysicalMaterial({
    color: "#dcd6cc",
    roughness: 0.7,
    normalMap: stoneNormal,
    normalScale: new T.Vector2(0.45, 0.45),
    roughnessMap: stoneRoughness,
    metalness: 0,
    clearcoat: 0.08,
  });
  const browMaterial = new T.MeshStandardMaterial({
    color: "#777777",
    roughness: 0.8,
    transparent: true,
  });
  let modelBounds: THREE.Box3 | undefined;
  let brows: THREE.Group | undefined;
  let skull: THREE.Group | undefined;
  let root: THREE.Group | undefined,
    lastStudy: SculptureStudy | undefined,
    lastTime = 0,
    lastDuration = 1,
    reduced = false,
    sex = "";
  const image = document.createElement("canvas");
  image.width = gl.domElement.width;
  image.height = gl.domElement.height;
  let frameKey = "";
  const compositionFrom = document.createElement("canvas"),
    compositionTo = document.createElement("canvas");
  const rendered = document.createElement("canvas"),
    skinImage = document.createElement("canvas");
  let skinKey = "",
    boneKey = "";
  for (const canvas of [rendered, skinImage]) {
    canvas.width = image.width;
    canvas.height = image.height;
  }
  const bakedLighting = new Map<string, THREE.Texture>();
  const bindings = new Map<
    string,
    { mesh: THREE.Mesh; indices: number[]; weights: THREE.Vector3 }
  >();
  const morphs = new SculptureMorphs();
  let projected: Record<string, P> = {},
    baseline: HTMLCanvasElement | undefined,
    baselineKey = "";
  const skullMaterial = new T.MeshPhysicalMaterial({
    color: "#ded6c5",
    normalMap: stoneNormal,
    normalScale: new T.Vector2(0.14, 0.14),
    roughnessMap: stoneRoughness,
    roughness: 0.6,
    metalness: 0,
  });
  const boneImage = document.createElement("canvas");
  boneImage.width = image.width;
  boneImage.height = image.height;
  const mask=document.createElement("canvas");
  mask.width=image.width;mask.height=image.height;
  let peeled:HTMLCanvasElement|undefined;
  let boneModel = "";
  const loadBone = async (model: string) => {
    if (boneModel === model) return;
    if (skull) {
      scene.remove(skull);
      morphs.release(skull);
    }
    const key = model + "-bone";
    let pending = loaded.get(key);
    if (!pending) {
      pending = new GLTFLoader()
        .loadAsync(`/creator/sculpture/${key}.glb?v=${sculptureAssetVersion}`)
        .then((g) => g.scene);
      loaded.set(key, pending);
      void pending.catch(() => loaded.delete(key));
    }
    skull = (await pending).clone(true);
    skull.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        // Preserve the authored tissue/cartilage materials; bone gets the shared microtexture.
        if (mesh.name.includes("illustrative-bone"))
          mesh.material = skullMaterial;
      }
    });
    skull.visible = false;
    scene.add(skull);
    boneModel = model;
  };
  let metric = { baseline: 1, current: 1, degrees: false };
  const levelEye = new Map<string, number>();
  const load = async (model: SculptureStudy["model"]) => {
    if (sex === model) return;
    hairMaterials.splice(0).forEach((material) => material.dispose());
    if (root) {
      scene.remove(root);
      morphs.release(root);
    }
    brows?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    let pending = loaded.get(model);
    if (!pending) {
      pending = new GLTFLoader()
        .loadAsync(`/creator/sculpture/${model}.glb?v=${sculptureAssetVersion}`)
        .then((g) => g.scene);
      loaded.set(model, pending);
      void pending.catch(() => loaded.delete(model));
    }
    root = (await pending).clone(true);
    if (studioSculptureModels.some(studioModel => studioModel === model) && !bakedLighting.has(model)) {
      const texture = await new T.TextureLoader().loadAsync(
        `/creator/sculpture/${model}-studio-ao.png?v=${sculptureAssetVersion}`,
      );
      texture.flipY = false;
      texture.colorSpace = T.NoColorSpace;
      bakedLighting.set(model, texture);
    }
    material.aoMap = bakedLighting.get(model) ?? null;
    material.aoMapIntensity = 0.38;
    material.needsUpdate = true;
    const { MeshBVH, acceleratedRaycast } = await import("three-mesh-bvh");
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        let tree = surfaceTrees.get(mesh.geometry);
        if (!tree) { tree = new MeshBVH(mesh.geometry, { indirect: true }); surfaceTrees.set(mesh.geometry, tree); }
        mesh.geometry.boundsTree = tree;
        mesh.raycast = acceleratedRaycast;
        const authoredGroom = /^cephra[\s_-]*groom/i.test(mesh.name);
        if (authoredGroom || /ponytail/i.test(mesh.name)) {
          const original = mesh.material as THREE.MeshStandardMaterial;
          const hair = new T.MeshPhysicalMaterial({
            map: original.map,
            normalMap: authoredGroom ? original.normalMap : hairNormal,
            normalScale: authoredGroom ? original.normalScale : new T.Vector2(0.4, 0.4),
            color: authoredGroom ? original.color : "#f8f8f5",
            roughness: 0.8,
            metalness: 0,
            specularIntensity: 0.5,
            alphaTest: authoredGroom ? original.alphaTest : 0.22,
            side: T.DoubleSide,
          });
          if (hair.map)
            hair.map.anisotropy = Math.min(
              8,
              gl.capabilities.getMaxAnisotropy(),
            );
          hairMaterials.push(hair);
          mesh.material = hair;
        } else {
          const vertexColors = mesh.geometry.hasAttribute("color");
          if (material.vertexColors !== vertexColors) {
            material.vertexColors = vertexColors;
            material.needsUpdate = true;
          }
          mesh.material = material;
        }
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.morphTargetInfluences = mesh.morphTargetInfluences?.map(() => 0);
      }
    });
    scene.add(root);
    root.updateMatrixWorld(true);
    modelBounds = new T.Box3().setFromObject(root, true);
    // The plinth fades below the content; fit the visible face and neck rather
    // than shrinking the head to accommodate the hidden sculpture base.
    modelBounds.min.y = Math.max(modelBounds.min.y, anchors(model).chin[1] - 0.16);
    sex = model;
    brows = new T.Group();
    const eye = (anchors(model).eyeLeft[1] + anchors(model).eyeRight[1]) / 2,
      cast = new T.Raycaster();
    for (const side of [-1, 1])
      for (let i = 0; i < 32; i++) {
        const x = side * (0.014 + i * 0.00125),
          y = eye + 0.014 + Math.sin((i / 31) * Math.PI) * 0.005;
        cast.set(new T.Vector3(x, y, 0.8), new T.Vector3(0, 0, -1));
        const hit = cast.intersectObjects(root.children, true)[0];
        if (!hit) continue;
        const start = hit.point.clone().add(new T.Vector3(0, 0, 0.0004)),
          middle = start
            .clone()
            .add(new T.Vector3(side * 0.001, 0.0018, 0.0008)),
          end = start.clone().add(new T.Vector3(side * 0.0028, 0.003, 0));
        const curve = new T.QuadraticBezierCurve3(start, middle, end),
          hair = new T.Mesh(
            new T.TubeGeometry(curve, 3, 0.00016, 4, false),
            browMaterial,
          );
        brows.add(hair);
      }
    root.add(brows);
    bindings.clear();
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.parent !== brows)
        meshes.push(o as THREE.Mesh);
    });
    const trees = meshes.map((mesh) => ({
      mesh,
      tree: surfaceTrees.get(mesh.geometry)!,
    }));
    const registration =
      sculptureRegistration[model as SculptureStudy["model"]];
    const seeds: Record<string, number[]> = { ...registration.anchors };
    // Register the opposite silhouette at the same level, using the actual mesh for asymmetric casts.
    for (const name of ["cheek", "jaw"]) {
      const [x,y] = seeds[name];
      const surfaceAt = (fraction:number) => {
        cast.set(new T.Vector3(-x * fraction,y,.8),new T.Vector3(0,0,-1));
        return cast.intersectObjects(meshes,false)[0];
      };
      let hit = surfaceAt(1);
      if (!hit) {
        let inner = .62, outer = 1;
        hit = surfaceAt(inner);
        if (hit) for (let i = 0; i < 6; i++) {
          const middle = (inner + outer) / 2;
          const candidate = surfaceAt(middle);
          if (candidate) { inner = middle; hit = candidate; }
          else outer = middle;
        }
      }
      if (hit) seeds[`${name}Opposite`] = hit.point.toArray();
    }
    // Measure the opening from the actual upper/lower bounds of the registered eye contour.
    const lid = registration.contours["eye-tilt"];
    seeds.innerCanthus = lid.reduce((point, next) => Math.abs(next[0]) < Math.abs(point[0]) ? next : point);
    seeds.outerCanthus = lid.reduce((point, next) => Math.abs(next[0]) > Math.abs(point[0]) ? next : point);
    seeds.lidTop=lid.reduce((top,point)=>point[1]>top[1]?point:top);
    seeds.lidBottom=lid.reduce((bottom,point)=>point[1]<bottom[1]?point:bottom);
    for (const [feature, contour] of Object.entries(registration.contours))
      contour.forEach((point, i) => {
        seeds[`${feature}:${i}`] = point;
      });
    // Bind the exact supplied surface point; a new front/side ray can hit a different triangle.
    for (const [name, seed] of Object.entries(seeds)) {
      let nearest:
        | {
            mesh: THREE.Mesh;
            face: number;
            point: THREE.Vector3;
            distance: number;
          }
        | undefined;
      for (const { mesh, tree } of trees) {
        const point = mesh.worldToLocal(
          new T.Vector3(...(seed as [number, number, number])),
        );
        const hit = tree.closestPointToPoint(point);
        if (hit && (!nearest || hit.distance < nearest.distance))
          nearest = {
            mesh,
            face: hit.faceIndex,
            point: hit.point.clone(),
            distance: hit.distance,
          };
      }
      if (name.endsWith("Opposite") && (!nearest || nearest.distance > 0.0001)) continue;
      if (!nearest || nearest.distance > 0.0001)
        throw new Error(`Unregistered sculpture surface: ${model}/${name}`);
      const { mesh, face, point } = nearest,
        index = mesh.geometry.index;
      const indices = [0, 1, 2].map((i) =>
        index ? index.getX(face * 3 + i) : face * 3 + i,
      );
      const vertices = indices.map((i) =>
        mesh.getVertexPosition(i, new T.Vector3()),
      );
      const weights = new T.Vector3();
      T.Triangle.getBarycoord(
        point,
        vertices[0],
        vertices[1],
        vertices[2],
        weights,
      );
      const reconstructed = vertices.reduce(
        (value, vertex, i) =>
          value.addScaledVector(vertex, weights.getComponent(i)),
        new T.Vector3(),
      );
      if (
        reconstructed.distanceTo(point) > 1e-6 ||
        weights.toArray().some((w) => w < -0.001 || w > 1.001)
      )
        throw new Error(`Invalid sculpture triangle binding: ${model}/${name}`);
      bindings.set(name, { mesh, indices, weights });
    }
  };
  const applySurface = (study: SculptureStudy, value: number) => {
    root!.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && object.parent !== brows)
        morphs.select(mesh, study.feature);
      if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
      mesh.morphTargetInfluences.fill(0);
      const name = study.feature + (value < 0 ? "-low" : "-high"),
        i = mesh.morphTargetDictionary[name];
      if (i !== undefined && study.treatment !== "material")
        mesh.morphTargetInfluences[i] = Math.abs(value);
    });
  };
  const cameraAim = new T.Vector3();
  let handoff:
    | { previous: SculpturePrevious; progress: number; metric: typeof metric }
    | undefined;
  const state = (study: SculptureStudy, value: number) => {
    applySurface(study, value);
    if (brows) brows.visible = study.feature === "brow-contrast";
    browMaterial.opacity = 1;
    browMaterial.color.setRGB(
      0.5 - value * 0.24,
      0.5 - value * 0.24,
      0.5 - value * 0.24,
    );
    const age = sculptureSample(
      study,
      lastTime,
      lastDuration,
      reduced,
    ).effectMs;
    if (skull) {
      skull.visible = false;
      skull.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) morphs.select(mesh, study.feature);
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
        mesh.morphTargetInfluences.fill(0);
        const i =
          mesh.morphTargetDictionary[
            study.feature + (value < 0 ? "-low" : "-high")
          ];
        if (i !== undefined) mesh.morphTargetInfluences[i] = Math.abs(value);
      });
    }
    const chrome = study.material === "chrome";
    material.roughness =
      study.treatment === "material"
        ? 0.45 - value * 0.2
        : study.material === "matte"
          ? 0.9
          : chrome ? 0.24 : 0.4;
    material.color.set(chrome ? "#cbd0d7" : study.material === "matte" ? "#f8f8f6" : "#f5f5f2");
    const colorMap = study.material === "matte" ? concreteColor : null;
    if (material.map !== colorMap) {
      material.map = colorMap;
      material.needsUpdate = true;
    }
    material.normalMap =
      study.material === "matte" ? concreteNormal : stoneNormal;
    const roughnessMap = chrome ? null : study.material === "matte" ? concreteRoughness : stoneRoughness;
    if (material.roughnessMap !== roughnessMap) {
      material.roughnessMap = roughnessMap;
      material.needsUpdate = true;
    }
    hairMaterials.forEach((hair) => {
      hair.roughness = study.material === "matte" ? 0.82 : 0.6;
    });
    material.metalness = chrome ? 0.98 : 0;
    material.clearcoat = chrome || study.material === "matte" ? 0 : 0.16;
    scene.environmentIntensity = chrome ? 0.68 : 0.3;
    material.clearcoatRoughness = 0.3;
    material.specularIntensity = study.material === "matte" ? 0.45 : 0.65;
    scene.children.forEach((light) => {
      if (!light.userData.keyLight) return;
      const x =
        study.lighting === "sweep"
          ? -0.34 + 0.68 * sculptureEase(age / Math.max(1, lastDuration * 0.8))
          : -0.34;
      light.position.set(x, 0.66, 0.52);
      if (light instanceof T.RectAreaLight) light.lookAt(0, 0.43, 0);
    });
    material.normalScale.setScalar(chrome ? 0.035 : study.material === "matte" ? 0.32 : 0.06);
    const focus = anchors(study.model)[sculptureTargetAnchor(study) as keyof ReturnType<typeof anchors>];
    // Keep unilateral features visible and use one side for centerline shots so consecutive
    // profile proofs don't swing through a front view just because the variation changed.
    const side = Math.abs(focus[0]) > 0.015 ? Math.sign(focus[0]) : 1;
    let yaw =
      study.view === "profile"
        ? 1.4
        : study.view === "three-quarter"
          ? 0.36
          : 0;
    let distance =
      study.feature === "camera-distance"
        ? 0.3048 + (value + 1) * 0.6096
        : 0.68;
    const motion =
      (reduced ? 0 : sculptureEase(age / 1200)) *
      (study.restore
        ? 1 -
          sculptureEase(
            (lastTime - lastDuration * 0.75) / Math.max(1, lastDuration * 0.2),
          )
        : 1);
    if (study.camera === "orbit")
      yaw += Math.sin((motion * Math.PI) / 2) * 0.22;
    if (study.camera === "push") distance *= 1 - 0.16 * motion;
    if (study.camera === "pullback")
      distance *= reduced
        ? 1
        : 0.83 +
          0.17 * sculptureEase(lastTime / Math.max(1, lastDuration * 0.55));
    camera.fov =
      study.feature === "camera-distance"
        ? (2 * Math.atan(0.39 / (2 * distance)) * 180) / Math.PI
        : 32.5;
    if (study.camera === "turn")
      yaw +=
        (study.view === "profile"
          ? -1.04
          : 1.4 - (study.view === "front" ? 0 : 0.36)) * motion;
    yaw *= side;
    const center = sculptureFrameCenter(anchors(study.model));
    const aim = new T.Vector3(center.x, 0.44, center.z);
    if (study.camera === "pan")
      aim.lerp(new T.Vector3(focus[0], focus[1], focus[2]), 0.55 * motion);
    camera.position
      .set(Math.sin(yaw), 0.025, Math.cos(yaw))
      .normalize()
      .multiplyScalar(distance)
      .add(aim);
    camera.lookAt(aim);
    cameraAim.copy(aim);
    camera.updateMatrixWorld();
    camera.zoom = study.zoom * 0.9;
    camera.updateProjectionMatrix();
    project(study);
    if (study.camera !== "pan" && study.feature !== "camera-distance") {
      const visible = [
        "forehead",
        "chin",
        "eyeLeft",
        "eyeRight",
        "nose",
        "ear",
        "chinLeft",
        "chinRight",
        "jaw",
      ]
        .map((key) => projected[key])
        .filter(Boolean);
      if (visible.length > 3) {
        const dx =
          (Math.min(...visible.map((point) => point.x)) +
            Math.max(...visible.map((point) => point.x))) /
            2 -
          0.5;
        const span =
          (2 *
            camera.position.distanceTo(cameraAim) *
            Math.tan(T.MathUtils.degToRad(camera.fov) / 2)) /
          camera.zoom;
        const correction = new T.Vector3(
          T.MathUtils.clamp(dx, -0.12, 0.12) * span * camera.aspect,
          0,
          0,
        ).applyQuaternion(camera.quaternion);
        camera.position.add(correction);
        cameraAim.add(correction);
        camera.updateMatrixWorld();
        project(study);
      }
    }
    if (modelBounds) {
      // Reserve the complete silhouette inside the render surface. Framing is
      // horizontal-only; the authored vertical camera target stays unchanged.
      let extent = 1;
      for (const x of [modelBounds.min.x, modelBounds.max.x])
        for (const y of [modelBounds.min.y, modelBounds.max.y])
          for (const z of [modelBounds.min.z, modelBounds.max.z]) {
            const corner = new T.Vector3(x, y, z).project(camera);
            extent = Math.max(extent, Math.abs(corner.y) / .96);
          }
      if (extent > 1) {
        camera.zoom /= extent;
        camera.updateProjectionMatrix();
        project(study);
      }
    }
  };
  const project = (study: SculptureStudy) => {
    const config = sculptureFeatureConfig[study.feature];
    const world = new Map<string, THREE.Vector3>();
    projected = Object.fromEntries(
      [...bindings].map(([name, binding]) => {
        const vertices = binding.indices.map((i) =>
          binding.mesh
            .getVertexPosition(i, new T.Vector3())
            .applyMatrix4(binding.mesh.matrixWorld),
        );
        const point = vertices.reduce(
          (v, vertex, i) =>
            v.addScaledVector(vertex, binding.weights.getComponent(i)),
          new T.Vector3(),
        );
        const normal = new T.Triangle(
          ...(vertices as [THREE.Vector3, THREE.Vector3, THREE.Vector3]),
        ).getNormal(new T.Vector3());
        const facing = normal.dot(
          camera.position.clone().sub(point).normalize(),
        );
        const visible = facing > 0;
        world.set(name, point.clone());
        const v = point.project(camera);
        return [name, { x: (v.x + 1) / 2, y: (1 - v.y) / 2, visible, facing }];
      }),
    );
    const [a, b] = config.measure.map((name) => world.get(name)!);
    metric.degrees =
      study.feature === "gonial-angle" ||
      ["angle", "fold-ratio"].includes(study.treatment);
    const [angleA, angleB, angleC] = sculptureAnglePoints(study.feature).map(
      (name) => world.get(name)!,
    );
    metric.current = metric.degrees
      ? (angleA.clone().sub(angleB).angleTo(angleC.clone().sub(angleB)) * 180) /
        Math.PI
      : a.distanceTo(b);
  };
  const render = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (gl.getContext().isContextLost())
      throw new Error("The sculpture graphics context was lost. Reload the preview.");
    gl.render(scene, camera);
    const output = rendered.getContext("2d")!;
    output.clearRect(0, 0, rendered.width, rendered.height);
    output.drawImage(gl.domElement, 0, 0);
  };

  const renderer: SculptureRenderer = {
    async seek(study, time, duration, reduce = false, signal, previous) {
      const keyFrame = JSON.stringify([
        study,
        time,
        duration,
        reduce,
        previous,
      ]);
      if (keyFrame === frameKey) return;
      signal?.throwIfAborted();
      await load(study.model);
      signal?.throwIfAborted();
      if (
        sculptureLayerTreatment(study.treatment) ||
        sculptureLayerTreatment(previous?.study.treatment)
      )
        await loadBone(study.model);
      lastStudy = study;
      lastTime = time;
      lastDuration = duration;
      reduced = reduce;
      const sample = sculptureSample(study, time, duration, reduce);
      if(study.demo==="eye-tilt"){
        let neutral=levelEye.get(study.model);
        if(neutral===undefined){
          const offset=(value:number)=>{
            state(study,value);
            return projected.innerCanthus.y-projected.outerCanthus.y;
          };
          const lower=offset(-1),upper=offset(1);
          neutral=Math.max(-.89,Math.min(.89,2*(-lower)/(upper-lower||1)-1));
          levelEye.set(study.model,neutral);
        }
        sample.value=neutral+(sample.value>=0?(1-neutral)*sample.value:(1+neutral)*sample.value);
      }
      const blend =
        previous && previous.study.model === study.model
          ? sculptureHandoff(time, duration, reduce)
          : 1;
      const usesBaseline = (shot?:SculptureStudy) => shot?.treatment === "comparison" || shot?.demo?.startsWith("lens-") || sculptureEditorialUsesBaseline(shot?.editorial);
      const comparison = usesBaseline(study) ? study : usesBaseline(previous?.study) && blend < 1 ? previous?.study : undefined;
      if (comparison) {
        const key = JSON.stringify([comparison, reduce]);
        if (key !== baselineKey) {
          lastTime = 0;
          lastDuration = comparison === study ? duration : previous!.duration;
          state(comparison, comparison.demo?.startsWith("lens-") ? .72 : comparison.from);
          render(signal);
          baseline ??= document.createElement("canvas");
          baseline.width = image.width;
          baseline.height = image.height;
          baseline.getContext("2d")!.drawImage(rendered, 0, 0);
          baselineKey = key;
          lastTime = time;
          lastDuration = duration;
        }
      }
      handoff = undefined;
      let origin:
        | {
            position: THREE.Vector3;
            aim: THREE.Vector3;
            zoom: number;
            fov: number;
            color: THREE.Color;
            roughness: number;
            lights: THREE.Vector3[];
            value: number;
            metric: typeof metric;
          }
        | undefined;
      if (previous && blend < 1) {
        lastTime = previous.time;
        lastDuration = previous.duration;
        const value = sculptureSample(
          previous.study,
          previous.time,
          previous.duration,
          reduce,
        ).value;
        state(previous.study, value);
        origin = {
          position: camera.position.clone(),
          aim: cameraAim.clone(),
          zoom: camera.zoom,
          fov: camera.fov,
          color: material.color.clone(),
          roughness: material.roughness,
          lights: scene.children
            .filter((light) => light.userData.keyLight)
            .map((light) => light.position.clone()),
          value,
          metric: { ...metric },
        };
        lastTime = time;
        lastDuration = duration;
      }
      state(study, study.from);
      metric.baseline = metric.current;
      state(study, sample.value);
      if (origin && previous) {
        const sameFeature = previous.study.feature === study.feature;
        const surface = sameFeature || blend >= 0.5 ? study : previous.study;
        const value = sameFeature
          ? origin.value + (sample.value - origin.value) * blend
          : blend < 0.5
            ? origin.value * (1 - sculptureEase(blend * 2))
            : sample.value * sculptureEase((blend - 0.5) * 2);
        applySurface(surface, value);
        const browWeight =
          (previous.study.feature === "brow-contrast" ? 1 - blend : 0) +
          (study.feature === "brow-contrast" ? blend : 0);
        if (brows) brows.visible = browWeight > 0;
        browMaterial.opacity = browWeight;
        const from = new T.Spherical().setFromVector3(
          origin.position.clone().sub(origin.aim),
        );
        const to = new T.Spherical().setFromVector3(
          camera.position.clone().sub(cameraAim),
        );
        const delta = Math.atan2(
          Math.sin(to.theta - from.theta),
          Math.cos(to.theta - from.theta),
        );
        const orbit = new T.Spherical(
          T.MathUtils.lerp(from.radius, to.radius, blend),
          T.MathUtils.lerp(from.phi, to.phi, blend),
          from.theta + delta * blend,
        );
        cameraAim.lerpVectors(origin.aim, cameraAim.clone(), blend);
        camera.position.setFromSpherical(orbit).add(cameraAim);
        camera.lookAt(cameraAim);
        camera.zoom = T.MathUtils.lerp(origin.zoom, camera.zoom, blend);
        camera.fov = T.MathUtils.lerp(origin.fov, camera.fov, blend);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        material.color.lerpColors(origin.color, material.color.clone(), blend);
        material.roughness = T.MathUtils.lerp(
          origin.roughness,
          material.roughness,
          blend,
        );
        scene.children
          .filter((light) => light.userData.keyLight)
          .forEach((light, i) => {
            light.position.lerpVectors(
              origin!.lights[i],
              light.position.clone(),
              blend,
            );
            if (light instanceof T.RectAreaLight) light.lookAt(0, 0.43, 0);
          });
        project(study);
        handoff = { previous, progress: blend, metric: origin.metric };
      }
      // Caption/cursor animation does not invalidate an unchanged 3D surface.
      const surfaceKey = JSON.stringify([
        study.model,
        study.material,
        study.lighting,
        study.lighting === "sweep" ? lastTime : 0,
        study.feature,
        sample.value,
        handoff?.progress,
        handoff?.previous.study.feature,
        material.roughness,
        camera.matrixWorld.elements,
        camera.projectionMatrix.elements,
      ]);
      if (surfaceKey !== skinKey) {
        render(signal);
        const skin = skinImage.getContext("2d")!;
        skin.clearRect(0, 0, skinImage.width, skinImage.height);
        skin.drawImage(rendered, 0, 0);
        skinKey = surfaceKey;
      }
      image.getContext("2d")!.clearRect(0, 0, image.width, image.height);
      image.getContext("2d")!.drawImage(skinImage, 0, 0);
      if (
        (sculptureLayerTreatment(study.treatment) ||
          sculptureLayerTreatment(handoff?.previous.study.treatment)) &&
        skull
      ) {
        // Two registered 3D passes. Only a surface-bound window reveals bone; the rest of the skin stays opaque.
        root!.visible = false;
        skull.visible = true;
        try {
          if (surfaceKey !== boneKey) {
            render(signal);
            boneImage.getContext("2d")!.fillStyle = "#eeece8";
            boneImage
              .getContext("2d")!
              .fillRect(0, 0, image.width, image.height);
            boneImage.getContext("2d")!.drawImage(rendered, 0, 0);
            boneKey = surfaceKey;
          }
        } finally {
          root!.visible = true;
          skull.visible = false;
        }
        const windows: {
          study: SculptureStudy;
          reveal: number;
          opacity: number;
        }[] = [];
        if (handoff && sculptureLayerTreatment(handoff.previous.study.treatment))
          windows.push({
            study: handoff.previous.study,
            reveal: sculptureSample(
              handoff.previous.study,
              handoff.previous.time,
              handoff.previous.duration,
              reduced,
            ).progress,
            opacity: 1 - handoff.progress,
          });
        if (sculptureLayerTreatment(study.treatment))
          windows.push({
            study,
            reveal: reduced ? 1 : sample.progress,
            opacity: handoff?.progress ?? 1,
          });
        if (!peeled && windows.some(window=>window.study.treatment==="layer-peel")){
          peeled=document.createElement("canvas");
          peeled.width=image.width;peeled.height=image.height;
        }
        const m = mask.getContext("2d")!, c = image.getContext("2d")!, layer=peeled?.getContext("2d");
        layer?.clearRect(0,0,image.width,image.height);
        for (const window of windows) {
          const region = sculptureCutawaySurface(window.study);
          const contour = Array.from(
            { length: 48 },
            (_, i) => projected[`${region.contour}:${i}`],
          );
          const center = projected[region.anchor];
          m.clearRect(0, 0, mask.width, mask.height);
          if (!center?.visible || !contour.every(Boolean)) continue;
          const isPeel=window.study.treatment==="layer-peel";
          // The peel keeps its window registered while the same cutaway travels into a panel.
          const windowTime=window.study===study?{time,duration}:handoff?.previous;
          const phase=isPeel&&windowTime?sculptureLayerMotion(windowTime.time,windowTime.duration,
            sculptureSample(window.study,windowTime.time,windowTime.duration,reduced).clickAt,reduced):undefined;
          if(phase && phase.reveal<=0)continue;
          m.save();
          m.filter = `blur(${mask.width / 320}px)`;
          m.globalAlpha =
            sculptureEase((center.facing ?? 1) / 0.15) * window.opacity;
          m.fillStyle = "#fff";
          m.beginPath();
          (phase?contour:sculptureWindowContour(contour, center, window.reveal)).forEach(
            (point, i) => {
              const x = point.x * mask.width,
                y = point.y * mask.height;
              if (i) m.lineTo(x, y);
              else m.moveTo(x, y);
            },
          );
          m.closePath();
          if(phase && phase.reveal<1){
            m.clip();
            const y=sculptureLayerEdge(contour,phase.reveal)*mask.height, feather=mask.height*.008;
            const edge=m.createLinearGradient(0,y-feather,0,y+feather);
            edge.addColorStop(0,"#fff");edge.addColorStop(1,"rgba(255,255,255,0)");
            m.fillStyle=edge;
            m.fillRect(0,0,mask.width,y+feather);
          }else m.fill();
          m.restore();
          m.globalCompositeOperation = "source-in";
          m.drawImage(boneImage, 0, 0);
          m.globalCompositeOperation = "source-over";
          if (phase) {
            layer?.drawImage(mask,0,0);
            c.save();c.globalAlpha*=1-phase.separate;c.drawImage(mask,0,0);c.restore();
          } else c.drawImage(mask, 0, 0);
        }
      }
      frameKey = keyFrame;
    },
    draw(ctx, W, H) {
      if (!lastStudy) return;
      if (handoff && handoff.progress < 1) {
        for (const canvas of [compositionFrom, compositionTo]) {
          if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
          }
        }
        const { previous, progress, metric: previousMetric } = handoff;
        const mix =
          (previous.study.treatment === "comparison" ? 1 - progress : 0) +
          (lastStudy.treatment === "comparison" ? progress : 0);
        drawSculptureComposition(
          compositionFrom.getContext("2d")!,
          image,
          baseline,
          projected,
          previous.study,
          previous.time,
          previous.duration,
          W,
          H,
          reduced,
          previousMetric,
          mix,
          theme,
          peeled,
        );
        drawSculptureComposition(
          compositionTo.getContext("2d")!,
          image,
          baseline,
          projected,
          lastStudy,
          lastTime,
          lastDuration,
          W,
          H,
          reduced,
          metric,
          mix,
          theme,
          peeled,
        );
        ctx.drawImage(compositionFrom, 0, 0);
        ctx.save();
        ctx.globalAlpha *= progress;
        ctx.drawImage(compositionTo, 0, 0);
        ctx.restore();
      } else
        drawSculptureComposition(
          ctx,
          image,
          baseline,
          projected,
          lastStudy,
          lastTime,
          lastDuration,
          W,
          H,
          reduced,
          metric,
          undefined,
          theme,
          peeled,
        );
    },
    drawPortrait(ctx, width, height) {
      ctx.fillStyle = theme === "dark" ? "#111" : "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
    },
    fork: () => prepareSculptureRenderer(true, theme),
    dispose() {
      bakedLighting.forEach(texture => texture.dispose());
      material.dispose();
      surround.dispose();
      studioWallGeometry.dispose();
      studioWallMaterial.dispose();
      stoneNormal.dispose();
      stoneRoughness.dispose();
      concreteNormal.dispose();
      concreteRoughness.dispose();
      concreteColor.dispose();
      hairNormal.dispose();
      hairMaterials.forEach((material) => material.dispose());
      browMaterial.dispose();
      skullMaterial.dispose();
      if (root) morphs.release(root);
      if (skull) morphs.release(skull);
      brows?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
      gl.dispose();
      gl.forceContextLoss();
    },
  };
  return renderer;
}

/** All labels are simulation controls. No invented grade or real-world millimetre value is displayed. */
export function drawSculptureComposition(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  baseline: CanvasImageSource | undefined,
  points: Record<string, P>,
  study: SculptureStudy,
  time: number,
  duration: number,
  W: number,
  H: number,
  reduced = false,
  metric?: { baseline: number; current: number; degrees: boolean },
  comparisonMix = study.treatment === "comparison" ? 1 : 0,
  theme: "light" | "dark" = "light",
  peeled?: HTMLCanvasElement,
) {
  ctx = videoThemeContext(ctx, theme);
  const chrome = study.material === "chrome";
  const overlayInk = (alpha: number) =>
    `rgba(${chrome ? "255,255,255" : study.material === "reflective" ? "77,83,91" : "250,251,253"},${alpha})`;
  const eye = study.demo?.startsWith("eye-");
  const crop = eye && study.demo !== "eye-level" && points.eyeRight;
  const lens = crop ? 2.5 : 1;
  const frame = {
      x: crop ? W * (.51 - crop.x * lens) : W * 0.34 * comparisonMix,
      y: crop ? H * (.43 - crop.y * .74 * lens) : H * (0.19 + 0.01 * comparisonMix),
      width: W * (1 - 0.18 * comparisonMix) * lens,
      height: H * (0.74 - 0.144 * comparisonMix) * lens,
    },
    sample = sculptureSample(study, time, duration, reduced),
    p = (key: string): P => ({
      x: frame.x + (points[key]?.x ?? 0) * frame.width,
      y: frame.y + (points[key]?.y ?? 0) * frame.height,
      visible: Boolean(points[key]) && (
        points[key].visible !== false ||
        (study.treatment==="profile-chain" && ["glabella","noseBase","chin"].includes(key)) ||
        (["profile-offset","level-gauge"].includes(study.treatment) && (points[key].facing ?? -1) > -.22)
      ),
      facing: points[key]?.facing,
    });
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const forehead = p("forehead"),
    chin = p("chin");
  const faceWidth = Math.max(
    W * 0.42,
    Math.abs(p("eyeRight").x - p("eyeLeft").x) * 2.4,
  );
  drawSculptureBackdrop(
    ctx,
    study,
    {
      x: Math.max(W * 0.08, forehead.x - faceWidth / 2),
      y: Math.max(H * 0.23, forehead.y - H * 0.06),
      width: Math.min(W * 0.84, faceWidth),
      height: Math.max(H * 0.22, chin.y - forehead.y + H * 0.1),
    },
    time,
    reduced,
    theme,
  );
  if (comparisonMix > 0 && baseline) {
    ctx.save();
    ctx.globalAlpha *= comparisonMix;
    ctx.beginPath();
    ctx.rect(0, frame.y, W * (1 - 0.5 * comparisonMix), frame.height);
    ctx.clip();
    ctx.drawImage(
      baseline,
      -W * 0.16 * comparisonMix,
      frame.y,
      frame.width,
      frame.height,
    );
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    W * 0.5 * comparisonMix,
    frame.y,
    W * (1 - 0.5 * comparisonMix),
    frame.height,
  );
  ctx.clip();
  const roll = study.demo === "eye-level" && !reduced
    ? .11 * sculptureEase((time - sample.clickAt) / 400) * (1 - sculptureEase((time - (study.morphReturnMs ?? duration * .7)) / 550)) : 0;
  if (roll) {ctx.translate(W * .5, H * .47);ctx.rotate(roll);ctx.translate(-W * .5, -H * .47);}
  const overlayPoint = (key: string): P => {
    const point = p(key);
    if (!roll) return point;
    const x = point.x - W*.5, y = point.y - H*.47;
    return { ...point, x:W*.5+x*Math.cos(roll)-y*Math.sin(roll), y:H*.47+x*Math.sin(roll)+y*Math.cos(roll) };
  };
  ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
  if (study.demo === "lens-mirror" && baseline) {
    const sweep = reduced ? 1 : sculptureEase(sample.effectMs / 820);
    if (sweep > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(W * (.14+.38*sweep), H*.47, W*.36*sweep, H*.235*sweep, -.17, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(baseline,frame.x,frame.y,frame.width,frame.height);
      ctx.restore();
      ctx.strokeStyle=overlayInk(.72);
      ctx.lineWidth=W*.002;
      ctx.beginPath();
      ctx.ellipse(W * (.14+.38*sweep), H*.47, W*.36*sweep, H*.235*sweep, -.17, 0, Math.PI*2);
      ctx.stroke();
    }
  }
  ctx.restore();
  // Blur the actual sculpture/shoulders before fading them; white never exposes a render edge.
  ctx.save();
  ctx.scale(W / videoSize.width, H / videoSize.height);
  drawCaptionBackdrop(ctx, {
    edge: "bottom",
    tint: "none",
    role: "metric",
    height: 1000,
  });
  ctx.restore();
  const fadeStart = 0.63 - 0.08 * comparisonMix,
    fadeEnd = 0.85 - 0.14 * comparisonMix;
  const fade = ctx.createLinearGradient(0, H * fadeStart, 0, H * fadeEnd);
  for (let i = 0; i <= 20; i++)
    fade.addColorStop(i / 20, `rgba(255,255,255,${sculptureEase(i / 20)})`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, H * fadeStart, W, H * (1 - fadeStart));
  if (study.demo === "arch" || study.demo === "bite" || study.demo === "crowding") {
    drawDentalStudy(ctx,study,time,W,H,reduced);
    drawSculptureFooter(ctx,W,H);
    ctx.restore();
    return;
  }
  if (study.demo === "smile") {
    const mouth = p("upperLip");
    const mouthScale = Math.abs(p("mouthLeft").x - p("mouthRight").x) / (W*.33);
    ctx.save();
    ctx.translate(mouth.x, mouth.y + W*.012);
    ctx.scale(mouthScale, mouthScale);
    ctx.translate(-W*.5,-H*.46-W*114/700);
    drawDentalStudy(ctx,study,time,W,H,reduced);
    ctx.restore();
  }
  drawSculptureFooter(ctx, W, H);
  // Face guides stay in their material-specific glass ink in either paper theme.
  ctx = originalVideoContext(ctx);
  const config = sculptureFeatureConfig[study.feature],
    measurementAnchors = study.feature === "gonial-angle"
      ? sculptureAnglePoints(study.feature).slice(0, 2)
      : config.measure,
    rulerTop = H * 0.735;
  const controlPoint = (value: number): P => {
    const unit = W / 390,
      point = timelinePoint((value + 1) / 2, (W * 0.74) / unit, "linear");
    return {
      x: W * 0.13 + point.x * unit,
      y: rulerTop + 30 + (point.y - 10) * unit,
    };
  };
  const anchor = eye ? "innerCanthus" : sculptureTargetAnchor(study);
  const target =
    study.feature === "camera-distance" && study.instrument !== "none"
      ? controlPoint(sample.baseline)
      : p(anchor);
  const targetOpacity = target.visible === false && !eye && !study.profileGuide && !study.anglePhase ? 0 :
    eye || study.profileGuide || study.anglePhase || ["profile-offset","profile-chain"].includes(study.treatment) ? 1 : sculptureEase((target.facing ?? 1) / 0.16);
  const cursor = sampleEditorialCursor(
      time,
      { x: W * 0.77, y: H * 0.7 },
      target,
      sample.clickAt,
      study.variant,
      "click",
      reduced,
      study.feature === "camera-distance" && study.instrument !== "none"
        ? controlPoint(sample.value)
        : undefined,
    ),
    age = cursor.effectMs,
    enter = reduced ? 1 : sculptureEase(age / 420);
  if (study.demo === "lens-detail" && baseline && (cursor.clicked || reduced)) {
    const stages = [sample.clickAt,study.guideEndMs??Infinity,study.guideConnectMs??Infinity];
    const index = Math.max(0,stages.findLastIndex(mark=>time>=mark));
    const name = ["nose","cheek","ear"][index];
    const point = points[name];
    const source = image as HTMLCanvasElement;
    const size = source.width*.24;
    const x = Math.max(0,Math.min(source.width-size,point.x*source.width-size/2));
    const y = Math.max(0,Math.min(source.height-size,point.y*source.height-size/2));
    const cardSize=W*.205, left=W*.29, top=H*.62;
    ctx.save();
    ctx.globalAlpha*=reduced?1:sculptureEase((time-stages[index])/230);
    for(const [i,asset] of [image,baseline].entries()){
      const cardX=left+i*W*.23;
      ctx.save();ctx.beginPath();ctx.roundRect(cardX,top,cardSize,cardSize,16*W/1080);ctx.clip();
      ctx.drawImage(asset,x,y,size,size,cardX,top,cardSize,cardSize);
      ctx.restore();
      ctx.strokeStyle="rgba(110,110,110,.24)";
      ctx.beginPath();ctx.roundRect(cardX,top,cardSize,cardSize,16*W/1080);ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle="#555";ctx.font=`${W*.018}px monospace`;
      ctx.fillText(i===0?"NEAR":"FAR",cardX+cardSize/2,top+cardSize+W*.023);
    }
    ctx.restore();
  }
  if (eye) {
    const show = (ms: number, span = 340) => reduced ? 1 : sculptureEase((time - ms) / span);
    const inner = overlayPoint("innerCanthus"), outer = overlayPoint("outerCanthus");
    const unit = W / 1080;
    const baseline = {x:outer.x+W*.045,y:inner.y};
    ctx.save();
    const ink = overlayInk(.98);
    ctx.lineWidth = 2.4 * unit;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    const stroke = (a: P, b: P, amount: number) => {
      if (amount <= 0) return;
      ctx.beginPath();ctx.moveTo(a.x,a.y);
      ctx.lineTo(a.x+(b.x-a.x)*amount,a.y+(b.y-a.y)*amount);ctx.stroke();
    };
    const first = study.demo === "eye-dots" ? show(sample.clickAt) : 1;
    const second = study.demo === "eye-dots" ? show(study.guideEndMs ?? sample.clickAt+420) : 1;
    for(const [point,alpha] of [[inner,first],[outer,second]] as const){
      ctx.beginPath();ctx.arc(point.x,point.y,Math.max(.01,4.2*unit*alpha),0,2*Math.PI);ctx.fill();
    }
    if(study.demo !== "eye-dots"){
      const chord=study.demo==="eye-line"?show(sample.clickAt):1;
      const datum=study.demo==="eye-line"?show(study.guideEndMs??sample.clickAt+450):1;
      ctx.setLineDash([5*unit,8*unit]);stroke(inner,baseline,datum);
      ctx.setLineDash([]);stroke(inner,outer,chord);
      if(study.demo==="eye-tilt"||study.demo==="eye-line"&&datum>.9){
        const deg=Math.atan2(inner.y-outer.y,Math.abs(outer.x-inner.x))*180/Math.PI;
        ctx.font=`500 ${22*unit}px monospace`;
        ctx.textAlign="center";
        const label=study.demo==="eye-tilt"?time>=(study.guideConnectMs??Infinity)?"NEGATIVE":time>=(study.guideEndMs??Infinity)?"NEUTRAL":"POSITIVE":"";
        ctx.fillText(`${deg>=0?"+":""}${deg.toFixed(1)}°${label?"   "+label:""}`,(inner.x+outer.x)*.5,Math.max(inner.y,outer.y)+W*.048);
      }
    }
    ctx.restore();
  }
  if (
    !eye && !study.demo && study.showGuides &&
    targetOpacity > 0 &&
    (cursor.clicked || reduced || study.profileGuide==="persist" || study.anglePhase==="bone")
  ) {
    ctx.save();
    ctx.globalAlpha *= (study.profileGuide==="persist"||study.anglePhase==="bone"?1:enter) * targetOpacity;
    applyGlassInk(ctx, W / 1080, 2.6, overlayInk(0.92));
    ctx.shadowColor = "rgba(255,255,255,.3)";
    ctx.setLineDash(
      study.variant % 3 === 0
        ? [(2 * W) / 1080, (6 * W) / 1080]
        : [(7 * W) / 1080, (5 * W) / 1080],
    );
    const line = (a: P, b: P, t = 1, construction = false) => {
      if (!construction && (a.visible === false || b.visible === false)) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      ctx.stroke();
    };
    const surface = (treatment: string) => {
      const contourKey =
        study.revealRegion !== "feature"
          ? sculptureCutawaySurface(study).contour
          : study.feature;
      const contour = Array.from({ length: 49 }, (_, i) =>
        p(`${contourKey}:${i}`),
      );
      if (treatment === "surface-net") {
        const nodes = [0, 13, 25, 37].map((offset, i) => {
          const phase =
            (age / 2500 + i * 0.19 + study.variant * 0.13) * Math.PI * 2;
          const position = (offset + Math.sin(phase) * 3 + 48) % 48,
            index = Math.floor(position);
          const a = contour[index],
            b = contour[(index + 1) % 48],
            t = position - index;
          return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            visible: a.visible !== false && b.visible !== false,
          };
        });
        nodes.forEach((q, i) => {
          if (!q.visible) return;
          const on = reduced ? 1 : sculptureEase((age - i * 110) / 420);
          ctx.strokeStyle =
            study.material === "matte" && study.variant % 3 === 1
              ? `rgba(170,174,180,${0.45 + i * 0.12})`
              : overlayInk(0.45 + i * 0.12);
          ctx.lineWidth = (W / 1080) * (1 + i * 0.45);
          line(q, nodes[(i + 1) % 4], on);
          const r = (W / 1080) * (5 + i * 1.3) * on;
          ctx.beginPath();
          ctx.roundRect(q.x - r, q.y - r, r * 2, r * 2, r * 0.35);
          ctx.stroke();
        });
      } else {
        ctx.setLineDash(treatment === "contour" ? [2, 5] : []);
        ctx.beginPath();
        contour.slice(0, Math.floor(49 * enter)).forEach((q, i) => {
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        });
        ctx.stroke();
        if (treatment !== "contour") {
          const sweep = (0.5 - 0.5 * Math.cos(age / 1400)) * 23,
            i = Math.floor(sweep),
            t = sweep - i;
          const mix = (a: P, b: P) => ({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          });
          line(
            mix(contour[i], contour[i + 1]),
            mix(contour[48 - i], contour[47 - i]),
            enter,
          );
          if (treatment === "depth-plane") {
            ctx.fillStyle = overlayInk(0.08);
            ctx.beginPath();
            [contour[5], contour[18], contour[29], contour[42]].forEach(
              (q, i) => {
                if (i) ctx.lineTo(q.x, q.y);
                else ctx.moveTo(q.x, q.y);
              },
            );
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
      }
    };
    if (study.accent !== "none" && study.accent !== study.treatment) {
      ctx.save();
      ctx.globalAlpha *= 0.65;
      surface(study.accent);
      ctx.restore();
    }
    if (study.treatment === "angle" || study.treatment === "fold-ratio" || study.anglePhase === "bone") {
      const [a, b, c] = sculptureAnglePoints(study.feature).map(p);
      const lowerAt=study.anglePhase==="guides"?(study.guideEndMs??sample.clickAt+420)-sample.clickAt:160;
      line(a, b, reduced || study.anglePhase==="bone" ? 1 : sculptureEase(age / 420), true);
      line(b, c, reduced || study.anglePhase==="bone" ? 1 : sculptureEase((age - lowerAt) / 420), true);
      const arc = study.anglePhase==="guides"?0:reduced?1:study.anglePhase==="bone"?sculptureEase((time-(study.guideEndMs??0))/370):sculptureEase((age - 460) / 380),
        s = Math.atan2(a.y - b.y, a.x - b.x),
        e = Math.atan2(c.y - b.y, c.x - b.x),
        delta = Math.atan2(Math.sin(e - s), Math.cos(e - s));
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, W * 0.035, s, s + delta * arc, delta < 0);
      ctx.stroke();
      if (study.treatment === "fold-ratio") {
        const fold = reduced ? 1 : sculptureEase((age - (study.narrationTriggerMs===undefined?1100:180)) / 900),
          length = Math.hypot(a.x - b.x, a.y - b.y),
          theta = s + delta * fold,
          end = {
            x: b.x + Math.cos(theta) * length,
            y: b.y + Math.sin(theta) * length,
          };
        ctx.strokeStyle = overlayInk(0.9);
        line(b, end);
        ctx.fillStyle = "#777";
        ctx.font = `${W * 0.018}px monospace`;
        ctx.textAlign = "center";
        const proportion = Math.round(length / Math.max(1, Math.hypot(c.x-b.x,c.y-b.y)) * 100);
        ctx.fillText(
          sculptureRegion(study.feature) === "jaw"
            ? `REAR / LOWER EDGE   ${proportion}%`
            : "REGISTERED SEGMENTS",
          W * 0.5,
          H * 0.755,
        );
      }
    } else if (study.treatment === "thirds") {
      for (const [i, key] of [
        "forehead",
        "glabella",
        "noseBase",
        "chin",
      ].entries()) {
        const q = p(key);
        line(
          { x: W * 0.23, y: q.y },
          { x: W * 0.77, y: q.y },
          reduced ? 1 : sculptureEase((age - i * 110) / 420),
        );
      }
    } else if (study.treatment === "profile-chain" || study.treatment === "reference-ratio") {
      const chain=study.treatment==="profile-chain";
      const anchors=sculptureGuideAnchors(study).map(p);
      const [a,b,c,d]=anchors;
      const unit=W/1080;
      const ease=(start:number,span=280)=>reduced?1:sculptureEase((time-start)/span);
      const firstAt=cursor.clickAtMs;
      const middleAt=Math.max(firstAt+190,study.guideMiddleMs??firstAt+260);
      const lastAt=Math.max(middleAt+150,study.guideEndMs??firstAt+600);
      const connectAt=Math.max(lastAt+110,study.guideConnectMs??lastAt+170);
      const dot=(point:P,t:number)=>{
        if(!point.visible||t<=0)return;
        ctx.beginPath();ctx.arc(point.x,point.y,4.5*unit*t,0,Math.PI*2);ctx.fill();
      };
      ctx.fillStyle=chrome?overlayInk(.92):"rgba(55,55,57,.87)";
      ctx.strokeStyle=ctx.fillStyle;ctx.shadowColor="rgba(255,255,255,.6)";
      ctx.lineWidth=2.5*unit;ctx.setLineDash([4*unit,5*unit]);
      if(chain && anchors.every(point=>point.visible)){
        const first=ease(connectAt,360), second=ease(connectAt+150,360);
        line(a,b,first);line(b,c,second);
        dot(a,enter);dot(b,ease(middleAt));dot(c,ease(lastAt));
        const arc=ease(connectAt+420,420);
        if(arc>0){
          const start=Math.atan2(a.y-b.y,a.x-b.x),end=Math.atan2(c.y-b.y,c.x-b.x);
          const sweep=Math.atan2(Math.sin(end-start),Math.cos(end-start));
          const radius=Math.min(W*.032,Math.hypot(a.x-b.x,a.y-b.y)*.36,Math.hypot(c.x-b.x,c.y-b.y)*.36);
          ctx.setLineDash([]);ctx.beginPath();ctx.arc(b.x,b.y,radius,start,start+sweep*arc,sweep<0);ctx.stroke();
        }
      }else if(!chain && anchors.every(point=>point.visible)){
        const mouth=study.feature==="mouth-width";
        const later=ease(Math.max(firstAt+270,study.guideEndMs??firstAt+520),440);
        const pupil=p("eyeLeft");
        if(!mouth&&pupil.visible)line(pupil,a,enter);
        const measure=(start:P,end:P,progress:number,offset=0)=>{
          if(progress<=0)return;
          const delta=mouth?{x:0,y:Math.min(start.y,end.y)+W*.017}:{x:Math.max(start.x,end.x)+W*(.028+offset),y:0};
          const from=mouth?{x:start.x,y:delta.y}:{x:delta.x,y:start.y};
          const to=mouth?{x:end.x,y:delta.y}:{x:delta.x,y:end.y};
          line(start,from,progress);line(end,to,progress);line(from,to,progress);
          dot(start,progress);dot(end,progress);
        };
        measure(a,b,enter);
        ctx.setLineDash([1.6*unit,4*unit]);ctx.lineWidth=2*unit;
        measure(c,d,later,mouth?0:.062);
        if(later>.01){
          ctx.save();ctx.globalAlpha*=later;
          ctx.font=`500 ${W*.018}px monospace`;ctx.textAlign=mouth?"center":"left";
          ctx.fillText(mouth?"MOUTH":"BROW GAP",mouth?(a.x+b.x)*.5:Math.max(a.x,b.x)+W*.034,
            mouth?Math.min(a.y,b.y)-W*.025:Math.min(a.y,b.y)-W*.01);
          ctx.fillText(mouth?"NOSE":"EYE OPENING",mouth?(c.x+d.x)*.5:Math.max(c.x,d.x)+W*.095,
            mouth?Math.min(c.y,d.y)-W*.025:Math.max(c.y,d.y)+W*.022);
          ctx.restore();
        }
      }
    } else if (["landmark-gauge", "profile-offset", "level-gauge"].includes(study.treatment)) {
      const [first, last] = (study.profileGuide ? ["glabella","noseBase"] : sculptureGuideAnchors(study)).map(key=>study.profileGuide?{...p(key),visible:true}:p(key));
      const endDelay = Math.max(220, (study.guideEndMs ?? sample.clickAt + 340) - cursor.clickAtMs);
      const second = study.profileGuide==="datum"?0:study.profileGuide==="persist"||reduced?1:sculptureEase((age - (study.profileGuide==="offset"?0:endDelay)) / 300);
      const span = study.profileGuide==="datum"?0:study.profileGuide==="persist"||reduced?1:sculptureEase((age - endDelay - 110) / 380);
      const unit = W / 1080;
      const side = study.treatment === "profile-offset", levels = study.treatment === "level-gauge";
      const nearVertical = Math.abs(last.y - first.y) > Math.abs(last.x - first.x);
      const distance = Math.hypot(last.x - first.x, last.y - first.y);
      if (first.visible && last.visible && distance > 9 * unit) {
        const offset = side ? 0 : (study.variant % 2 ? -1 : 1) * Math.min(58 * unit, distance * .42);
        const A = side ? first : {x:first.x + (nearVertical ? offset : 0), y:first.y + (nearVertical ? 0 : offset)};
        const B = side ? {x:first.x,y:last.y} : {x:last.x + (nearVertical ? offset : 0), y:last.y + (nearVertical ? 0 : offset)};
        ctx.lineWidth = 2.2 * unit;
        const gaugeInk = (alpha:number) => study.material === "chrome" ?
          overlayInk(alpha) : `rgba(61,63,65,${alpha})`;
        ctx.shadowColor = "rgba(255,255,255,.7)";
        ctx.strokeStyle = gaugeInk(.62);
        ctx.setLineDash([3 * unit, 5 * unit]);
        if (levels) {
          const opposite = [p("cheekOpposite"), p("jawOpposite")];
          const paired = opposite.every(q => q.visible);
          const edge = Math.min(W*.86, Math.max(first.x,last.x)+W*.10);
          const ends = paired ? opposite : [{x:edge,y:first.y},{x:edge,y:last.y}];
          for (const [i,q] of [first,last].entries()) {
            const progress = i === 0 ? enter : second;
            if (progress > 0) line(q, ends[i], progress);
          }
          if (!paired && span > 0) line(ends[0],ends[1],span);
          ctx.setLineDash([]);
          ctx.fillStyle = gaugeInk(.88);
          if (paired) for (const [i,q] of opposite.entries()) {
            if ((i === 0 ? enter : second) < .95) continue;
            ctx.beginPath();
            ctx.arc(q.x,q.y,4 * unit,0,Math.PI * 2);
            ctx.fill();
          }
        } else if (side) line(first, B, study.profileGuide==="datum"?enter:1);
        else {
          line(first, A, enter);
          if (second > 0) line(last, B, second);
        }
        if (span > 0 && !levels) {
          ctx.setLineDash([6 * unit, 4 * unit]);
          ctx.lineWidth = 3 * unit;
          ctx.strokeStyle = gaugeInk(.9);
          if (side) {
            line(last, B, span);
            if(study.profileGuide && span>.9){
              ctx.setLineDash([]);
              ctx.fillStyle=gaugeInk(.95);ctx.font=`500 ${18*unit}px monospace`;ctx.textAlign="right";
              ctx.fillText("NASAL BASE",Math.min(last.x,B.x)-12*unit,last.y+8*unit);
            }
          }
          else line(A, B, span);
        }
        ctx.setLineDash([]);
        ctx.fillStyle = gaugeInk(.88);
        for (const [point, growth] of [[first,enter],[last,second]] as const) {
          if (growth <= 0) continue;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5 * unit * growth, 0, Math.PI * 2);
          ctx.fill();
        }
        if (span > 0 && !side && !levels) {
          const nx = -(B.y - A.y) / distance, ny = (B.x - A.x) / distance;
          const size = 7 * span * unit;
          const moving = { x:A.x + (B.x - A.x)*span, y:A.y + (B.y - A.y)*span };
          for (const q of [A,moving])
            line({x:q.x-nx*size,y:q.y-ny*size},{x:q.x+nx*size,y:q.y+ny*size});
        }
      }
    } else if (study.treatment === "profile-plane") {
      const [a, b] = measurementAnchors.map(p);
      line(a, { x: a.x, y: b.y }, enter);
      line(
        { x: a.x, y: b.y },
        b,
        reduced ? 1 : sculptureEase((age - 250) / 420),
      );
    } else if (
      ["surface-net", "section-scan", "contour", "depth-plane"].includes(
        study.treatment,
      )
    ) {
      surface(study.treatment);
    } else if (sculptureLayerTreatment(study.treatment)) {
      const region = sculptureCutawaySurface(study),
        center = p(region.anchor);
      const phase=study.treatment==="layer-peel"?sculptureLayerMotion(time,duration,sample.clickAt,reduced):undefined;
      const opening=phase?.reveal??sample.progress;
      if (center.visible && opening > 0.002) {
        const full=Array.from({ length:49 },(_,i)=>p(`${region.contour}:${i}`));
        const contour=phase?full:sculptureWindowContour(full,center,reduced?1:opening);
        ctx.globalAlpha *= sculptureEase(
          (points[region.anchor]?.facing ?? 1) / 0.15,
        );
        ctx.strokeStyle = chrome ? overlayInk(.94) : "rgba(166,163,158,.85)";
        ctx.lineWidth = (W / 1080) * 1.7;
        ctx.shadowBlur = 0;
        ctx.lineCap = "round";
        ctx.setLineDash([W / 1080, (W / 1080) * 5]);
        ctx.beginPath();
        contour.forEach((q, i) =>
          i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y),
        );
        ctx.closePath();
        if(phase && opening<.995 && !reduced){
          const y=sculptureLayerEdge(contour,opening);
          const beam=ctx.createLinearGradient(0,y-14,0,y+14);
          beam.addColorStop(0,"rgba(255,255,255,0)");beam.addColorStop(.5,"rgba(255,255,255,.86)");
          beam.addColorStop(1,"rgba(255,255,255,0)");
          ctx.save();ctx.clip();ctx.fillStyle=beam;ctx.fillRect(0,y-14,W,28);ctx.restore();
        }else ctx.stroke();
      }
    } else if (study.treatment === "region") {
      ctx.setLineDash([(3 * W) / 1080, (6 * W) / 1080]);
      ctx.fillStyle = chrome ? overlayInk(.08) : "rgba(70,70,70,.08)";
      ctx.beginPath();
      for (let i = 0; i <= Math.floor(48 * enter); i++) {
        const key =
          study.revealRegion !== "feature"
            ? sculptureCutawaySurface(study).contour
            : study.feature;
        const q = p(`${key}:${i}`);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
      if (enter === 1) {
        ctx.closePath();
        ctx.fill();
      }
    } else if (study.treatment === "perspective") {
      const [eyeA, eyeB] = measurementAnchors.map(p),
        nose = target;
      line({ x: eyeA.x, y: nose.y }, { x: eyeB.x, y: nose.y }, enter);
      for (const q of [eyeA, eyeB])
        line(q, nose, reduced ? 1 : sculptureEase((age - 200) / 500));
    } else if (study.treatment === "acquire") {
      const a = p("forehead"),
        b = p("chin"),
        w = W * 0.38,
        h = Math.abs(b.y - a.y) + H * 0.1,
        x = W * 0.5,
        y = (a.y + b.y) / 2;
      ctx.setLineDash([]);
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const xx = x + (sx * w) / 2,
          yy = y + (sy * h) / 2;
        line({ x: xx - sx * 22 * enter, y: yy }, { x: xx, y: yy });
        line({ x: xx, y: yy }, { x: xx, y: yy - sy * 22 * enter });
      }
    } else if (study.treatment === "datum") {
      const [a, b] = measurementAnchors.map(p);
      const length = Math.hypot(b.x - a.x, b.y - a.y),
        nx = -(b.y - a.y) / Math.max(1, length),
        ny = (b.x - a.x) / Math.max(1, length);
      const offset = W * (study.variant % 2 ? -0.042 : 0.042);
      const projected = [a, b].map((q) => ({
        x: q.x + nx * offset,
        y: q.y + ny * offset,
        visible: q.visible,
      }));
      ctx.lineWidth = (1.4 * W) / 1080;
      ctx.strokeStyle = overlayInk(0.58);
      ctx.setLineDash([(2 * W) / 1080, (5 * W) / 1080]);
      [a, b].forEach((q, i) =>
        line(
          q,
          projected[i],
          reduced ? 1 : sculptureEase((age - i * 110) / 300),
        ),
      );
      ctx.lineWidth = (2.6 * W) / 1080;
      ctx.strokeStyle = overlayInk(0.92);
      ctx.setLineDash([(6 * W) / 1080, (4 * W) / 1080]);
      line(
        projected[0],
        projected[1],
        reduced ? 1 : sculptureEase((age - 230) / 460),
      );
      ctx.setLineDash([]);
      for (const [i, q] of projected.entries()) {
        const tick =
          (W / 1080) * 7 * (reduced ? 1 : sculptureEase((age - i * 140) / 320));
        line(
          { x: q.x - nx * tick, y: q.y - ny * tick },
          { x: q.x + nx * tick, y: q.y + ny * tick },
        );
      }
    } else {
      const r = W * 0.035 * (1 + (1 - enter) * 0.3);
      ctx.setLineDash([]);
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(target.x + sx * r, target.y + sy * r - sy * r * 0.35);
        ctx.lineTo(target.x + sx * r, target.y + sy * r);
        ctx.lineTo(target.x + sx * r - sx * r * 0.35, target.y + sy * r);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (study.treatment==="layer-peel" && peeled && target.visible && (cursor.clicked||reduced)) {
    const motion=sculptureLayerMotion(time,duration,sample.clickAt,reduced);
    const anchorPoint=points[anchor];
    if(anchorPoint && motion.separate>.001){
      const card=sculptureInsetFrame(target,W,H,false);
      const {contour}=sculptureCutawaySurface(study);
      const pointsInLayer=Array.from({length:49},(_,i)=>points[`${contour}:${i}`]).filter(Boolean);
      const span=(axis:"x"|"y")=>{
        const values=pointsInLayer.map(point=>point[axis]);
        return values.length?Math.max(...values)-Math.min(...values):.25;
      };
      const bound=Math.min(peeled.width,peeled.height);
      const square=Math.min(bound*.54,Math.max(bound*.23,Math.max(span("x")*peeled.width,span("y")*peeled.height)*1.42));
      const sx=Math.max(0,Math.min(peeled.width-square,anchorPoint.x*peeled.width-square*.5));
      const sy=Math.max(0,Math.min(peeled.height-square,anchorPoint.y*peeled.height-square*.5));
      const u=motion.separate, w=card.width*(.76+.24*u),h=card.height*(.76+.24*u);
      const x=target.x-w*.5+(card.x-target.x+w*.5)*u;
      const y=target.y-h*.5+(card.y-target.y+h*.5)*u;
      ctx.save();ctx.globalAlpha*=u;
      ctx.strokeStyle=chrome?overlayInk(.88):"rgba(90,90,90,.58)";
      ctx.lineWidth=W*.0015;ctx.setLineDash([3,6]);
      ctx.beginPath();ctx.moveTo(target.x,target.y);ctx.lineTo(x+w*.5,y+h*.46);ctx.stroke();ctx.setLineDash([]);
      ctx.translate(x+w*.5,y+h*.5);
      const yaw=(1-u)*.87*(card.x>target.x?-1:1);
      ctx.transform(Math.cos(yaw),Math.sin(yaw)*.11,0,1,0,0);
      ctx.shadowColor="rgba(30,30,30,.13)";ctx.shadowBlur=W*.021;ctx.shadowOffsetY=7;
      ctx.fillStyle="#faf9f6";ctx.beginPath();ctx.roundRect(-w*.5,-h*.5,w,h,19);ctx.fill();
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.clip();
      ctx.drawImage(peeled,sx,sy,square,square,-w*.5,-h*.54,w,h);
      ctx.fillStyle="#555";ctx.textAlign="center";ctx.font=`${W*.018}px monospace`;
      ctx.fillText("BONE LAYER",0,h*.41,w*.82);
      ctx.restore();
    }
  }
  if (
    !study.demo && study.showGuides &&
    (study.treatment === "inset" || study.treatment === "card-merge") &&
    targetOpacity > 0 &&
    points[anchor] &&
    (cursor.clicked || reduced)
  ) {
    const enter = reduced ? 1 : sculptureEase(age / 550),
      card = sculptureInsetFrame(
        target,
        W,
        H,
        study.showMeasurements && study.instrument !== "none",
      ),
      shift =
        study.treatment === "card-merge"
          ? sculptureEase((age - 1700) / 650)
          : 0;
    card.x += (1 - enter) * (target.x - card.x - card.width / 2) * 0.12;
    card.y += (1 - enter) * (target.y - card.y - card.height / 2) * 0.12;
    card.x += (target.x - card.width / 2 - card.x) * shift;
    card.y += (target.y - card.height / 2 - card.y) * shift;
    ctx.save();
    ctx.globalAlpha *= enter * (1 - shift) * targetOpacity;
    ctx.strokeStyle = chrome ? "#ffffffc0" : "#85858a90";
    ctx.lineWidth = W / 1080 * 1.5;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(
      Math.max(card.x + 24, Math.min(card.x + card.width - 24, target.x)),
      card.y,
    );
    ctx.stroke();
    ctx.shadowColor = "#0000000c";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.width, card.height, 24);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    const region =
      study.revealRegion !== "feature"
        ? sculptureCutawaySurface(study)
        : undefined;
    const outline = Array.from(
      { length: 49 },
      (_, i) => points[`${region?.contour ?? study.feature}:${i}`],
    ).filter((point): point is P => Boolean(point));
    if (study.feature === "gonial-angle" && points.ear) outline.push(points.ear);
    const center = points[anchor];
    const source = image as HTMLCanvasElement;
    const size = Math.min(
      source.width * 0.48,
      Math.max(
        source.width * 0.22,
        ...outline.map((q) => Math.abs(q.x - center.x) * source.width * 2.2),
        ...outline.map((q) => Math.abs(q.y - center.y) * source.height * 2.2),
      ),
    );
    const sx = Math.max(
        0,
        Math.min(source.width - size, center.x * source.width - size / 2),
      ),
      sy = Math.max(
        0,
        Math.min(source.height - size, center.y * source.height - size / 2),
      );
    ctx.drawImage(
      source,
      sx,
      sy,
      size,
      size,
      card.x,
      card.y,
      card.width,
      card.height,
    );
    ctx.strokeStyle = "#76767c38";
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.width, card.height, 24);
    ctx.stroke();
    ctx.restore();
  }
  if (study.treatment === "mirror" && !study.demo && cursor.clicked) {
    const axis = p("noseBase").x;
    ctx.save();
    ctx.strokeStyle = overlayInk(0.7);
    ctx.lineWidth = (1.6 * W) / 1080;
    ctx.setLineDash([(3 * W) / 1080, (6 * W) / 1080]);
    for (const reflected of [false, true]) {
      ctx.beginPath();
      for (let i = 0; i <= Math.floor(48 * enter); i++) {
        const q = p(`${study.feature}:${i}`),
          x = reflected ? axis * 2 - q.x : q.x;
        if (i) ctx.lineTo(x, q.y);
        else ctx.moveTo(x, q.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if ((study.reference || study.treatment === "research") && cursor.clicked) {
    const reveal = sculptureEase(sample.effectMs / 500);
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#0000000b";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.roundRect(W * 0.12, H * 0.22, W * 0.76, H * 0.075, 22);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#777";
    ctx.font = `${W * 0.019}px -apple-system,sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(
      study.reference?.title ?? "ONE VARIABLE · SAME CAMERA · SAME LIGHT",
      W * 0.16,
      H * 0.249,
    );
    if (study.reference) {
      ctx.font = `${W * 0.017}px -apple-system,sans-serif`;
      ctx.fillText(study.reference.detail, W * 0.16, H * 0.277);
    }
    ctx.restore();
  }
  drawSculptureEditorial(ctx, study, overlayPoint, frame, image, baseline, W, H, age, reduced, theme);
  if (study.showGuides && targetOpacity > 0)
    drawEditorialCursor(ctx, { ...cursor, opacity: cursor.opacity * targetOpacity });
  if (eye || study.profileGuide || !study.showGuides || !study.showMeasurements) {
    ctx.restore();
    return;
  }
  if (
    metric &&
    !sculptureLayerTreatment(study.treatment) &&
    !["inset","card-merge","profile-chain","reference-ratio"].includes(study.treatment) &&
    study.feature !== "camera-distance" &&
    study.instrument !== "dial" &&
    target.visible !== false &&
    cursor.clicked &&
    metric.baseline > 0
  ) {
    const label = metric.degrees
      ? `${metric.current.toFixed(1)}° MODEL ANGLE`
      : `${(metric.current / metric.baseline).toFixed(3)}× BASELINE`;
    const alpha = reduced ? 1 : sculptureEase((age - 380) / 360);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = `${W * 0.022}px SFMono-Regular,monospace`;
    const w = ctx.measureText(label).width + W * 0.035,
      h = W * 0.047;
    const x = Math.max(W * 0.08, Math.min(W * 0.92 - w, target.x + W * 0.045)),
      y = Math.max(H * 0.27, Math.min(H * 0.73, target.y - h * 0.5));
    ctx.fillStyle = chrome ? "rgba(32,39,48,.8)" : "rgba(250,250,250,.92)";
    ctx.shadowColor = "#0000000b";
    ctx.shadowBlur = W * 0.012;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h * 0.45);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = chrome ? overlayInk(.5) : "rgba(80,80,80,.18)";
    ctx.lineWidth = W / 1080;
    ctx.stroke();
    ctx.fillStyle = chrome ? "#fff" : "#444";
    ctx.textAlign = "left";
    drawVideoTextMorph(
      ctx,
      metric.degrees
        ? `${metric.baseline.toFixed(1)}° MODEL ANGLE`
        : "1.000× BASELINE",
      label,
      x + W * 0.0175,
      y + h * 0.64,
      alpha,
      w - W * 0.035,
    );
    ctx.restore();
  }
  if (study.instrument === "none" || (!cursor.clicked && !reduced)) {
    ctx.restore();
    return;
  }
  // Click -> readout -> tick sweep -> marker. All clocks are segment-local for exports.
  ctx = videoThemeContext(ctx, theme);
  const instrumentMotion = sculptureInstrumentMotion(age, reduced);
  const instrumentEnter = instrumentMotion.entry;
  const railEnter = instrumentMotion.rail;
  ctx.save();
  ctx.globalAlpha *= instrumentEnter;
  ctx.translate(0, (1 - instrumentEnter) * W * 0.018);
  const left = W * 0.13,
    width = W * 0.74,
    y = rulerTop;
  const dial =
    study.instrument === "dial" && study.feature !== "camera-distance";
  if (dial) {
    // A soft white pocket keeps the circular instrument readable over fading hair/shoulders.
    ctx.save();
    const x = W * 0.68,
      cy = y + W * 0.009,
      radius = W * 0.23;
    const veil = ctx.createRadialGradient(x, cy, W * 0.07, x, cy, radius);
    veil.addColorStop(0, "rgba(255,255,255,.92)");
    veil.addColorStop(0.55, "rgba(255,255,255,.65)");
    veil.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(x - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }
  const style =
    study.instrument === "auto"
      ? /angle|tilt|slope|rotation/.test(study.feature)
        ? "arc"
        : /width|philtrum/.test(study.feature)
          ? "balanced"
          : "linear"
      : study.instrument;
  ctx.fillStyle = "#56524e";
  ctx.textAlign = "left";
  ctx.font = `400 ${W * 0.018}px SFMono-Regular,monospace`;
  ctx.fillText(sculptureLabels[study.feature].toUpperCase(), left, y - 34);
  ctx.fillStyle = "#302d29";
  ctx.textAlign = dial ? "left" : "right";
  ctx.font = `400 ${W * 0.044}px -apple-system,sans-serif`;
  drawVideoTextMorph(
    ctx,
    study.feature === "camera-distance"
      ? `${Math.round(12 + (sample.baseline + 1) * 24)}″`
      : metric?.degrees
        ? `${metric.baseline.toFixed(1)}°`
        : `${sample.baseline >= 0 ? "+" : ""}${sample.baseline.toFixed(2)}`,
    study.feature === "camera-distance"
      ? `${Math.round(12 + (sample.value + 1) * 24)}″`
      : metric?.degrees
        ? `${metric.current.toFixed(1)}°`
        : `${sample.value >= 0 ? "+" : ""}${sample.value.toFixed(2)}`,
    dial ? left : left + width,
    y + 4,
    reduced ? 1 : sculptureEase(sample.effectMs / 300),
    W * 0.2,
  );
  const unit = W / 390;
  ctx.save();
  ctx.translate(dial ? W * 0.51 : left, dial ? y - W * 0.16 : y + 30);
  ctx.scale(unit, unit);
  drawNativeReportMetric(
    ctx,
    {
      id: study.feature,
      label: sculptureLabels[study.feature],
      value: String(sample.value),
      visual: "Rail",
      positions: [
        metric?.degrees
          ? Math.max(0, Math.min(1, metric.current / 180))
          : (sample.value + 1) / 2,
      ],
      grade: null,
      scale: "range",
    },
    0,
    0,
    dial ? 132 : width / unit,
    100,
    railEnter,
    {
      markerProgress: instrumentMotion.marker,
      markerOpacity: instrumentMotion.markerOpacity,
      style: study.feature === "camera-distance" ? "linear" : style,
      palette: {
        ink: "#36322e",
        muted: "#85807a",
        accent: "#514a41",
        warm: "#514a41",
      },
      axisLabel: (value) =>
        study.feature === "camera-distance"
          ? `${Math.round(12 + value * 48)}″`
          : metric?.degrees
            ? `${Math.round(value * 180)}°`
            : (value * 2 - 1).toFixed(1),
    },
  );
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

function drawSculptureFooter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
) {
  ctx.save();
  ctx.fillStyle = "#8e8a85";
  ctx.strokeStyle = "#8e8a85";
  ctx.font = `${W * 0.016}px SFMono-Regular,monospace`;
  ctx.textAlign = "left";
  ctx.fillText("Mogging.com", W * 0.08, H * 0.963);
  ctx.textAlign = "right";
  const label = "2026 Worldwide",
    right = W * 0.92,
    y = H * 0.963;
  ctx.fillText(label, right, y);
  const r = W * 0.009,
    x = right - ctx.measureText(label).width - W * 0.022;
  ctx.lineWidth = (W / 1080) * 1.2;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.7, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.7, r * 0.43, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.7);
  ctx.lineTo(x + r, y - r * 0.7);
  ctx.stroke();
  ctx.restore();
}
