# Christian import

The selectable rider uses the owner's `human figure 3d model.glb`, not a replacement mesh. The original file is untouched. `public/models/humans/christian.glb` is a corrected derivative.

The source contained valid inverse binds but absent node rest transforms, a 90-degree armature/mesh frame mismatch, and 23,019 of 23,188 vertices primarily weighted to the hips. `scripts/repair-human.mjs input.glb output.glb` reconstructs the rest frame and normalized anatomical weights. It preserves POSITION, UV, index and texture data. Original and repaired POSITION SHA-256: `64c6b89e9b29c72454e0d392a26cc7ad455114193020ffded85bb2713a325b5e`.

`src/scooter/imported-human.ts` adapts the imported bones to the existing riding/trick pose drivers. It preserves full local affine matrices, aligns palms with grip sockets, binds clavicles, and uses imported neck/chest proportions. Gameplay physics and trick timing remain unchanged. The legacy visible anatomy is hidden. Christian is the only selectable rider; old outfit inventory and scooter/economy saves remain preserved. His supplied outfit is fixed rather than showing clothing options which do not fit this mesh.

Validation: eleven browser pose snapshots check finite, bounded skinned geometry and shadow casting; standing, crouch, run and trick screenshots reviewed. These are simulated poses in desktop Chrome/SwiftShader, not physical-controller, mobile or every-animation-frame acceptance. Generated skin weights remain an approximation; tight sleeve folds and extreme trick hand contact still need artist-level refinement. Do not describe the character as flawless.

Future imports should reuse the semantic driver adapter after verifying their actual rest pose and weights. The source-specific thresholds in the repair script must not be blindly applied to another humanoid.
