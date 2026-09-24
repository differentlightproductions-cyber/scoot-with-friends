import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyInput } from "../src/input/input";
import { Tricks } from "../src/tricks/tricks";
import { Events } from "../src/core/events";
import { clampGrabHand, frontFoot, pushFoot, sideIndex } from "../src/core/stance";
import { TAU } from "../src/core/config";

const dt = 1 / 120;
const air = (stance: "regular" | "goofy" = "regular") => {
  const t = new Tricks(new Events());
  t.stance = stance;
  t.startAir(false);
  return t;
};
const step = (t: Tricks, seconds: number, tweak: (i: ReturnType<typeof emptyInput>) => void = () => {}) => {
  for (let n = 0; n < seconds * 120; n++) {
    const i = emptyInput();
    tweak(i);
    t.input(dt, i);
  }
};
const press = (t: Tricks, tweak: (i: ReturnType<typeof emptyInput>) => void) => {
  const i = emptyInput();
  tweak(i);
  t.input(dt, i);
};

test("stance helpers: regular pushes with the right foot, goofy with the left; index 0 is the rider's right (-x)", () => {
  assert.equal(frontFoot("regular"), "left");
  assert.equal(pushFoot("regular"), "right");
  assert.equal(frontFoot("goofy"), "right");
  assert.equal(pushFoot("goofy"), "left");
  assert.equal(sideIndex("right"), 0);
  assert.equal(sideIndex("left"), 1);
  assert.equal(clampGrabHand("regular"), "right");
  assert.equal(clampGrabHand("goofy"), "left");
});

for (const stance of ["regular", "goofy"] as const) {
  test(`Clamp Grab: RT + RB holds it in ${stance} stance, release returns the hand, same buttons`, () => {
    const t = air(stance);
    const chord = (i: ReturnType<typeof emptyInput>) => {
      i.held.pumpGrind = 1;
      i.held.rightModifier = 1;
    };
    step(t, 0.5, chord);
    assert.equal(t.visualPose, "Clamp Grab");
    assert.ok(t.poseBlend > 0.95, `reaches the clamp (${t.poseBlend})`);
    // Holding keeps holding.
    step(t, 0.6, chord);
    assert.equal(t.visualPose, "Clamp Grab");
    assert.ok(t.poseBlend > 0.95);
    // The grab is named like any other body trick.
    assert.ok(t.body.has("Clamp Grab"));
    // Releasing eases the hand back rather than snapping.
    step(t, 0.03);
    assert.ok(t.poseBlend < 0.95 && t.poseBlend > 0.3, `mid-return blend ${t.poseBlend}`);
    step(t, 0.4);
    assert.equal(t.poseBlend, 0);
    assert.equal(t.visualPose, "");
    // Barspin and deck whip never got triggered by a grab.
    assert.equal(t.bars.target, 0);
    assert.equal(t.deck.target, 0);
    assert.equal(t.decade.target, 0);
  });
}

test("Clamp Grab lets go shortly before landing so the hand is back on the bar", () => {
  const t = air();
  const chord = (i: ReturnType<typeof emptyInput>) => {
    i.held.pumpGrind = 1;
    i.held.rightModifier = 1;
  };
  step(t, 0.4, chord);
  assert.ok(t.poseBlend > 0.95);
  t.landingIn = 0.1;
  step(t, 0.2, chord);
  assert.ok(t.poseBlend < 0.15, `released by touchdown (${t.poseBlend})`);
});

test("Clamp Grab is named alongside body rotation and flips", () => {
  const t = air();
  const chord = (i: ReturnType<typeof emptyInput>) => {
    i.held.pumpGrind = 1;
    i.held.rightModifier = 1;
  };
  t.yaw = Math.PI;
  step(t, 0.4, chord);
  const spin = t.attempt;
  assert.match(spin?.name ?? "", /180° Clamp Grab/);
  t.yaw = 0;
  t.flip = -TAU;
  assert.equal(t.attempt?.name, "Backflip + Clamp Grab");
});

