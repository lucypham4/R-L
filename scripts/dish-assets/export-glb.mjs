// Saves the tour's dishes as .glb files, to keep or open elsewhere
// (Blender, any glTF viewer).
//
//   node scripts/dish-assets/export-glb.mjs [outDir]
//
// The dishes are painted by shaders (dishMaterials.js), and a 3D file
// cannot carry a shader, so each vertex's colour is worked out here
// (paintAt) and saved as a vertex colour on an unlit material. The toon
// outline is saved as real geometry -- the hull pushed out and turned
// inside out -- in its own group, so it can be hidden. The shine balls on
// round food are not saved: they depend on where the camera stands. The
// placed ones (plate rims, soup) are shapes, and are.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { BufferGeometry, Color, Float32BufferAttribute, Group, Matrix3, Matrix4, Mesh, MeshBasicMaterial, Scene, Vector2, Vector3 } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const OUT = path.resolve(process.argv[2] ?? 'dish-glb');

// GLTFExporter reads its buffers through a browser FileReader.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const { SCENES } = await vite.ssrLoadModule('/src/lib/dishScene.js');
const { MINIS } = await vite.ssrLoadModule('/src/lib/dishMinis.js');
const { addOutlines, paintAt } = await vite.ssrLoadModule('/src/lib/dishMaterials.js');

/** One source mesh, flattened into the root's space with its colours baked. */
function flatten(mesh, rootInverse) {
  const paint = mesh.material.userData?.paint;
  if (!paint || paint.kind === 'stream') return null;
  if ((mesh.material.userData.opacity?.value ?? 1) < 0.01) return null;
  const hull = paint.kind === 'hull';

  const geo = mesh.geometry;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uvs = geo.attributes.uv;
  const index = geo.index;
  const total = index ? index.count : pos.count;
  const start = Math.max(0, geo.drawRange.start);
  const end = Math.min(total, start + geo.drawRange.count);
  const vertexAt = (i) => (index ? index.getX(i) : i);

  const instances = mesh.isInstancedMesh ? mesh.count : 1;
  const positions = [];
  const colours = [];
  const base = new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  const m = new Matrix4();
  const instance = new Matrix4();
  const normalMatrix = new Matrix3();
  const pL = new Vector3();
  const nL = new Vector3();
  const nW = new Vector3();
  const p = new Vector3();
  const uv = new Vector2();
  const c = new Color();

  for (let k = 0; k < instances; k++) {
    m.copy(base);
    if (mesh.isInstancedMesh) m.multiply(instance.fromArray(mesh.instanceMatrix.array, k * 16));
    normalMatrix.getNormalMatrix(m);
    // An outline is the hull's back faces, so it is turned inside out; a
    // mirrored transform turns anything inside out, so undoes that.
    const flip = hull !== m.determinant() < 0;
    for (let t = start; t + 2 < end; t += 3) {
      const tri = flip ? [t, t + 2, t + 1] : [t, t + 1, t + 2];
      for (const i of tri) {
        const v = vertexAt(i);
        pL.fromBufferAttribute(pos, v);
        nL.fromBufferAttribute(nor, v).normalize();
        nW.copy(nL).applyMatrix3(normalMatrix).normalize();
        const colour = paintAt(paint, { normalWorld: nW, normalLocal: nL, positionLocal: pL, uv: uvs ? uv.fromBufferAttribute(uvs, v) : null }, c);
        if (!colour) return null;
        p.copy(pL);
        if (hull) p.addScaledVector(nL, paint.width);
        p.applyMatrix4(m);
        positions.push(p.x, p.y, p.z);
        colours.push(colour.r, colour.g, colour.b);
      }
    }
  }
  if (!positions.length) return null;
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(positions, 3));
  out.setAttribute('color', new Float32BufferAttribute(colours, 3));
  // Corners shared between triangles are stored once: about a third the size.
  const merged = mergeVertices(out, 1e-5);
  merged.computeVertexNormals();
  return { geometry: merged, hull, kind: paint.kind };
}

const unlit = new MeshBasicMaterial({ vertexColors: true });

/** The dish as it stands, as a scene of two groups: the food and dishware, and its outline. */
function toScene(name, root) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  addOutlines(root);
  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();

  const surfaces = new Group();
  surfaces.name = 'surfaces';
  const outlines = new Group();
  outlines.name = 'outlines';
  let n = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    const flat = flatten(o, rootInverse);
    if (!flat) return;
    const mesh = new Mesh(flat.geometry, unlit);
    mesh.name = `${flat.kind}-${n++}`;
    (flat.hull || flat.kind === 'ring' ? outlines : surfaces).add(mesh);
  });
  const scene = new Scene();
  scene.name = name;
  scene.add(surfaces, outlines);
  return scene;
}

async function save(file, scene) {
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  await writeFile(path.join(OUT, file), Buffer.from(glb));
  console.log(file, `${(glb.byteLength / 1024).toFixed(0)} KB`);
}

try {
  await mkdir(OUT, { recursive: true });
  // Each scene at its finished moment: the soup assembled, the archive
  // settled with every cell on its own dish.
  const moments = { dessert: 0, soup: null, archive: 6, zucchini: 0 };
  for (const [name, at] of Object.entries(moments)) {
    const built = SCENES[name]();
    built.update(at ?? built.still);
    await save(`${name}.glb`, toScene(name, built.root));
  }
  for (const build of MINIS) {
    await save(`archive-${build.name}.glb`, toScene(build.name, build()));
  }
} finally {
  await vite.close();
}
