import * as THREE from "three";
import type { Simulation } from "../physics/simulation";
import type { InputFrame } from "../input/input";
import { OUTDOOR, terrainHeight } from "../park/park";
import { modules, rampLips } from "../park/outdoor";
import { clamp, damp, wrap } from "../core/config";
import { GROUPS } from "../physics/groups";

/** A stable coping balance point, followed by a short continuous tipping phase.
 * No launch velocity is assigned: normal riding gravity accelerates the release. */
export class DropIn {
  phase: "ready" | "commit" | null = null;
  lean = 0;
  time = 0;
  lip = 0;
  direction = 1;
  height = 0;
  origin = new THREE.Vector3();
  reset() {
    this.phase = null;
    this.lean = 0;
    this.time = 0;
  }
  setup(s: Simulation) {
    const edges = OUTDOOR
      ? modules
          .filter((m) => m.kind === "quarter")
          .map((m) => ({
            x0: m.x0,
            x1: m.x1,
            lip: rampLips(m)[0],
            height: m.h,
            direction: m.reverse ? 1 : -1,
          }))
      : [-1, 1].map((sign) => ({
          x0: -30,
          x1: 30,
          lip: sign * 38.8,
          height: terrainHeight(0, sign * 38.8),
          direction: -sign,
        }));
    const edge = edges.find(
      (e) =>
        s.position.x > e.x0 + 0.5 &&
        s.position.x < e.x1 - 0.5 &&
        Math.abs(s.position.z - e.lip) < 0.85 &&
        s.position.y > e.height + 0.05,
    );
    if (!edge) return false;
    if (Math.abs(wrap(s.yaw - (edge.direction === 1 ? 0 : Math.PI))) > 0.7) {
      s.events.emit({
        type: "marker",
        message: "FACE THE TRANSITION",
        progress: 0,
      });
      return true;
    }
    this.origin.copy(s.position);
    this.lip = edge.lip;
    this.direction = edge.direction;
    this.height = edge.height;
    this.phase = "ready";
    this.lean = 0;
    this.time = 0;
    s.running = false;
    s.walking = false;
    s.position.z = edge.lip - edge.direction * 0.12;
    s.position.y = edge.height + 0.22;
    s.body.setTranslation(s.position, true);
    s.previousPosition.copy(s.position);
    s.velocity.set(0, 0, 0);
    s.state = "DropInReady";
    s.grounded = true;
    s.events.emit({
      type: "marker",
      message: "LEAN FORWARD TO DROP IN / B TO CANCEL",
      progress: 0,
    });
    return true;
  }
  step(s: Simulation, dt: number, input: InputFrame) {
    if (!this.phase) return false;
    s.body.collider(0).setCollisionGroups(GROUPS.chassisSurfaceOnly);
    s.railGuard.setSensor(true);
    if (this.phase === "ready") {
      if (input.pressed.brakeBars) {
        s.position.copy(this.origin);
        s.walking = true;
        s.state = "Walking";
        this.reset();
      } else {
        this.lean = damp(this.lean, clamp(-input.lean, 0, 1), 7, dt);
        s.pitch = this.lean * 0.5;
        s.state = "DropInReady";
        if (this.lean > 0.7) {
          this.phase = "commit";
          this.time = 0;
          s.state = "DropInCommit";
        }
      }
    } else {
      this.time += dt;
      const t = clamp(this.time / 0.38, 0, 1),
        smooth = t * t * (3 - 2 * t);
      s.position.z = this.lip + this.direction * (-0.12 + 0.32 * smooth);
      const floor = terrainHeight(s.position.x, s.position.z);
      s.position.y = this.height + 0.22 + (floor - this.height) * smooth;
      s.pitch = damp(s.pitch, 0.95, 10, dt);
      if (t === 1) {
        this.reset();
        s.grounded = true;
        s.state = "Grounded";
        s.lipClearTimer = 0.35;
        s.normal.set(0, 1, 0);
      }
    }
    s.velocity.set(0, 0, 0);
    s.body.setTranslation(s.position, true);
    s.body.setLinvel(s.velocity, true);
    s.previousPosition.copy(s.position);
    return true;
  }
}
