import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyInput } from "../src/input/input";
import { Tricks } from "../src/tricks/tricks";
import { Events } from "../src/core/events";
import { POSE_HANDS, poseAllowed } from "../src/tricks/hands";

type Frame = ReturnType<typeof emptyInput>;
const dt = 1 / 120;
const air = (stance: "regular" | "goofy" = "regular", style: "pro" | "arcade" = "pro") => {
  const t = new Tricks(new Events());
  t.stance = stance;
  t.controlStyle = style;
  t.startAir(false);
  return t;
};
/** One airborne frame per step (input() also steps the spin channels). */
const run = (t: Tricks, seconds: number, tweak: (i: Frame) => void = () => {}) => {
  for (let n = 0; n < seconds * 120; n++) {
    const i = emptyInput();
    tweak(i);
    t.input(dt, i);
  }
};
const press = (t: Tricks, tweak: (i: Frame) => void) => {
  const i = emptyInput();
  tweak(i);
  t.input(dt, i);
};
const rtB = (i: Frame) => {
  i.held.pumpGrind = 1;
  i.held.brakeBars = 1;
};

test("hand rules: No-hander frees both hands, the grabs free one, foot tricks keep both", () => {
  assert.equal(POSE_HANDS["No-hander"].bars, 0);
  assert.equal(POSE_HANDS["Clamp Grab"].bars, 1);
  assert.equal(POSE_HANDS["Toboggan"].reach, "rear-deck");
  assert.equal(POSE_HANDS["Can Can"].bars, 2);
  const idle = { whip: false, barspin: false, other: false };
  assert.ok(poseAllowed("No-hander", idle));
  assert.equal(poseAllowed("No-hander", { ...idle, whip: true }), false);
  assert.equal(poseAllowed("No-hander", { ...idle, barspin: true }), false);
  assert.ok(poseAllowed("Can Can", { ...idle, whip: true }), "a foot trick may ride along a whip");
});

test("No Hander waits during a Tailwhip and comes in once the deck is caught", () => {
  const t = air();
  t.deck.kick(1);
  // Y held through the whip: no No-hander while the deck spins.
  let sawPoseMidWhip = false;
  for (let n = 0; n < 240; n++) {
    const i = emptyInput();
    i.held.body = 1;
    t.input(dt, i);
    if (Math.abs(t.deck.velocity) > 1 && t.visualPose === "No-hander" && t.poseBlend > 0.05) sawPoseMidWhip = true;
  }
  assert.equal(sawPoseMidWhip, false, "hands stay on the bars while the deck is whipping");
  assert.equal(t.visualPose, "No-hander", "after the catch the No Hander comes in");
  assert.ok(t.poseBlend > 0.9);
});

test("No Hander waits during a Barspin", () => {
  const t = air();
  press(t, i => {
    i.pressed.brakeBars = true;
    i.held.brakeBars = 1;
  });
  let sawPoseMidSpin = false;
  for (let n = 0; n < 30; n++) {
    const i = emptyInput();
    i.held.body = 1;
    t.input(dt, i);
    if (Math.abs(t.bars.velocity) > 1 && t.poseBlend > 0.05) sawPoseMidSpin = true;
  }
  assert.equal(sawPoseMidSpin, false);
});

test("Body flip + No Hander still works (Y alone, no spin)", () => {
  const t = air();
  run(t, 0.4, i => {
    i.held.body = 1;
  });
  assert.equal(t.visualPose, "No-hander");
  assert.ok(t.poseBlend > 0.9);
});

for (const stance of ["regular", "goofy"] as const) {
  test(`Toboggan: RT + B held in the air, ${stance} stance; no barspin, named Toboggan`, () => {
    const t = air(stance);
    press(t, i => {
      rtB(i);
      i.pressed.brakeBars = true;
    });
    run(t, 0.5, rtB);
    assert.equal(t.visualPose, "Toboggan");
    assert.ok(t.poseBlend > 0.95);
    assert.equal(t.bars.target, 0, "RT + B does not spin the bars");
    assert.equal(t.finger, false, "and is not a finger whip");
    assert.ok(t.body.has("Toboggan"));
    // Released: the hand comes back.
    run(t, 0.5);
    assert.equal(t.poseBlend, 0);
  });

  test(`Bar Twist: RT + B with the stick pushed, ${stance} stance, one revolution caught`, () => {
    const t = air(stance);
    press(t, i => {
      rtB(i);
      i.pressed.brakeBars = true;
      i.steer = 1;
    });
    assert.ok(t.twisting && t.barTwist);
    // Let go of B: one revolution, then the catch.
    run(t, 0.8, i => {
      i.held.pumpGrind = 1;
    });
    assert.equal(Math.abs(t.bars.turns), 1);
    assert.equal(t.twisting, false, "caught");
    assert.notEqual(t.visualPose, "Toboggan", "a Bar Twist is not a Toboggan");
    assert.equal(t.attempt?.name, "Bar Twist");
  });
}