test("Clamp Grab does not steal the hands from a bar spin or a finger whip", () => {
  const t = air();
  // B starts a barspin first; RT + RB afterwards must not pull a hand off the bars.
  press(t, i => {
    i.held.brakeBars = 1;
    i.pressed.brakeBars = true;
  });
  step(t, 0.05, i => {
    i.held.pumpGrind = 1;
    i.held.rightModifier = 1;
  });
  assert.equal(t.visualPose, "");
});

test("Decade: one full revolution, through START / ACTIVE / CATCH / CAUGHT, and it is named Decade", () => {
  const t = air("regular");
  assert.equal(t.decadePhase, "idle");
  assert.ok(t.startDecade());
  assert.equal(t.startDecade(), false, "only one Decade per air");
  const phases = new Set<string>();
  for (let n = 0; n < 300; n++) {
    t.input(dt, emptyInput());
    phases.add(t.decadePhase);
    if (t.decadePhase === "caught") break;
  }
  assert.ok(phases.has("active") && phases.has("catch") && phases.has("caught"), [...phases].join());
  assert.ok(Math.abs(Math.abs(t.decade.angle) - TAU) < 1e-6);
  assert.equal(t.decadeCompleted, 1);
  // The deck did not whip and the bars did not spin: it is a rider revolution.
  assert.equal(t.deck.target, 0);
  assert.equal(t.bars.target, 0);
  assert.equal(t.attempt?.name, "Decade");
  t.finish("clean");
  assert.equal(t.last, "Decade");
  assert.equal(t.history.at(-1)?.raw.decadeTurns, -1);
});

test("Decade mirrors between Regular and Goofy", () => {
  const regular = air("regular"),
    goofy = air("goofy");
  regular.startDecade();
  goofy.startDecade();
  step(regular, 0.2);
  step(goofy, 0.2);
  assert.ok(regular.decade.angle * goofy.decade.angle < 0, "opposite directions");
  assert.ok(Math.abs(regular.decade.angle + goofy.decade.angle) < 1e-6, "exact mirror images");
});

test("Decade composes with body rotation: 180 + Decade and Backflip + Decade", () => {
  const t = air();
  t.yaw = Math.PI;
  t.startDecade();
  step(t, 0.9);
  assert.equal(t.attempt?.name, "180° Decade");
  t.yaw = 0;
  t.flip = -TAU;
  assert.equal(t.attempt?.name, "Backflip + Decade");
});

/** A quick LB tap: pressed, held a few frames, released. */
const tapLB = (t: Tricks, frames = 10, extra: (i: ReturnType<typeof emptyInput>) => void = () => {}) => {
  press(t, i => {
    i.pressed.leftModifier = true;
    i.held.leftModifier = 1;
    extra(i);
  });
  for (let n = 1; n < frames; n++)
    press(t, i => {
      i.held.leftModifier = 1;
      extra(i);
    });
  press(t, i => {
    i.released.leftModifier = true;
  });
};

for (const stance of ["regular", "goofy"] as const)
  for (const style of ["pro", "arcade"] as const)
    test(`Decade is a tap of LB in the air: ${stance} ${style}`, () => {
      const t = air(stance);
      t.controlStyle = style;
      tapLB(t);
      assert.notEqual(t.decade.target, 0, "LB tap starts the Decade");
      assert.equal(t.deck.target, 0, "no tailwhip rides along with it");
      assert.equal(t.bars.target, 0);
    });

test("A no longer starts a Decade, and LB on its own does nothing until released", () => {
  const t = air("regular");
  press(t, i => {
    i.pressed.hop = true;
    i.held.hop = 1;
  });
  assert.equal(t.decade.target, 0, "A in the air is not the Decade");
  const h = air();
  press(h, i => {
    i.pressed.leftModifier = true;
    i.held.leftModifier = 1;
  });
  assert.equal(h.decade.target, 0, "waits for the release");
});

