import * as THREE from 'three';

/** One finish for imported plywood. Source UVs still identify metal and hardware. */
export function applyCleanRampFinish(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.map || material.userData.cleanRampFinish) continue;
      material.userData.cleanRampFinish = true;
      material.map.anisotropy = 8;
      // Keep the Tripo UV texture and its material maps. A reduced normal-map
      // strength retains plywood relief and fasteners without exaggerating the
      // source's generated scratches into gouges.
      if (material.normalMap) material.normalScale.multiplyScalar(.14);
      material.roughness = Math.max(.9, material.roughness ?? .9);
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          // Grade the existing warm wood texels into dark amber in linear
          // space. Neutral coping, bolts and entry plates retain their source
          // color and material response.
          vec3 sourceRampColor = diffuseColor.rgb;
          float sourceLuma = dot(sourceRampColor, vec3(.2126, .7152, .0722));
          float chroma = max(sourceRampColor.r, max(sourceRampColor.g, sourceRampColor.b))
            - min(sourceRampColor.r, min(sourceRampColor.g, sourceRampColor.b));
          float woodColor = smoothstep(.006, .030, chroma)
            * smoothstep(.002, .016, sourceRampColor.r - sourceRampColor.b);
          #ifdef USE_METALNESSMAP
            float sourceMetal = texture2D(metalnessMap, vMetalnessMapUv).b;
            float nonMetalWood = 1.0 - smoothstep(.35, .72, sourceMetal);
            float paleWood = smoothstep(.32, .58, sourceLuma) * (1.0 - smoothstep(.35, .72, sourceMetal));
            // Dark atlas fragments on the riding skin are baked source noise,
            // not separate hardware. The original metalness map distinguishes
            // them from coping and fasteners without replacing the source UVs.
            woodColor = max(woodColor, max(paleWood, nonMetalWood));
          #endif
          // Compress the source's broad generated highlight streaks while the
          // retained material maps continue to supply fine grain and relief.
          // The source atlases contain broad baked-light islands which become
          // long foil-like bands after fitting. Keep only a restrained amount
          // of base-color variation; normal/roughness maps retain the actual
          // grain, seams, fasteners and surface relief.
          float retainedDetail = clamp((sourceLuma - .24) * .09, -.025, .03);
          vec3 darkAmber = vec3(.105, .034, .008) * (1.0 + retainedDetail);
          diffuseColor.rgb = mix(sourceRampColor, darkAmber, woodColor * .985);
        `);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, .72);',
        );
      };
      const cache = material.customProgramCacheKey.bind(material);
      const key = cache();
      material.customProgramCacheKey = () => key + '|source-detail-dark-amber-3|' + root.name;
      material.needsUpdate = true;
    }
  });
}




