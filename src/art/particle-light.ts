// Night light for weather particles (#74): falling leaves, snow, rain and
// blown dust are drawn unlit, so at night they used to glow like daytime. Now
// each particle is lit where it is: faintly by the sky (more under a bright
// moon), brightly inside the headlamp's beam and near the park's lamps, and
// with a silver glint when it passes between the eye and the moon. By day
// they are unchanged. Daylight (park/daylight.ts) updates these every frame.
import * as THREE from "three";

export const MAX_PARTICLE_LAMPS = 8;
export const particleLight = {
  /** 0 by day .. 1 at night: how much of this lighting applies. */
  uNightDark: { value: 0 },
  /** Light everywhere at night: starlight and moonlight. */
  uNightBase: { value: 1 },
  /** The headlamp: where it is, which way it points, how bright (0 off). */
  uBeamPos: { value: new THREE.Vector3() },
  uBeamDir: { value: new THREE.Vector3(0, -1, 0) },
  uBeamOn: { value: 0 },
  /** Toward the moon, and how bright it is (0 new or set). */
  uMoonToward: { value: new THREE.Vector3(0, 1, 0) },
  uMoonGlint: { value: 0 },
  /** Park lamps: xyz and reach in metres (w 0 = none). */
  uParkLamps: { value: Array.from({ length: MAX_PARTICLE_LAMPS }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
};

const VERTEX_HEAD = /* glsl */ `
uniform float uNightDark, uNightBase, uBeamOn, uMoonGlint;
uniform vec3 uBeamPos, uBeamDir, uMoonToward;
uniform vec4 uParkLamps[${MAX_PARTICLE_LAMPS}];
varying float vNightLight;
`;
const VERTEX_BODY = /* glsl */ `
{
  vec3 lightWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float lit = uNightBase;
  if (uBeamOn > 0.0) {
    vec3 fromBeam = lightWorld - uBeamPos;
    float reach = length(fromBeam);
    // The beam's cone (the spot light's 35 degrees, soft edged) fading with distance, and a little spill right around the rider.
    float cone = smoothstep(0.81, 0.96, dot(fromBeam / max(reach, 0.001), uBeamDir));
    lit += uBeamOn * (cone * 2.4 / (1.0 + reach * reach * 0.012) + 0.5 / (1.0 + reach * reach * 1.2));
  }
  for (int i = 0; i < ${MAX_PARTICLE_LAMPS}; i++) {
    vec4 lamp = uParkLamps[i];
    if (lamp.w > 0.0) lit += 1.5 * smoothstep(lamp.w, lamp.w * 0.2, distance(lightWorld, lamp.xyz));
  }
  // Between the eye and the moon: lit from behind, a bright rim.
  lit += uMoonGlint * pow(max(dot(normalize(lightWorld - cameraPosition), uMoonToward), 0.0), 48.0) * 2.2;
  vNightLight = mix(1.0, clamp(lit, 0.0, 1.8), uNightDark);
}
`;
/**
 * Lights a particle material at night: keeps its own shader changes (runs its
 * onBeforeCompile first) and gives it a distinct program key.
 */
export function lightParticles<T extends THREE.Material>(material: T): T {
  const compile = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material)();
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    Object.assign(shader.uniforms, particleLight);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + VERTEX_BODY);
    shader.fragmentShader = "varying float vNightLight;\n" + shader.fragmentShader.replace("#include <alphatest_fragment>", "diffuseColor.rgb *= vNightLight;\n#include <alphatest_fragment>");
  };
  material.customProgramCacheKey = () => key + "|night-lit-v1";
  return material;
}
