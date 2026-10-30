# Anatomy asset provenance

`public/models/scattering-skull.glb` is the **ScatteringSkull** sample from KhronosGroup/glTF-Sample-Assets, by **Vladimir Petkovic** (2025), dedicated under **CC0 1.0 Universal**.

- Original model and license: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ScatteringSkull
- Source binary: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb
- CC0: https://creativecommons.org/publicdomain/zero/1.0/legalcode

The bundled binary is unmodified. The renderer uses the real mesh and ambient-occlusion texture with a neutral physical material, warm key light, and restrained cyan rim light. It is a generic anatomical reference, **not a reconstruction of the person in a supplied photograph**. This is stated on every anatomy slide. No QOVES imagery, models, reports, or proprietary assets are bundled.

One lazy Three.js renderer owns the WebGL context and cached model. Frames use explicit composition time, not a separate animation loop. The WebGL result is painted into the same video canvas used for preview, seeking, frame capture, and export. WebGL/model failures stop preparation with an error rather than substituting a hand-drawn skull.

Anatomy slides register to the nearest preceding visible photographed head, using its actual face boundary and canvas world placement. A one-time alpha-bound scan removes transparent WebGL padding from the alignment calculation. The photograph remains as dim context; a short co-registered reveal transitions to the reference mesh. The matching is presentation alignment, not a fitted anatomical reconstruction.

The skull footprint is inset slightly inside the face width, rather than expanded beyond it. Initial yaw and roll follow available landmark quality estimates; otherwise eye-line roll and a restrained nose-to-eye-center yaw estimate supply a 2D approximation. Canvas rotation is included. A reveal holds that starting orientation; subsequent focus moves add relative rotation. This does not infer an accurate 3D head pose or the person's underlying bone geometry from a single photograph.

The first 700 ms retain photo registration. The same model node then moves and scales into a centered inspection stage, which persists across consecutive anatomy cuts. The reference photograph settles to 8% opacity with a restrained 2.5-pixel blur; model and captions remain sharp. Camera focus, regional clipping and relative rotation remain independent of this stage placement.

Authored `graphic.anatomy` data selects whole-head, jaw, orbital, cheek or nasal emphasis and reveal, focus, isolate or cutaway motion. Camera zoom/target changes, restrained rotation, regional material emphasis and clipping-plane motion all use composition time. The renderer keeps overscan around the model during those moves. Cut edges receive a restrained cyan accent.

The source is a single unrigged mesh. Isolation is an illustrative regional clipping cutaway, not anatomical part segmentation, a jaw articulation rig, or a surgical simulation.

Optional `graphic.anatomy.deformation` values from −0.5 to 0.5 drive bounded illustrative whole-head, jaw, orbital, cheek or nasal changes. Five relative position and normal morph targets are prepared once from the mesh; normals are recalculated for the changed geometry, and the same explicit scene clock drives their influences. `highlight` selects regional tint, surface-rim emphasis, or natural bone. These are generic explanatory mesh variations, not predictions, fitted celebrity anatomy, or models of a procedure. The source binary remains unchanged.

Qualitative instrument panels also use this model instead of schematic trapezoids. Item `diagram` values select cheek-width, mandibular taper, isolated jaw contour, orbital, nasal, bilateral or lateral reference views (`width`, `taper`, `contour`, `orbits`, `nasal`, `symmetry`, `profile`). Width, taper, orbital and nasal panels demonstrate bounded regional morphs; each panel identifies reference anatomy or an illustrative variation. `expression` uses a registered crop of the preceding portrait's soft tissue, never a skull deformation masquerading as expression. Continuing panels share a chapter clock, so a caption change does not restart the deformation. Four bounded render snapshots reuse settled model views without repeatedly rendering WebGL during a hold.
