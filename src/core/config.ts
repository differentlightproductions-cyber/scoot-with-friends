export const TUNE = {
  // A backflip over a ~1 s air needs close to 7 rad/s average; the old 6.8 cap
  // left quick flips at about 270 degrees.
  flipAcceleration: 20,
  flipMaxRate: 9,
  flipSlowRate: 1.8,
  flipTakeoffContribution: .5,
  // Counter LS opens the rider against the rotation: rad/s^2 at full stick.
  flipBrakeAcceleration: 14,
  flipYawRateScale: 0.8,
  flipNameTolerance: 20,
  // --- Flip intent and landing guidance -----------------------------------
  // A flip is one revolution unless strong LS is still held this far round a
  // revolution, which commits to another. When the player is not driving or
  // braking, guidance carries the rotation to that upright relative to the
  // landing surface, finishing flipFinishLead before contact, then holds it.
  // It never unwinds a rotation and never exceeds flipMaxRate.
  flipAssistInput: 0.35, // above this LS the player is driving (or braking)
  flipDoubleCommit: 1, // strong input still held as a revolution completes commits to another
  flipFinishLead: 0.12, // s before predicted contact the rotation should be done
  flipGuideMinRate: 2.4, // rad/s: a relaxed flip keeps at least this pace until done
  flipGuideAcceleration: 20, // rad/s^2 fastest guided speed-up
  flipOpenAcceleration: 10, // rad/s^2 fastest opening-up slow-down
  flipCatchOvershoot: 0.45,
  // Released spin stick: carry the spin to the next half turn from takeoff
  // (180, 360, ...) just before contact, or stop if only slightly past one.
  spinGuideMinRate: 3, // rad/s
  spinGuideAcceleration: 18, // rad/s^2
  spinGuideOvershoot: 0.35, // rad
  spinFinishLead: 0.1, // s
  // Crooked landing: the wheels take the line. Velocity turns onto the scooter's
  // axis; at the fail angle this keeps crookedKeepAtFail of the speed.
  crookedKeepAtFail: 0.62,
  crookedPivot: 0.25, // fraction of the angle the rider pivots into their travel
  // Fakie at speed: above this fraction of pushMaxSpeed a fakie ride wobbles and
  // must be held steady with LS.
  fakieWobbleSpeedRatio: 0.8,
  fakieWobbleGrowth: 20, // 1/s^2 instability of the wobble
  fakieWobbleKick: 6, // disturbance strength at pushMaxSpeed
  fakieWobbleControl: 7, // LS correction strength
  fastplantContactTime: 0.18,
  fastplantChordWindow: 0.09,
  fastplantMinAirtime: 0.8,
  /** The plant's kick off flat ground (m/s up): about 1.3 m and 0.83 s of air, room for a fastplant flip (#84). */
  fastplantPop: 6.2,
  /** Pro Goofy (A whips): RT + A arms a Fastplant only this close to touchdown (s). */
  fastplantLateArm: 0.3,
  // A pop on a ramp adds a leg extension's worth of HEIGHT to the air the ramp
  // already gives, not a fixed speed: the same 4.7 m/s on top of a fast lip
  // launch roughly doubled the air and sent riders several metres up.
  rampTrickPopHeight: 0.25, // m, uncharged
  rampTrickPopChargeHeight: 0.5, // m more at full charge
  // Box lips send the rider up and over a deck, so a pop there needs room for a
  // trick: 0.5 m uncharged up to 1.8 m at full charge (about 4.5 m of air off
  // the big box at 12 m/s, against 3 m with the quarter-pipe values).
  boxTrickPopHeight: 0.5,
  boxTrickPopChargeHeight: 1.3,
  // --- Bri / Inward direct RS takeoff --------------------------------------
  // Charge accumulates while RS is held deep and is CAPTURED when the scoop
  // gesture is accepted, so tracing the gesture cannot throw the preload away.
  briFullChargeTime: 0.9, // full charge at roughly one second; partial charge is useful before that
  briMinCharge: 0.15, // an uncharged flick still attempts, with the small pop it earned
  briChargeHold: 0.35, // captured charge stays valid this long while the gesture resolves
  // A trick timeline owns itself until the scooter has actually come back
  // round. Below this progress the catch pose is not reachable and a contact is
  // an incomplete trick, not a completed one.
  briCatchProgress: 0.82,
  briTakeoffGrace: 0.12, // ignore stale support contacts this long after a valid upward takeoff
  boxTrickForwardRatio: 0.48,
  // A transition releases the rider at its lip. The rider's centre rides one
  // radius off the wall, about 0.22 m inside the lip line at the top, so this is
  // where the wheels reach the coping. It was 0.65, which on the steep top of a
  // quarter launched every air more than a metre below the coping.
  transitionLipReleaseDistance: 0.26,
  // During a quarter air the coping stays clear of the rail guard while the
  // rider is within this far inside the lip, or this far out over the deck.
  quarterAirClearInside: 1.2,
  quarterAirClearOutside: 0.6,
  // Outside a quarter, the scooter eases onto the receiving surface's angle
  // over this long before contact.
  airLandingAlignTime: 0.35,
  airPitchLimit: 1.45,
  // Box and spine launches are guided onto their landing by easing the takeoff
  // angle, never the speed. Corrections up to launchGuideFull apply in full,
  // fade out by launchGuideMax, and anything larger is left alone.
  launchGuideFull: 0.14, // about 8 degrees
  launchGuideMax: 0.26, // about 15 degrees
  launchGuideReach: 14,
  launchGuideLipClear: 0.35,
  touchdownGap: 0.02,
  transitionRailClearTime: 0.18,
  // After a quarter-air re-entry the rear wheel sits just under the coping and
  // the coarse upper rail guard still overlaps it while the rider rolls away.
  quarterReentryClearTime: 0.25,
  quarterOverDeckSpeed: 12,
  // Outward travel off a quarter lip, as a fraction of the plane speed applied
  // along the lip's own forward direction. Negative leans back over the deck.
  // These bound the takeoff RATIO, which is why a correction here shortens the
  // outward throw without touching launch height or gravity.
  // At normal speed a quarter air goes straight up and comes straight back down
  // onto the wall just under the coping. Only speed beyond the normal band
  // throws the rider outward toward the deck.
  quarterRolloutRatioMin: 0,
  quarterRolloutRatioMax: 0.14,
  quarterRolloutSpeedGain: 0.022,
  quarterLeanRatio: 0.06,
  // Forward lean (LS up) at a quarter lip carries the rider out onto the deck: a
  // deliberate platform exit. Its own cap, since the plain-air cap is sized to
  // keep an unleaned rider returning to the wall.
  quarterDeckLeanRatio: 0.26,
  // No tangent-sampling correction is needed here: outdoorLip already derives
  // `forward` from the module's authored lip rotation rather than sampling the
  // terrain further down the transition, so the takeoff direction was correct
  // and only the outward/upward split above was wrong.

  caseHardImpact: 8.2,
  step: 1 / 120,
  markerHoldDuration: 0.75,
  airWeightShiftStrength: 0.29,
  airWeightShiftResponse: 8,
  airPitchBiasMax: 0.88,
  airPitchBiasAcceleration: 18,
  airPitchBiasSpeed: 3.2,
  airTrajectoryInfluence: 0.3,
  airTrajectoryBudget: 0.4,
  airWeightRecentering: 4,
  airEntryPitchDecay: 1.1,
  rampLaunchLeanAngle: 0.85,
  gravity: 15,
  radius: 0.22,
  push: 2.5,
  pushCadence: 0.46,
  pushHoldDelay: 0.17,
  // --- Scooter speed: one documented source of truth ------------------------
  // All values are metres per second in simulation units; only the HUD converts.
  // Measured on the flat lakeside trail BEFORE this change, pushing repeatedly
  // at the push cadence: 2.45 / 4.39 / 5.93 / 7.14 / 8.10 rising to an asymptote
  // of 11.31 after 40 pushes, exactly repeatable across runs. Coasting lost
  // 0.1 m/s per second (rolling drag is a constant deceleration, not
  // proportional). The ceiling is set by the push contribution falling to zero
  // at pushMaxSpeed, so that constant IS the usable pushing maximum.
  //
  // Three separate limits, as they are three different things:
  //   pushMaxSpeed    - what pushing alone can reach on the flat
  //   extremeSpeed    - a protective ceiling on runaway horizontal travel
  //   (descent)       - gravity-earned speed is deliberately NOT capped by a
  //                     third constant; it is limited by drag against slope, so
  //                     a legitimate downhill run is never abruptly erased.
  pushMaxSpeed: 14.6, // +22% over the previous 12; see CHECKPOINT-1.md
  extremeSpeed: 36, // B Hill's steepest tucked sections now settle around 33-35 m/s
  extremeSpeedResponse: 2.4, // how quickly travel eases back under the ceiling
  mountSpeedCap: 8.6, // unchanged in effect: was maxSpeed(12) * 0.72
  // --- Jump-on mounting -----------------------------------------------------
  // Deliberate and two-step: A jumps on foot, then Y places the carried scooter
  // under the rider's feet while they are still in the air. Jumping alone never
  // releases the scooter. The deck follows the rider down and the mount
  // completes on touchdown, unless the landing spot is obstructed.
  jumpOnWindow: 1.6, // seconds a placed deck waits for the rider to land
  jumpOnCaptureHeight: 0.16, // feet-to-deck gap at which touchdown counts
  jumpOnPullTime: 0.22, // seconds the hands take to pull the deck up under the feet
  jumpOnRunSpeed: 3.4, // committed running approach, above a standing hop
  jumpOnBoost: 2.3, // bounded extra carried into riding, applied once
  jumpOnRearm: 0.45, // a fresh on-foot approach and jump is required each time
  // --- Sometimes Summer longboard ------------------------------------------
  // Lean steers the trucks; curvature falls with speed so fast riding is
  // steady. Speed is lost to rolling, air, the foot brake and slides; a tuck
  // only lowers air resistance and pushing eases off toward its ceiling.
  boardLeanResponse: 5,
  boardTuckResponse: 5,
  boardMaxCurvature: 0.34, // about a 2.9 m radius at walking pace
  boardCarveAccel: 7.5, // sideways acceleration a full lean holds cruising (about 0.75 g)
  boardRaceCarveAccel: 16, // and bombing a hill (#87): a scooter's corner speed on B Hill
  boardCarveScrub: 0.03,
  boardPivotSpeed: 1.2,
  boardPivotRate: 1.4,
  boardGrip: 10,
  boardRollingDrag: 0.05,
  // #87: a longboard is the faster downhill racer. Standing up, air settles
  // near 12 m/s on a 6% grade and 20 m/s on B Hill's 16% sections; a tuck
  // lets it run on to about 36 m/s there.
  boardAero: 0.0036,
  boardTuckAero: 0.0011,
  boardTuckCalm: 0.5, // a committed tuck damps this much of the steering that feeds speed wobble
  boardWobbleOnset: 3, // a board's long wheelbase starts to wobble this much faster than a scooter's bars
  boardFootBrake: 3.4,
  // Stamping the foot down above this speed throws the rider forward and the board runs on.
  boardFootBrakeCrashSpeed: 14,
  boardFootBrakeCrashHold: 0.2,
  boardSlideMinSpeed: 3.5,
  boardSlideSteer: 0.45,
  boardSlideAngle: 1.15, // about 66 degrees across the direction of travel
  boardSlideSwing: 9,
  boardSlideScrub: 3.2,
  boardPush: 1.6,
  boardPushMaxSpeed: 9.5,
  boardPushCadence: 0.7,
  boardLeanRoll: 0.2,
  // --- Steps and walls ------------------------------------------------------
  // A rise sharper than a curb, measured perpendicular to the surface the rider
  // was on, is a wall rather than a transition. Real transitions curve away from
  // their tangent by millimetres per tick; the side of a box does so by its full
  // height. A wall stops the rider, and a hard hit bails them.
  stepUpHeight: 0.16,
  // Ride height stays geometric up to this surface steepness (about 81 degrees,
  // the top of the tallest quarter).
  steepRideNormal: 0.15,
  wallBailSpeed: 5.5,
  // Curbs (#87): the wheels meet the face this far ahead of and behind the
  // rider's centre; a face this tall stops them; faster into it than this throws the rider.
  curbWheelReach: 0.32,
  curbFaceMin: 0.08,
  curbBailSpeed: 2.2,
  // Ice in a gutter (#87): the share of grip and braking it takes away, and the
  // speed above which a slide on it washes the front out.
  iceGripLoss: 0.8,
  iceWashOutSpeed: 5,
  wallWobbleSpeed: 1.5,
  rollingDrag: 0.1,
  fakieRollingDrag: 0.4, // extra wheel/deck scrub while coasting backward
  crouchFastDragMultiplier: 0.72,
  crouchDownhillGain: 0.5,
  brake: 7.5,
  copingStallBrake: 11,
  copingStallSettleSpeed: 2.7,
  steering: 2.7,
  carveGrip: 8,
  // Bombing a hill. None of these act at or below pushMaxSpeed, so riding a
  // park is unchanged; they only matter where gravity carries a rider past it.
  scooterAero: 0.0024, // air drag on the speed above pushMaxSpeed; a crouch trims it
  scooterGripAccel: 19, // sideways acceleration the tyres hold at bombing speed
  washOutSlip: 0.3, // slip angle (rad) at speed where the front can no longer be saved
  wobbleSpeed: 15, // below this no speed wobble builds
  wobbleFullSpeed: 26,
  wobbleRoll: 0.045, // visible shimmy at a full wobble (rad of rider roll, about 2.5 degrees)
  wobbleYaw: 0.25, // heading drift per second at a full wobble
  wobbleSteerRate: 3, // steering change per second that counts as a jerk
  wobbleGain: 0.8, // wobble per unit of outward steering jerk at full speed
  wobbleSlipGain: 3, // per second, per radian of tyre slip beyond a normal carve
  wobbleRoughGain: 0.55, // per second on loose ground at full speed
  wobbleDamping: 1.5, // how fast a wobble settles when the rider rides smoothly
  dirtDrag: 1.4, // extra rolling resistance off the pavement
  grassDrag: 1.1, // extra rolling resistance on a lawn (#46)
  sandDrag: 2.4, // extra rolling resistance in a ballfield's infield sand (#46)
  groundSurfaceHeight: 0.15, // lawns and infields only drag at ground level, not on a pad or ledge over them
  steeringResponse: 8,
  airAcceleration: 23,
  airMaxSpin: 11.4,
  airDamping: 0.48,
  fakieMinSpeed: 0.8,
  // A revert needs a firm, held LS push; ordinary fakie steering never triggers it.
  fakieRevertThreshold: 0.9,
  fakieRevertHold: 0.3,
  fakieRevertSpeed: 4.8,
  fakieRevertAcceleration: 18,
  lowAirSpinMultiplier: 0.82,
  highAirSpinMultiplier: 1,
  spinStickDeadzone: 0.025,
  spinResponseExponent: 1.35,
  spinCeilingExponent: 0.8,
  spinAccelerationFloor: 0.35,
  spinLowAirtime: 0.55,
  spinHighAirtime: 1.35,
  cameraMaxTurnRate: 3.4, // rad/s the chase heading may turn while following travel
  stationaryCameraFollowThreshold: 1.2,
  cameraFullFollowSpeed: 3,
  railImpactBailSpeed: 4.5,
  railImpactWobbleSpeed: 0.7,
  railCollisionImpulseScale: 0.22,
  railImpactCooldown: 0.45,
  rampLeanResponse: 9,
  rampLeanAngle: 0.28,
  rampLeanLookAhead: 1.1,
  rampLeanCenterOfMassDrop: 0.12,
  // Assist settles a committed grind, it never pulls a rider across a rail.
  grindSettleTime: 0.28,
  // Grind seat. A free-standing rail keeps the rider centre this far above the
  // rail line. On an edge pipe (Rail.solid) the scooter seats outboard of the
  // pipe with its deck edge on the pipe shoulder and the wheels and axle
  // hardware hanging clear, and rides over the pipe's round profile while it
  // settles there.
  grindCentreHeight: 0.14,
  grindPipeRadius: 0.045, // Park.rail pipe collider and mesh
  // Underside envelope of the manufactured scooter, measured from its meshes in
  // the scooter frame (ground = 0): [half width, lowest point]. Wheels, then
  // axle ends, dropouts and fork, then the deck plate.
  grindUnderside: [[0.0135, 0], [0.048, 0.033], [0.072, 0.0725]] as readonly (readonly [number, number])[],
  grindSeatOffset: 0.095, // pipe axis to scooter centreline: hardware half width + pipe radius
  grindEdgeMaxOffset: 0.11, // beyond this the deck edge leaves the pipe shoulder
  grindSeatClearance: 0.004,
  // A grind whose body is held back by something solid (moving along the rail at
  // under this fraction of the grind speed) releases after grindBlockedTime
  // instead of trapping the rider while the grind speed keeps building.
  grindBlockedRatio: 0.25,
  grindBlockedTime: 0.2, // ignore a brief joined-surface contact; a real obstruction still releases below the 0.3 s trap limit
  grindWheelReach: 0.34, // centre to wheel contact along the deck
  grindSeatResolve: 60, // 1/s: rise rate back out of a pipe, a contact resolution rather than a hop
  grindStancePitch: 0.2, // largest Smith/Feeble tilt kept from the entry, relative to the rail
  // Sliding off the pipe top onto the seat: critically damped, about 0.25 s.
  grindSeatSpring: 400,
  grindSeatDamping: 40,
  grindDeckHalfLength: 0.33, // pitch relative to the rail dips the deck ends by this lever
  grindMaxOffset: 0.16,
  grindLateralSpring: 28,
  grindLateralDamping: 9,
  grindSteering: 1.1,
  fakiePointsPerSecond: 30,
  fakieEntryPoints: 50,
  rotationPointsPer180: 100,
  deckTurnPoints: 150,
  barTurnPoints: 100,
  bodyTrickPoints: 100,
  // Holding a pose longer (#84): points per second past the first bodyHoldFree, capped at bodyHoldMax.
  bodyHoldPoints: 150,
  bodyHoldFree: 0.3,
  bodyHoldMax: 2.5,
  // A held hand grab: LS under this only leans the body; past it the push spins (rescaled).
  grabLeanStick: 0.55,
  decadePoints: 200,
  contactTrickPoints: 75,
  hopMin: 3.7,
  hopMax: 7.2,
  preloadTime: 0.48,
  coyoteTime: 0.09,
  hopBuffer: 0.12,
  deckAcceleration: 170,
  deckMaxSpeed: 21,
  barAcceleration: 220,
  barMaxSpeed: 26,
  // The rider's revolution around the scooter for a Decade: a whole body
  // swinging round the bars, far slower than a deck whip. Each Decade is paced
  // to the air left when it starts, finishing decadeCatchMargin seconds before
  // touchdown, but never faster than decadeFastest or slower than
  // decadeSlowest seconds per turn. A late start or a small hop still bails.
  // (Acceleration / max speed below are only the defaults before a start.)
  decadeAcceleration: 40,
  decadeMaxSpeed: 9,
  decadeFastest: 0.7,
  decadeSlowest: 1.05,
  decadeCatchMargin: 0.1,
  // A Decade caught this close (radians) to the full turn still counts.
  decadeCatchTolerance: 0.6,
  // --- Landing grades: PERFECT (internally "clean") / GOOD / SKETCHY / BAIL --
  // Every measurement is taken relative to the receiving surface, never world
  // up. Below the clean* limits is PERFECT; between clean* and good* is GOOD, a
  // genuinely successful landing; beyond good* is SKETCHY; beyond fail* is BAIL.
  cleanAngle: 0.3,
  goodAngle: 0.6,
  failAngle: 1.3,
  cleanImpact: 9.5,
  goodImpact: 13,
  failImpact: 16,
  cleanPartAngle: 0.32,
  goodPartAngle: 0.85,
  failPartAngle: 1.25,
  cleanPitchError: 0.45,
  goodPitchError: 0.85,
  cleanBodyError: 0.7,
  goodBodyError: 1.15,
  cleanSpinSpeed: 5,
  goodSpinSpeed: 8.5,
  cleanWeightError: 1.1,
  goodWeightError: 1.15,
  // One attempt already produces one grade without a separate assessment
  // window: land() runs only on the air -> supported edge (and only past a
  // minimum airtime), and scoring deduplicates by attempt id, so a second wheel
  // touching on a later tick cannot award again.
  sketchySpeedKeep: 0.86, // a sketchy ride-away still carries most of its speed
  goodSpeedKeep: 0.97,
  recoveryTime: 1.05,
  grindDistance: 0.18,
  grindIntentDistance: 0.22,
  grindCaptureHeight: 0.22,
  grindApproachAlignment: 0.86,
  grindIntentAlignment: 0.72,
  // Angled deck slides: with the deck turned across the rail the travel may meet
  // it at up to about 53 degrees (cos 0.6), within a little more lateral reach.
  grindSlideAlignment: 0.6,
  grindSlideReach: 0.08,
  grindExactDistance: 0.055,
  grindNaturalIntentScore: 0.63,
  grindHeldIntentScore: 0.6,
  grindStrength: 48,
  grindMinSpeed: 1.5,
  // Segments meeting within this distance, and continuing within ~45 degrees,
  // are one grindable run.
  grindJoinDistance: 0.05,
  grindJoinAlignment: 0.7,
  // A light RS flick while grinding hops in place over the same rail; a longer
  // load pops off it. LS weight during the hop picks the stance the rider lands
  // back in, so Feeble and Smith can be swapped mid-grind.
  grindHopCharge: 0.4,
  grindHopSpeed: 2.6,
  grindHopWindow: 0.7,
  grindHopStancePitch: 0.3,
  // Holding the stick toward the ramp while grinding coping turns the rider to
  // face the transition, then drops them back in.
  copingDropSteer: 0.55,
  copingDropHold: 0.1,
  copingDropTurnRate: 14,
  copingDropTurnTime: 0.24,
  copingDropPush: 1.4,
  copingDropCarry: 0.3,
  copingDropClearTime: 0.35,
  manualSensitivity: 2.8, // stick authority over balance acceleration
  manualStability: 1.7, // inverted-pendulum gain: how hard an existing lean runs away
  // The stick also gets a little direct rate authority. Without it the player
  // commands acceleration only, which reads as a delayed meter: two integrations
  // sit between the stick and the indicator. This is deliberately small — it
  // sharpens the response without making a manual self-correcting.
  manualRateAuthority: 1.25,
  manualNeutralHold: .32, // gentle-band position that commands zero balance change
  manualEntryBlend: 6, // how fast entry eases toward a usable starting balance
  manualDropLimit: -.55, // front/rear wheel comes back down
  manualLoopLimit: .85, // past the supporting wheel: loop out / over the bars
  walkSpeed: 3.2,
  /** On-foot traversal (A into an obstacle): vault anything this high or lower if it is thin, mantle up to mantleHeight, climb up to climbReach (hands on a head-high ledge). */
  vaultHeight: 1.05,
  mantleHeight: 1.35,
  climbReach: 2.05,
  /** Swimming (m/s): LS strokes, A held strokes harder; response is the water's drag on changes. */
  swimSpeed: 1.8,
  swimSprint: 2.9,
  swimResponse: 2.2,
  /** On-foot dive flip rotation (rad/s): one flip in about 0.7 s, inside a foot jump's air time. */
  diveFlipRate: 8.8,
  /** On-foot twist (LB / RB in the air, rad/s): a 360 in about 0.6 s. */
  diveTwistRate: 10.5,
  /** A foot jump off the dive dock's springboard launches this fast upward (m/s; a normal jump is 6): about twice the height. */
  springboardJump: 9,
  runSpeed: 6.4,
  runMountBoost: 0.9,
  trickHoldDelay: 0.18,
  bumperHoldThreshold: 0.18,
  /** A rewind bumper or Kickless flick a touch early in a whip is kept this long (s) for the window to open. */
  rewindBuffer: 0.3,
  walkAcceleration: 9,
  walkTurnResponse: 10,
  pumpGain: 1.5,
  pumpCooldown: 0.38,
  comboTimeout: 3,
  repetitionValues: [1, .75, .5, .35],
  comboStep: .25,
  comboCap: 4,
  firstSpinThreshold: 75,
  spinNameTolerance: 20,
  // --- RS ownership bands (applied to the already-deadzoned stick) ---------
  // One RS movement has exactly one owner. The gentle band positions a manual,
  // the deep band loads a pop, and the span between them is a transition that
  // belongs to neither: it neither charges a hop nor cancels a held manual.
  // Enter/hold pairs give hysteresis so ordinary stick drift near a boundary
  // cannot flip the owner back and forth frame to frame.
  manualMin: .15, // gentle band opens here; above the 0.15 deadzone, so drift alone cannot reach it
  manualMax: .55, // gentle band closes here
  manualHoldMin: .1, // once manualing/intending, keep intent down to here
  manualHoldMax: .62, // ...and up to here, overlapping the transition region
  manualLateral: .35, // |rx| allowed while establishing manual intent
  manualHoldLateral: .55, // |rx| tolerated once intent is established
  manualDwell: .07, // deliberate gentle movement responds promptly; not a long hold
  manualCatchWindow: .22, // gentle RS this recently still counts as catch intent at touchdown
  manualCatchPitchError: .8, // catch is refused beyond this pose error from the surface
  manualMinSpeed: .7,
  preloadThreshold: .65, // deep deliberate down: loads a pop
  preloadRelease: .55, // hysteresis floor once loading, so a loaded pop is not lost at the boundary
  rumble: { pop: 0.12, clean: 0.2, sketchy: 0.38, bail: 0.6 },
} as const;
export const TAU = Math.PI * 2;
export const clamp = (x: number, a: number, b: number) =>
  Math.max(a, Math.min(b, x));
export const damp = (a: number, b: number, k: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-k * dt));
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
