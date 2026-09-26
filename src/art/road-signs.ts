// Street furniture signs: green street-name blades, yellow warning diamonds, a
// speed limit, and the checkered start and finish gates a timed race puts up.
// Faces are painted on canvases (cached per design), backs are bare aluminium,
// posts galvanised steel. Each sign is a group standing at its foot, facing +z.
import * as THREE from "three";

const faces = new Map<string, THREE.Texture>();
const face = (key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
  const hit = faces.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  faces.set(key, t);
  return t;
};
/** Bold, condensed lettering like a highway sign's, shrunk to fit `maxWidth`. */
const letter = (g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxWidth: number) => {
  g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
  const wide = g.measureText(text).width;
  if (wide > maxWidth) g.font = `bold ${Math.floor((size * maxWidth) / wide)}px "Arial Narrow", Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, x, y);
};
const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};

let kit: { steel: THREE.MeshStandardMaterial; back: THREE.MeshStandardMaterial } | null = null;
const materials = () => (kit ??= {
  steel: new THREE.MeshStandardMaterial({ color: 0x9ea3a6, metalness: 0.7, roughness: 0.38, name: "Sign post steel" }),
  back: new THREE.MeshStandardMaterial({ color: 0xb9bdbf, metalness: 0.55, roughness: 0.5, name: "Sign back" }),
});
const faceMaterial = (map: THREE.Texture, cut = false) => new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0.05, alphaTest: cut ? 0.5 : 0, name: "Sign face" });

/** A round galvanised post `height` tall, with a cap. */
function post(height: number, radius = 0.032) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), materials().steel);
  m.position.y = height / 2; m.castShadow = true;
  return m;
}

/** Street-name blades on a post: the first faces along +z's sides (the street it names runs across), the rest turn 90° each. */
export function streetNameSign(names: string[]) {
  const group = new THREE.Group();
  group.name = "Street name sign: " + names.join(" / ");
  group.add(post(3.1));
  names.forEach((name, i) => {
    const map = face("blade:" + name, 512, 112, (g, w, h) => {
      g.fillStyle = "#1c6b45"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#f1f3ee"; g.lineWidth = 6; roundRect(g, 7, 7, w - 14, h - 14, 10); g.stroke();
      g.fillStyle = "#f1f3ee"; letter(g, name, w / 2, h / 2 + 3, 74, w - 50);
    });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.25, 0.014), [materials().back, materials().back, materials().back, materials().back, faceMaterial(map), faceMaterial(map)]);
    blade.position.set(0, 2.95 - i * 0.27, 0);
    blade.rotation.y = i % 2 ? Math.PI / 2 : 0;
    blade.castShadow = true;
    group.add(blade);
  });
  return group;
}

export type WarningSymbol = "curve-left" | "curve-right" | "reverse-left" | "reverse-right" | "hill";
/** A yellow warning diamond (0.76 m) with a black symbol, and an optional plaque below it. */
export function warningSign(symbol: WarningSymbol, plaque?: string) {
  const group = new THREE.Group();
  group.name = "Warning sign: " + symbol + (plaque ? " / " + plaque : "");
  const map = face("warn:" + symbol, 256, 256, (g, w, h) => {
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    g.fillStyle = "#1b1b1b"; roundRect(g, -88, -88, 176, 176, 14); g.fill();
    g.fillStyle = "#f5c518"; roundRect(g, -81, -81, 162, 162, 10); g.fill();
    g.fillStyle = "#1b1b1b"; roundRect(g, -76, -76, 152, 152, 8); g.fill();
    g.fillStyle = "#f5c518"; roundRect(g, -71, -71, 142, 142, 6); g.fill();
    g.restore();
    g.fillStyle = "#1b1b1b"; g.strokeStyle = "#1b1b1b"; g.lineCap = "butt"; g.lineJoin = "miter";
    const arrowHead = (x: number, y: number, angle: number) => {
      g.save(); g.translate(x, y); g.rotate(angle);
      g.beginPath(); g.moveTo(0, -26); g.lineTo(22, 6); g.lineTo(-22, 6); g.closePath(); g.fill(); g.restore();
    };
    if (symbol === "hill") {
      // A truck on a downgrade.
      g.save(); g.translate(w / 2, h / 2 + 16); g.rotate(0.32);
      g.fillRect(-50, -34, 62, 34); g.fillRect(14, -24, 30, 24);
      g.beginPath(); g.arc(-34, 4, 9, 0, Math.PI * 2); g.arc(30, 4, 9, 0, Math.PI * 2); g.fill();
      g.restore();
      g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2 - 66, h / 2 + 6); g.lineTo(w / 2 + 62, h / 2 + 50); g.stroke();
    } else {
      // A bent arrow; the reverse curve bends one way, then the other.
      const flip = symbol.endsWith("left") ? -1 : 1, reverse = symbol.startsWith("reverse");
      g.lineWidth = 17; g.beginPath();
      if (reverse) { g.moveTo(w / 2 - 6 * flip, h / 2 + 64); g.bezierCurveTo(w / 2 - 6 * flip, h / 2 + 20, w / 2 + 30 * flip, h / 2 + 18, w / 2 + 30 * flip, h / 2 - 6); g.bezierCurveTo(w / 2 + 30 * flip, h / 2 - 30, w / 2 - 6 * flip, h / 2 - 30, w / 2 - 6 * flip, h / 2 - 44); g.stroke(); arrowHead(w / 2 - 6 * flip, h / 2 - 56, 0); }
      else { g.moveTo(w / 2 - 14 * flip, h / 2 + 64); g.lineTo(w / 2 - 14 * flip, h / 2 + 4); g.quadraticCurveTo(w / 2 - 14 * flip, h / 2 - 34, w / 2 + 26 * flip, h / 2 - 34); g.stroke(); arrowHead(w / 2 + 36 * flip, h / 2 - 34, (Math.PI / 2) * flip); }
    }
  });
  // The diamond itself: a square turned 45° (its UVs span the painted square).
  const size = 0.76 * Math.SQRT2, shape = new THREE.PlaneGeometry(size, size), frontMat = faceMaterial(map, true);
  const front = new THREE.Mesh(shape, frontMat); front.position.set(0, 2.25, 0.02); front.castShadow = true;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), materials().back); back.position.set(0, 2.25, 0.015); back.rotation.set(0, Math.PI, Math.PI / 4);
  group.add(post(2.6), front, back);
  if (plaque) {
    const plate = face("plaque:" + plaque, 320, 128, (g, w, h) => {
      g.fillStyle = "#1b1b1b"; roundRect(g, 0, 0, w, h, 12); g.fill();
      g.fillStyle = "#f5c518"; roundRect(g, 6, 6, w - 12, h - 12, 9); g.fill();
      g.fillStyle = "#1b1b1b"; letter(g, plaque, w / 2, h / 2 + 3, 64, w - 36);
    });
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.012), [materials().back, materials().back, materials().back, materials().back, faceMaterial(plate), materials().back]);
    p.position.set(0, 1.62, 0.02); p.castShadow = true;
    group.add(p);
  }
  return group;
}

/** A white regulatory SPEED LIMIT sign. */
export function speedLimitSign(mph: number) {
  const group = new THREE.Group();
  group.name = "Speed limit " + mph;
  const map = face("limit:" + mph, 256, 320, (g, w, h) => {
    g.fillStyle = "#f4f4f1"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#151515"; g.lineWidth = 7; roundRect(g, 9, 9, w - 18, h - 18, 12); g.stroke();
    g.fillStyle = "#151515"; letter(g, "SPEED", w / 2, 62, 50, w - 40); letter(g, "LIMIT", w / 2, 112, 50, w - 40); letter(g, String(mph), w / 2, 222, 150, w - 40);
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.012), [materials().back, materials().back, materials().back, materials().back, faceMaterial(map), materials().back]);
  sign.position.set(0, 2.2, 0.02); sign.castShadow = true;
  group.add(post(2.6), sign);
  return group;
}

/**
 * The checkered gate a timed race puts over the road: two posts `span` apart,
 * a banner across the top and a checkered line on the road (laid over `ground`
 * in the gate's own frame, x across the road).
 */
export function raceGate(label: "START" | "FINISH", span: number, ground: (x: number) => number) {
  const group = new THREE.Group();
  group.name = "Race gate: " + label;
  const checker = (g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, cell: number) => {
    for (let y = 0; y < h / cell; y++) for (let x = 0; x < w / cell; x++) { g.fillStyle = (x + y) % 2 ? "#151515" : "#f3f3ef"; g.fillRect(x0 + x * cell, y0 + y * cell, cell, cell); }
  };
  const map = face("gate:" + label, 1024, 160, (g, w, h) => {
    checker(g, 0, 0, w, 32, 16); checker(g, 0, h - 32, w, 32, 16);
    g.fillStyle = label === "START" ? "#1c6b45" : "#b3261e"; g.fillRect(0, 32, w, h - 64);
    g.fillStyle = "#f3f3ef"; letter(g, label, w / 2, h / 2 + 3, 86, w - 80);
  });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(span, span * 0.16, 0.05), [materials().back, materials().back, materials().back, materials().back, faceMaterial(map), faceMaterial(map)]);
  banner.position.y = 4.6; banner.castShadow = true;
  group.add(banner);
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.2, 0.22), new THREE.MeshStandardMaterial({ color: side < 0 ? 0xdedbd2 : 0xdedbd2, roughness: 0.6, name: "Gate tower" }));
    tower.position.set((side * span) / 2, 2.6, 0); tower.castShadow = true;
    group.add(tower);
  }
  const line = face("gate-line", 512, 32, (g, w, h) => checker(g, 0, 0, w, h, 16));
  const strip = new THREE.PlaneGeometry(span - 0.6, 0.5, 24, 1);
  strip.rotateX(-Math.PI / 2);
  const p = strip.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i)) + 0.012);
  strip.computeVertexNormals();
  const road = new THREE.Mesh(strip, new THREE.MeshStandardMaterial({ map: line, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, name: "Race line" }));
  road.receiveShadow = true;
  group.add(road);
  return group;
}