test("Bar Twist held continues into a Double through the resolver", () => {
  const t = air();
  press(t, i => {
    rtB(i);
    i.pressed.brakeBars = true;
    i.lean = -1;
  });
  // Hold RT + B + stick: the held bar channel re-kicks after its hold delay.
  let turns = 0;
  for (let n = 0; n < 240 && turns < 2; n++) {
    const i = emptyInput();
    rtB(i);
    i.lean = -1;
    t.input(dt, i);
    turns = Math.abs(t.bars.target) / (2 * Math.PI);
  }
  assert.ok(turns >= 2, `held into a second revolution (${turns})`);
  run(t, 1);
  assert.equal(t.attempt?.name, "Double Bar Twist");
});

test("Pro: plain B is still a Barspin; Arcade RT + B is unchanged (no Toboggan)", () => {
  const t = air();
  press(t, i => {
    i.held.brakeBars = 1;
    i.pressed.brakeBars = true;
  });
  run(t, 0.8);
  assert.equal(t.attempt?.name, "Barspin");
  const a = air("regular", "arcade");
  press(a, i => {
    rtB(i);
    i.pressed.brakeBars = true;
  });
  run(a, 0.4, rtB);
  assert.notEqual(a.visualPose, "Toboggan");
  assert.equal(a.barTwist, false);
});

test("#84 Toboggan held: LS then leans it (tweak) instead of dropping it for a Bar Twist", () => {
  const t = air("regular");
  press(t, i => {
    rtB(i);
    i.pressed.brakeBars = true;
  });
  run(t, 0.3, rtB);
  assert.equal(t.visualPose, "Toboggan");
  run(t, 0.6, i => {
    rtB(i);
    i.steer = 0.8;
    i.lean = -0.6;
  });
  assert.equal(t.visualPose, "Toboggan", "still the Toboggan with the stick pushed");
  assert.ok(t.poseBlend > 0.95);
  assert.equal(t.twisting, false, "no Bar Twist from a stick pushed after B");
  assert.equal(t.bars.target, 0);
  assert.ok(t.tweak.x > 0.7 && t.tweak.y < -0.5, `leans with the stick: ${JSON.stringify(t.tweak)}`);
  // Released: the lean eases back out with the pose.
  run(t, 1);
  assert.ok(Math.abs(t.tweak.x) < 0.01 && Math.abs(t.tweak.y) < 0.01);
});

test("#84 no pose held: LS never leans the body (tweak stays 0)", () => {
  const t = air("regular");
  run(t, 0.5, i => {
    i.steer = 1;
    i.lean = 1;
  });
  assert.equal(t.tweak.x, 0);
  assert.equal(t.tweak.y, 0);
});

test("#84 a longer hold scores more: holds are recorded per pose", async () => {
  const { trickValue, holdPoints } = await import("../src/tricks/score");
  const held = (seconds: number) => {
    const t = air("regular");
    press(t, i => {
      rtB(i);
      i.pressed.brakeBars = true;
    });
    run(t, seconds, rtB);
    return t.primitives();
  };
  const short = held(0.4), long = held(2);
  assert.ok(short.holds?.Toboggan! > 0.2 && long.holds?.Toboggan! > 1.8, JSON.stringify([short.holds, long.holds]));
  assert.ok(holdPoints(long) > holdPoints(short) + 200, `${holdPoints(short)} vs ${holdPoints(long)}`);
  assert.ok(trickValue(long) > trickValue(short));
  // Capped: a very long hold is not worth unlimited points.
  assert.equal(holdPoints(held(6)), holdPoints(held(3)));
  // A new air starts with no holds.
  const t = air("regular");
  assert.equal(t.primitives().holds, undefined);
});
