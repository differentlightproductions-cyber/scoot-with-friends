# Scoot With Friends — research integration refinements

**Integration revision:** v2, 16 September 2026. **Game execution:** NOT_RUN.

This document compares the supplied research blueprint with the preceding project
handoff. It distinguishes source-derived contracts from retained owner requirements
and new engineering supplements. It does not replace the original research with an
unlabeled rewrite, nor claim new primary-source web verification.

## 1. Source roles and precedence

**[R] Supplied research:** `04_Supplied_Research/01_Scooter_Physics_Research_and_Implementation.md`,
Revision 1.0. Section references below refer to its numbered headings. The supplied
kickoff, original JSON, PDF and DOCX are preserved byte-for-byte. The MD is primary;
PDF/DOCX are reading copies. Their pagination differs; cite section headings when
coordinating agents.

**[A] Supplied acceptance specifications:** the original 47 scenarios in
`04_Supplied_Research/03_Acceptance_Test_Matrix.json`. They have no bound game fixtures
and report NOT_RUN. The active `02_Acceptance_Test_Matrix_Refined.json` preserves each
of those 47 scenario objects unchanged and adds six labeled regression specifications.
It does not make either file executable by itself.

**[P] Retained product requirements:** the earlier owner/assistant handoff, including
`Claude_Scoot_Physics_Repair_Prompt.txt`, required direct RS Bri/Inward takeoff,
mid-trick body-flip initiation, manual catches, natural grind exits, and tape in both
vehicle builders. These are gameplay decisions, not claims derived from a scientific
paper. The old broad prompt is not duplicated as a competing active instruction set.

**[V] Existing visual references:** 100 previously sampled JPG frames and five contact
sheets, with their original source manifest. They remain qualitative pose/contact
references; this integration did not remeasure the videos or certify exact trick names.

**[I] Integration proposals:** the six explicit scenario additions, the focused run
plan and reporting safeguards below. These are recommendations for implementation
and testing, not measured athlete parameters.

Adopt [R]'s M0-M5 dependency order. Keep [P]'s explicit controller/product behavior
unless the owner changes it. When the two appear ambiguous, use the clarifications
in section 4 below and report any unresolved conflict. Do not silently invent a third
control system or claim a design decision is a research result.

## 2. What the supplied research adds to the previous plan

### 2.1 Pumping is configuration-dependent work, not a crouch boost

**Source-derived — [R] §§02, 04, 07-08, S04.** The blueprint summarizes Kogelbauer
and colleagues' variable-center-of-mass pumping model and comparison with two
skateboarders. Its support is for timing-dependent actuation, not a validated set of
freestyle-scooter force, timing or friction constants. The source's limited sample and
simplified assumptions remain explicit.

**Implementation consequence.** Track passive motion, commanded rider work and
assistance separately. A long held preload must not add energy every frame. A
force-based actuator's work must not also be added as a separate full analytical
speed gain. Verify repeated passive and actively pumped halfpipe cycles in both
directions, not just one successful jump. Keep g, collision losses and the real game
scale visible in the report.

### 2.2 A richer rotation model includes relative joint motion

**Source-derived — [R] §§04, 11-14, S05-S07.** The scalar `L = I*omega` is not a
complete model of a twisting articulated rider. The blueprint introduces
`L_world = R * (I_body(shape)*omega_body + h_relative)`, with relative joint momentum
represented explicitly. It distinguishes symmetric tuck approximations from more
complex asymmetric twisting mechanisms.

**Implementation consequence.** Do not claim that changing three scalar inertias
reproduces all real aerial twist. The recommended first solution remains reduced-order:
one controlled whole-body rotation, plausible tuck/extension, and correctly composed
scooter/limb articulation. A full physical ragdoll rebuild is not required. Any extra
midair angular authority not balanced by internal reaction is recorded as gameplay
actuation. It must not add linear lift.

Head-leading remains a pose cue, not a head-centered physics pivot. A body flip affects
the scooter assembly once; a Bri or Inward changes its relative movement once.

### 2.3 The supported path contributes more than a wheel tangent

**Source-derived — [R] §07.** For a supported center at `s + h*n`, velocity includes
changes in support position, posture offset and normal. The source's simplified
normal-reaction formula uses the appropriate center-of-mass path and explicitly
excludes richer posture/multiple-contact terms.

**Implementation consequence.** Do not detach the rider by replacing all existing
velocity with a generic world-up vector or one wheel-path tangent. First identify what
the current root actually represents and how its offset moves. Keep source caveats:
wheel path radius, deck elevation and total-system COM rise are not interchangeable.
Do not double-apply velocity/impulse terms the actual solver already contains.

### 2.4 Two different collision faults need different evidence

**Source-derived — [R] §§06, 09-10, S08-S12.** False internal-edge normals and early
speculative contacts are distinct possible mechanisms. A thin/overlapping lip,
a too-large compound hull, stale supported state and a self-collider are additional
hypotheses, not interchangeable explanations.

