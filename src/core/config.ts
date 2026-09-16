export const TUNE = {
  flipAcceleration: 16,
  flipMaxRate: 6.8,
  flipSlowRate: 1.8,
  flipTakeoffContribution: .5,
  flipReleaseDamping: 1.8,
  flipYawRateScale: 0.8,
  flipNameTolerance: 20,
  fastplantContactTime: 0.18,
  fastplantChordWindow: 0.09,
  fastplantMinAirtime: 0.8,
  rampTrickPopMin: 2.1,
  rampTrickPopCharge: 2.6,
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
  // Begin clearing coping before the rider reaches its collision capsule.
  // A wider handoff keeps a smooth transition at real riding speeds.
  transitionLipReleaseDistance: 0.65,
  transitionRailClearTime: 0.18,
  quarterOverDeckSpeed: 12,
  // Outward travel off a quarter lip, as a fraction of the plane speed applied
  // along the lip's own forward direction. Negative leans back over the deck.
  // These bound the takeoff RATIO, which is why a correction here shortens the
  // outward throw without touching launch height or gravity.
  quarterRolloutRatioMin: -0.035, // unchanged: slow rollouts already left the lip correctly
  quarterRolloutRatioMax: 0.14,
  quarterRolloutSpeedGain: 0.022,
  quarterLeanRatio: 0.06,
  // No tangent-sampling correction is needed here: outdoorLip already derives
  // `forward` from the module's authored lip rotation rather than sampling the
  // terrain further down the transition, so the takeoff direction was correct
  // and only the outward/upward split above was wrong.
  reentryCaptureStrength: 0.24,
  // --- Bounded upper-transition re-entry assist -----------------------------
  // Transition-relative, not a world-space sphere: the rider must be descending
  // toward the receiving surface, close to it, and roughly aligned with it.
  reentryMaxGap: 0.46, // predicted wheel contact must be within this of the surface
  reentryMinGap: -0.18,
  reentryYawTolerance: 0.78,
  reentryPitchTolerance: 0.95,
  // "Below the coping" needs no separate depth: the assist requires a real
  // curved transition surface under the wheels within the gap band, and that
  // surface only exists inside/below the coping in the first place.
  reentryMaxCorrection: 2.4, // hard ceiling on the normal-direction correction (m/s)
  reentryOvershootSpeed: 1.2, // clearly travelling away from the surface: no assist
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
  maxSpeed: 12,
  rollingDrag: 0.1,
  crouchFastDragMultiplier: 0.72,
  crouchDownhillGain: 0.5,
  brake: 7.5,
  copingStallBrake: 11,
  copingStallSettleSpeed: 2.7,
  steering: 2.7,
  carveGrip: 8,
  steeringResponse: 8,
  airAcceleration: 24,
  airMaxSpin: 12,
  airDamping: 0.48,
  fakieMinSpeed: 0.8,
  fakieRevertThreshold: 0.68,
  fakieRevertHold: 0.12,
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
  grindLateralSpring: 28,
  grindLateralDamping: 9,
  grindSteering: 1.1,
  fakiePointsPerSecond: 30,
  fakieEntryPoints: 50,
  rotationPointsPer180: 100,
  deckTurnPoints: 150,
  barTurnPoints: 100,
  bodyTrickPoints: 100,
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
  grindExactDistance: 0.055,
  grindNaturalIntentScore: 0.63,
  grindHeldIntentScore: 0.6,
  grindStrength: 48,
  grindMinSpeed: 1.5,
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
  runSpeed: 6.4,
  runMountBoost: 0.9,
  trickHoldDelay: 0.18,
  bumperHoldThreshold: 0.18,
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