test("LB used as a modifier or held long is not a Decade", () => {
  // LB + Y is a Can Can.
  const canCan = air();
  tapLB(canCan, 30, i => (i.held.body = 1));
  assert.equal(canCan.decade.target, 0);
  assert.equal(canCan.visualPose, "Can Can");
  // LB + RB + Y is a No Foot.
  const noFoot = air();
  tapLB(noFoot, 30, i => {
    i.held.body = 1;
    i.held.rightModifier = 1;
  });
  assert.equal(noFoot.decade.target, 0);
  // A long hold is a modifier the player changed their mind about.
  const held = air();
  tapLB(held, 60);
  assert.equal(held.decade.target, 0);
});

test("Decade never shares an air with a Bri, Inward or Kickless", () => {
  // A Bri already turning blocks the Decade.
  const bri = air();
  bri.bri.kick(1);
  step(bri, 0.1);
  tapLB(bri);
  assert.equal(bri.decade.target, 0, "no Decade over a Bri");
  // An Inward (the other direction) too.
  const inward = air();
  inward.bri.kick(-1);
  step(inward, 0.1);
  assert.equal(inward.startDecade(), false, "no Decade over an Inward");
  // Even a finished Bri owns the air.
  const done = air();
  done.bri.kick(1);
  step(done, 1.5);
  assert.equal(done.startDecade(), false, "no Decade after a Bri in the same air");
  // A Bri/Inward takeoff still waiting to kick in blocks it as well.
  const pending = air();
  pending.briPending = true;
  assert.equal(pending.startDecade(), false);
  // Kickless.
  const kickless = air();
  kickless.kickless.kick(1);
  assert.equal(kickless.startDecade(), false, "no Decade over a Kickless");
  // And the other way: a Bri scoop during a Decade is ignored.
  const scoop = (t: Tricks) => {
    for (const [rx, ry] of [[0, 1], [-0.7, 0.7], [-1, 0]])
      for (let n = 0; n < 3; n++)
        press(t, i => {
          i.rx = rx;
          i.ry = ry;
        });
    step(t, 0.3);
  };
  const control = air();
  scoop(control);
  assert.notEqual(control.bri.target, 0, "the scoop is a Bri on its own");
  const decade = air();
  decade.startDecade();
  scoop(decade);
  assert.equal(decade.bri.target, 0, "no Bri over a Decade");
});

test("Decade is paced to the air left: slow and natural in big air, never whip-fast", () => {
  const time = (landingIn: number) => {
    const t = air();
    t.landingIn = landingIn;
    t.startDecade();
    let n = 0;
    while (t.decadePhase !== "caught" && n < 400) {
      t.input(dt, emptyInput());
      n++;
    }
    return n * dt;
  };
  const big = time(99),
    small = time(0.5),
    medium = time(0.9);
  assert.ok(big > 1.0 && big < 1.15, `big air ${big.toFixed(3)} s`);
  assert.ok(small > 0.68 && small < 0.8, `small air still slower than a whip: ${small.toFixed(3)} s`);
  assert.ok(medium > 0.75 && medium < 0.9, `fits the air: ${medium.toFixed(3)} s`);
});

test("A Decade cut short by landing is not credited and fails the landing check", () => {
  const t = air();
  t.startDecade();
  step(t, 0.5);
  assert.ok(t.decade.mismatch > 1, `mid-orbit mismatch ${t.decade.mismatch}`);
  assert.equal(t.decadeCompleted, 0);
  assert.ok(t.decadePhase === "active" || t.decadePhase === "catch");
});

test("Decade blocks whips and bar spins while the rider is orbiting, and waits for a free deck", () => {
  const t = air();
  t.startDecade();
  press(t, i => {
    i.pressed.brakeBars = true;
    i.held.brakeBars = 1;
  });
  assert.equal(t.bars.target, 0);
  const w = air();
  press(w, i => {
    i.pressed.pushDeck = true;
    i.held.pushDeck = 1;
  });
  assert.notEqual(w.deck.target, 0, "a normal whip starts");
  assert.equal(w.startDecade(), false, "but not a Decade on top of it");
});
