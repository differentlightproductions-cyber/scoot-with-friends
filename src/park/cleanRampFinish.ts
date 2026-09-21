import * as THREE from 'three';

/** One finish for imported plywood. Source UVs still identify metal and hardware. */
export function applyCleanRampFinish(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeVertexNormals();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.map || material.userData.cleanRampFinish) continue;
      material.userData.cleanRampFinish = true;
      material.map.anisotropy = 8;
      material.normalScale.set(0, 0);
      material.normalMap = null;
      material.roughnessMap = null;
      material.aoMap = null;
      material.metalnessMap = null;
      material.roughness = .82;
      material.metalness = .04;
      const box = root.name === 'Detailed large-box' ? [2.3,4,1.65,-9,8] : root.name === 'Detailed small-box' ? [1.4,2.75,1.75,-7.5,5.5] : null;
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.vertexShader = 'varying vec3 rampFinishPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nrampFinishPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
        shader.fragmentShader = 'varying vec3 rampFinishPosition;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          // Warm source pixels mark plywood; neutral metal, bolts and edges remain.
          float warm = diffuseColor.r - diffuseColor.b;
          float wood = smoothstep(.002, .008, warm);
          vec2 panel = rampFinishPosition.xz;
          float grain = sin(panel.y * 105.0 + sin(panel.x * 7.0) * .7) * .006;
          float seamDistance = min(fract((panel.x + 32.0) / 1.22), 1.0 - fract((panel.x + 32.0) / 1.22)) * 1.22;
          float seam = 1.0 - smoothstep(.0015, .004, seamDistance);
          vec3 plywood = vec3(.58, .405, .235) + grain;
          plywood *= 1.0 - seam * .16;
          diffuseColor.rgb = mix(diffuseColor.rgb, plywood, wood);
        `);
        if (box) {
          const [h, run, deck, start, end] = box;
          const lip = end-run, landing = lip-deck, radius = (run*run+h*h)/(2*h);
          shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            float z = rampFinishPosition.z;
            float top = ${h.toFixed(8)};
            float slope = 0.0;
            if(z >= ${lip.toFixed(8)}) {
              float d = clamp(${end.toFixed(8)}-z,0.0,${run.toFixed(8)});
              float base = sqrt(max(.0001,${(radius*radius).toFixed(8)}-d*d));
              top = ${radius.toFixed(8)}-base; slope = -d/base;
            } else if(z < ${landing.toFixed(8)}) {
              float t = clamp((z-(${start.toFixed(8)}))/${(landing-start).toFixed(8)},0.0,1.0);
              top = ${h.toFixed(8)}*t*t*(3.0-2.0*t);
              slope = ${h.toFixed(8)}*6.0*t*(1.0-t)/${(landing-start).toFixed(8)};
            }
            if(wood > .5 && abs(rampFinishPosition.y-top)<.12)
              normal = normalize(mat3(viewMatrix)*vec3(0.0,1.0,-slope));
          `);
        }
      };
      const cache = material.customProgramCacheKey.bind(material);
      const key = cache();
      material.customProgramCacheKey = () => key + '|clean-plywood-2|' + root.name;
      material.needsUpdate = true;
    }
  });
}