**Implementation consequence.** For the charged box, compare identical approach
traces and capture the FIRST divergent input/state/contact. Record actual collider
pairs, feature IDs where supported, signed gaps, pre-impact velocities, prediction
distance or time of impact, and every launch writer. Do not disable prediction or
all coping collision merely because one of those hypotheses sounds plausible.

### 2.5 A clear final pose is insufficient for a rotating scooter

**Source-derived — [R] §§15, 17-18.** A fixed-orientation linear shape query does not
necessarily sweep the rotation/articulation of the scooter. Engine body CCD, scene
queries and manually assigned kinematic targets have different responsibilities.
CCD cannot rescue an endpoint already placed inside the wood.

**Implementation consequence.** Audit the actual installed controller and query
capabilities. Validate capture/re-entry movement AND final pose, including wheel/deck
motion during spins and articulation. If the engine's query is insufficient, design
and test an appropriate bounded sweep/substep scheme rather than assuming a ray or
flag covers it. Do not silently change the global tick rate as a substitute for
correct collision handling.

A grind anchor is an attachment equation, not proof of whole-scooter clearance.
If `c` is a real surface contact and `a` the actual local anchor,
`p_root = c - R*a`; construct `c` from the rail shape correctly and do not add its
radius twice. Keep all other solid contacts valid throughout capture, lean, slide
and exit. Distinguish genuine far-side occlusion from signed geometric penetration.

### 2.6 Landing analysis must use pre-impact contact values

**Source-derived — [R] §§15-16, 22.** The point-relative velocity includes COM motion,
body angular velocity, relative equipment motion and surface movement. Post-solver
velocity may already have had the impact removed and is not evidence of a gentle
original landing.

**Implementation consequence.** Preserve pre-impact data before response. Consider
actual axle/wheel-plane alignment and catch state, and allow sequential wheel contact.
A selected ramp target does not permit bypassing an earlier coping strike. The
receiving surface is finite and curved, not an infinite landing plane.

A clean return near coping remains a key acceptance target. It is not a demand to
put the rear wheel at an identical fixed world-space point in every legitimate air,
fakie return or single-wheel catch. Good lower-transition returns remain valid.

### 2.7 Multi-turn history is mandatory, and normal airs are a negative control

**Source-derived — [R] §§11-13, 25.** Endpoint quaternions cannot distinguish zero,
one and two complete turns. Ordinary transition following already rotates the rig;
that must not become a false flip. Coupled flairs are not two unrelated global Euler
animations performed serially.

**Implementation consequence.** Record observed motion, intended continuation and
recognition separately. Document handedness, active/passive rotation convention and
multiplication order. Test inversion and both spin signs. Do not equate accumulated
absolute angular travel with a completed maneuver; verify its actual inversion/turn
sequence and contact context. The requested trick label is not an independent oracle.

### 2.8 Assistance gets an explicit budget, not another magnet constant

**Source-derived — [R] §§16, 23.** Start diagnosis with translational assistance
disabled. Match prediction to the runtime integration model. Permit only justified,
bounded guidance, with reachability, intent, whole-assembly clearance and override.

**Implementation consequence.** Report linear acceleration, total velocity change,
displacement and energy contribution; report angular intervention independently.
Local orientation error can correct a nearly completed landing, but cannot choose or
unwind the player's intended number of flips. Continued input can keep a double alive.
Do not silently force a return onto the platform because it is easier to align with.

This is not a withdrawal of the owner's gentle-assist request. It separates an honest
unassisted baseline from the later assisted production feel.

## 3. What the research does NOT establish

[R] is an engineering blueprint with scoped supporting research, not current game
source, a tested patch, a scooter motion-capture dataset or another game's source code.
It explicitly states these limits in §§02, 29-32.

The listed papers support principles. The report's study summaries and bibliography
are supplied evidence; their original web pages were not independently reopened for
this integration. API availability still depends on installed dependencies.

The 5.5 m/s example, gravity baseline and other example values are not observations
of this game. The plot in the supplied PDF, page 6, illustrates lateral drift for
assumed launches; it is not athlete trajectory evidence.

The 0.10-second input buffer, 0.08-0.15-second confirmation interval, numerical
penetration alert and render-comparison thresholds are provisional review seeds.
Do not implement them as universal safe scooter limits or silently widen them to
claim success.

The five V01-V05 tutorial links in the new research remain a footage backlog. Their
presence in a bibliography is not proof that the motion was watched or measured.
The earlier JPG sequence pack is a separate supplied-footage source with its own
encoded-playback provenance. Neither establishes real-time 3D measurements without
calibration.

**Missing supplemental source files.** The research refers to `reference_math_checks.py`
and `figures/ballistic_drift.png`. Neither was supplied as a separate file in these five
uploads. The figure is visible in the supplied PDF, but no separately delivered PNG
is fabricated here. The original MD remains unchanged. The claim of ten passing math
checks remains the source author's report; the missing original script was not rerun.
No game scenario has been executed in this integration.

## 4. Explicitly retained product behavior / ambiguity resolutions

