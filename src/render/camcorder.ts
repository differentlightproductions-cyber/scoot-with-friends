import * as THREE from "three";

/**
 * Optional '90s Camcorder look for the 3D gameplay image only.
 *
 * One scene render into a reduced-resolution target, then one full-screen pass
 * that upsamples softly, adds faint colour fringes on edges, lifts the shadows
 * and fades the colour. HUD and menus are HTML above the canvas, and the
 * customization preview renders straight to the screen afterwards, so both
 * stay sharp and true to colour. Tone mapping and sRGB output happen once, in
 * this pass. Off bypasses everything; strength 0 is visually neutral.
 */
export class CamcorderFilter {
  enabled = false;
  /** 0..1 */
  strength = 0.65;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        source: { value: null },
        texel: { value: new THREE.Vector2(1, 1) },
        strength: { value: this.strength },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D source;
        uniform vec2 texel;
        uniform float strength;
        varying vec2 vUv;
        // A float target keeps values the 8-bit screen used to clamp away: a few
        // surface shaders produce NaN or negative texels. Drop them before blending.
        vec4 fetch(vec2 uv) {
          vec3 c = texture2D(source, uv).rgb;
          bool valid = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1e4 && c.g < 1e4 && c.b < 1e4;
          return valid ? vec4(c, 1.0) : vec4(0.0);
        }
        vec3 soft(vec2 uv) {
          // A small tent around the low-res texel: soft edges without a smear.
          vec2 d = texel * 0.75;
          vec4 sum = fetch(uv) * 2.0 + fetch(uv + vec2(d.x, 0.0)) + fetch(uv - vec2(d.x, 0.0)) + fetch(uv + vec2(0.0, d.y)) + fetch(uv - vec2(0.0, d.y));
          return sum.a > 0.0 ? sum.rgb / sum.a : vec3(0.0);
        }
        void main() {
          vec4 center = fetch(vUv);
          vec3 blurred = soft(vUv);
          vec3 base = center.a > 0.0 ? center.rgb : blurred;
          vec3 color = mix(base, blurred, strength * 0.8);
          // Faint colour fringes: red and blue shifted a fraction of a texel apart.
          vec2 fringe = vec2(texel.x * 0.9 * strength, 0.0);
          vec4 red = fetch(vUv + fringe), blue = fetch(vUv - fringe);
          color.r = mix(color.r, red.a > 0.0 ? red.r : color.r, 0.55 * strength);
          color.b = mix(color.b, blue.a > 0.0 ? blue.b : color.b, 0.55 * strength);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // Display-space grade: lifted shadows, pale highlights, softer saturation,
          // a slightly warm cast. Contrast stays high enough to read coping and ledges.
          vec3 c = gl_FragColor.rgb;
          float luma = dot(c, vec3(0.299, 0.587, 0.114));
          vec3 graded = mix(vec3(luma), c, 0.82);
          graded = graded * 0.9 + 0.075;
          graded = mix(graded, graded * vec3(1.03, 1.0, 0.95), 0.6);
          graded += smoothstep(0.7, 1.0, luma) * 0.035;
          gl_FragColor.rgb = mix(c, clamp(graded, 0.0, 1.0), strength);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  /** Renders the gameplay view, filtered when enabled. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, after?: () => void) {
    if (!this.enabled) {
      renderer.render(scene, camera);
      after?.();
      return;
    }
    const strength = THREE.MathUtils.clamp(this.strength, 0, 1);
    renderer.getDrawingBufferSize(this.size);
    // Lower detail: down to about a quarter of the vertical resolution at full
    // strength, never below 220 lines, on a stable grid for the current window.
    const scale = THREE.MathUtils.lerp(1, Math.max(0.24, 220 / Math.max(1, this.size.y)), Math.pow(strength, 0.7));
    const width = Math.max(1, Math.round(this.size.x * scale)), height = Math.max(1, Math.round(this.size.y * scale));
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    } else if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    // Overlays (the first-person phone close-up) share the filtered picture.
    after?.();
    renderer.setRenderTarget(previous);
    this.material.uniforms.source.value = this.target.texture;
    (this.material.uniforms.texel.value as THREE.Vector2).set(1 / width, 1 / height);
    this.material.uniforms.strength.value = strength;
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target?.dispose();
    this.target = null;
  }
}