These are [P]/[I] clarifications, not newly researched laws of motion.

**Direct RS takeoff.** The source's buffered launch logic must preserve the owner's
Pro-style RS Bri/Inward auto-pop. Do not interpret an aerial-trick eligibility check
as requiring a separate manual bunny hop. Accepted preload survives leaving RS-down
to draw the scoop. Starting a valid trick should not create a pre-lip bail.

**Low attempts.** The source allows incomplete motion or a reasoned start rejection.
Use rejection for an actually blocked/ineligible/expired action, not a blanket
forecast-based refusal that removes the owner's responsive low-attempt behavior.
Once an eligible trick begins, it stays continuous; real insufficient clearance may
cause a bail. An uncharged attempt may still succeed when the ramp provides enough air.

**Mid-trick body flips.** Explicitly preserve Inward -> Frontflip and Bri -> Backflip,
including diagonal spins, with LT+RT+LS after takeoff. This uses the source's explicit
hybrid gameplay authority. It does not reset the scooter phase or add a linear jump.

**Manual/grind transitions.** Preserve gentle held-RS manual/nose-manual catches,
subtle LS grind balance, and RS pop/trick exits. Do not declare every first-wheel
contact Sketchy or force it into an upright two-wheel landing. Maintain the current
combo policy: a continuing manual/grind need not prematurely bank the whole combo,
but any actual confirmed result is emitted only once.

**Flair naming.** The primary researched contract/test here is the quarter-pipe
backflip-plus-180 Flair and its Front Flair counterpart. Earlier requests also used
broader naming aliases. Keep those aliases outside this repair's scope rather than
silently deleting them. Never let a naming choice force an automatic 180 or landing.

**Maps/onboarding.** “Veterans Memorial Park is the main/default park” must not erase
an already implemented new-account, on-foot Techno Gravity first-scooter introduction.
That account flow and the existing first-person mode are protected regressions, not
new work in this physics patch.

**Griptape.** Keep Grip Tape separate from handlebar grips. Both rideable families
need deck-specific fit, holes/hardware exclusions, consistent preview/equipped views,
old-save default black tape, isolated materials and ownership persistence. Keep shoe
contact, wheel traction and deck/peg grind friction separate. A paid graphic does not
change these physical properties or glue feet to a released trick deck. See [R] §§19-20.

## 5. Six explicit supplemental acceptance specifications

The 47 source scenarios already provide broad coverage. These six expose owner
requirements that were otherwise buried in broad regression rows. They do not replace
or weaken any source test.

| ID | Explicit additional scenario | Why it is named separately |
|---|---|---|
| B07 | Charged/direct RS Bri from the big-box lip | Preserves charge through gesture; prevents half-motion/reset and extra-hop requirement. |
| B08 | Charged/direct RS Inward from the same lip | Exercises the distinct Inward path rather than assuming Bri coverage proves both. |
| R11 | Inward already active, then Frontflip | Verifies accepted late body control without equipment reset or second launch. |
| R12 | Bri already active, then Backflip | Verifies the other sign/path, controlled continuation and doubles. |
| L07 | Completed trick into Manual/Nose Manual | Protects held gentle-RS intent and valid sequential/single-wheel contact. |
| G06 | Ledge lean followed by RS pop/trick exit | Protects clearance under pose changes and avoids same-rail recapture trapping. |

Each has a concrete expected outcome, assertions to implement, negative/variant
fixtures, an independent-observation requirement and empty evidence fields. All remain
NOT_RUN. There are **53 scenario specifications, not 53 passed tests**. A scenario may
need multiple executions for its variants; report actual coverage, not a misleading
single count. Preserve the original pairwise-coverage policy.

## 6. How the plan changes the first Claude run

Adopt [R]'s order: **M0 audit -> M1 baseline quarter/halfpipe + charged box -> M2
contact/grind integrity -> M3 rotation/catches -> M4 bounded assistance -> M5 tape
integration/regressions.** The earlier emphasis on immediate grind repair remains a
release requirement, but it must not displace the first playable quarter-air goal.

A focused initial run should show the production engine/source map, reproduce the
charged-box and penetrating-grind failures, and repair a plain same-wall air plus a
feasible charged-box trick. Full test infrastructure for all 53 scenarios is not a
prerequisite to beginning the first targeted fix. Bind the relevant cases first and
report the remainder as NOT_RUN.

Canonical test shapes isolate causes; production shapes prove the owner's map was
actually repaired. Passing a simplified quarter is not sufficient if the actual
Veterans Memorial Park coping still blocks takeoff. Include both.

One integrator owns motion/contact interfaces. Parallel geometry, rig, grind and tape
work begins after those interfaces are agreed, not with each agent redefining AIR.
Independent review means reviewing evidence or tests separately from the fix; it does
not require an unavailable multi-agent tool.

The final grade is two-part: technical invariants and controller feel. Visual continuity,
readable rotation, smooth quarter flow and responsive commands require actual motion
review/playtesting as well as numeric assertions. Do not label an automated replay as
a human controller test.
