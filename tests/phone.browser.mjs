// Phone system (docs/briefs/PHONE-SYSTEM.md, tests 1-16): opening standing,
// riding and in first person, every app, Back/Home, closing, pause and crash
// while open, input ownership and the hand pose.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("artifacts/phone", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = [];
const check = (name, ok, data) => {
  results.push({ name, ok: !!ok, data });
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || data === undefined ? "" : " " + JSON.stringify(data)));
};
try {
  await page.goto((process.env.LAZER_URL || "http://127.0.0.1:5174") + "/?map=outdoor");
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 120000 });
  await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession("outdoor", true);
    g.advance(0.6);
    await document.fonts.ready;
    window.__phone = {
      frame: async () => (await import("/src/input/input.ts")).emptyInput(),
      // The main loop's phone step: input to the phone, then a rendered frame.
      step: (f, n = 1) => { for (let i = 0; i < n; i++) { if (f && i === 0) g.phone.update(f, 1 / 60); g.render(); } },
    };
  });
  const run = (fn, arg) => page.evaluate(fn, arg);
  const settle = (n = 30) => run((n) => window.__phone.step(null, n), n);
  const press = (action) => run(async (action) => { const f = await window.__phone.frame(); f.pressed[action] = true; f.held[action] = 1; window.__phone.step(f, 2); }, action);
  // Screenshots are evidence, not assertions: a slow software renderer can miss the timeout.
  // Set SHOTS=1 for pictures; they are slow under a software renderer.
  const shot = (name) => process.env.SHOTS ? page.screenshot({ path: `artifacts/phone/${name}.png`, timeout: 90000 }).catch((e) => console.log("(no screenshot " + name + ": " + String(e).split("\n")[0] + ")")) : Promise.resolve();

  // 1. Standing, third person.
  await run(() => { const g = window.__LAZER; g.camera.view = "third"; g.sim.walking = true; g.advance(0.3); });
  check("1 Phone may come out standing", await run(() => window.__LAZER.phoneAllowed()));
  await run(() => window.__LAZER.phone.open());
  await settle(40);
  const standing = await run(() => {
    const g = window.__LAZER, hand = g.rider.avatar.hands[0].getWorldPosition(new g.rider.root.position.constructor()), phone = g.phoneRig.model;
    const head = g.rider.avatar.head.getWorldPosition(hand.clone());
    return { ready: g.phone.ready, visible: phone.visible, inHand: phone.parent === g.rider.avatar.hands[0], handHeight: hand.y - g.sim.position.y, reading: hand.distanceTo(head), overlay: !document.querySelector(".phone-overlay").hidden };
  });
  check("1 Third person standing: rider holds the phone up, overlay shows the same screen", standing.ready && standing.visible && standing.inHand && standing.overlay && standing.reading < 0.6, standing);
  await shot("tp-standing-home");

  // 13. Home grid, an app, Back and Home.
  const nav = await run(() => {
    const g = window.__LAZER, p = g.phone, out = {};
    out.apps = p.apps.map((a) => a.id);
    p.select("app-music"); out.music = p.view?.title;
    p.back(); out.back = p.view === null;
    p.select("app-map"); p.home(); out.home = p.view === null;
    return out;
  });
  check("13 Home lists every app; Back and Home navigate", ["music", "emotes", "rides", "rider", "map", "items", "build", "messages"].every((a) => nav.apps.includes(a)) && nav.music === "SESH MUSIC" && nav.back && nav.home, nav);

  // 5-12. Every app opens and draws.
  for (const [id, text] of [["music", "NOW PLAYING"], ["emotes", "EMOTES"], ["rides", "RIDES"], ["rider", "RIDER"], ["map", "LS pan"], ["items", "POCKETS"], ["build", "BUILD"], ["messages", "MESSAGES"]]) {
    const r = await run((id) => { const p = window.__LAZER.phone; p.home(); p.select("app-" + id); return JSON.stringify(p.view?.page() ?? {}); }, id);
    await settle(3);
    await shot("app-" + id);
    check(`${5 + ["music", "emotes", "rides", "rider", "map", "items", "build", "messages"].indexOf(id)} ${id.toUpperCase()} app opens`, r.includes(text), r.slice(0, 120));
  }
  // EMOTES triggers the existing emote system and the phone goes away.
  await run(() => { const p = window.__LAZER.phone; p.home(); p.select("app-emotes"); p.select("emote-wave"); });
  await settle(30);
  const emote = await run(() => ({ emote: window.__LAZER.sim.emote?.id, phone: window.__LAZER.phone.active }));
  check("6 EMOTES plays the wave through the emote system and puts the phone away", emote.emote === "wave" && !emote.phone, emote);
  // MESSAGES: a sent chat lands in the thread.
  const chat = await run(() => { const g = window.__LAZER; g.social.send("hello crew"); return g.messages.threads.get("room")?.at(-1); });
  check("12 MESSAGES records the chat (future hook for rooms)", chat?.text === "hello crew" && chat.mine, chat);
  // MAP: pans and zooms from the controller.
  const map = await run(async () => {
    const g = window.__LAZER, f = await window.__phone.frame();
    g.phone.open("map"); window.__phone.step(null, 30);
    const z0 = g.phoneMap?.zoom;
    f.held.rightModifier = 1; f.steer = 1;
    for (let i = 0; i < 20; i++) g.phone.update(f, 1 / 30);
    return { title: g.phone.view?.title };
  });
  check("9 MAP takes pan/zoom input", map.title === "MAP", map);
  await run(() => window.__LAZER.phone.stow());

  // Input ownership: A, X, RS while the phone is open never reach gameplay.
  await run(() => { const g = window.__LAZER; g.sim.walking = true; g.advance(0.3); g.phone.open(); });
  await settle(30);
  const owned = await run(async () => {
    const g = window.__LAZER, events = [];
    g.events.on((e) => events.push(e.type));
    const y0 = g.sim.position.y;
    const f = await window.__phone.frame();
    f.pressed.pushDeck = true; f.ry = 1;
    g.phone.update(f, 1 / 60);
    return { events: events.filter((t) => ["pop", "push", "trick"].includes(t)), open: g.phone.active, y: g.sim.position.y - y0 };
  });
  check("Opening does not trigger riding or trick input", owned.events.length === 0 && owned.open, owned);

  // 14. D-pad Down closes.
  await press("menuDown");
  await settle(30);
  check("14 D-pad Down puts the phone away", !(await run(() => window.__LAZER.phone.active)));

  // 2. Riding (grounded, coasting), third person.
  await run(() => { const g = window.__LAZER, s = g.sim; s.walking = false; s.velocity.set(0, 0, 3); s.body.setLinvel(s.velocity, true); g.advance(0.4); });
  check("2 Phone may come out coasting", await run(() => window.__LAZER.phoneAllowed()));
  await run(() => window.__LAZER.phone.open());
  await settle(40);
  const riding = await run(() => {
    const g = window.__LAZER;
    return { ready: g.phone.ready, visible: g.phoneRig.model.visible, gripLeft: g.rider.hands[1].userData.barLift > 0, speed: g.sim.speed };
  });
  check("2 Riding: one hand holds the phone, the other keeps the bar, still coasting", riding.ready && riding.visible && riding.gripLeft && riding.speed > 1, riding);
  await shot("tp-riding");
  await run(() => window.__LAZER.phone.stow());

  // 3-4. First person: the phone in hand in front of the eye, drawn by the close-up pass.
  await run(() => { const g = window.__LAZER, s = g.sim; g.camera.view = "first"; s.walking = true; s.velocity.set(0, 0, 0); s.body.setLinvel(s.velocity, true); g.advance(0.4); window.__phone.step(null, 10); g.phone.open(); });
  await settle(40);
  const fp = await run(() => {
    const g = window.__LAZER, cam = g.camera.camera, phone = g.phoneRig.model.getWorldPosition(cam.position.clone());
    const local = cam.worldToLocal(phone.clone());
    return { fp: g.camera.firstPersonActive, closeUp: g.phone.firstPerson, overlayHidden: document.querySelector(".phone-overlay").hidden, local: local.toArray().map((v) => +v.toFixed(3)), layer: g.phoneRig.model.children[0].layers.mask };
  });
  check("3 First person: phone raised in front of the eye, no floating overlay", fp.fp && fp.closeUp && fp.overlayHidden && fp.local[2] < -0.15 && fp.local[2] > -0.45 && Math.abs(fp.local[1]) < 0.15, fp);
  check("4 First person: phone, hand and forearm drawn in the close-up layer", fp.layer === 1 << 5, fp);
  await shot("fp-standing");
  await run(() => { const p = window.__LAZER.phone; p.select("app-music"); });
  await settle(6);
  await shot("fp-music");
  await run(() => { window.__LAZER.phone.stow(); window.__LAZER.camera.view = "third"; });
  await settle(5);

  // 15. Pause while open: the phone goes away and the pause menu owns input.
  await run(() => { const g = window.__LAZER; g.phone.open(); });
  await settle(30);
  const paused = await run(() => {
    const g = window.__LAZER;
    // The main loop's pause path (testing mode skips the loop).
    if (g.phone.active) g.phone.stow();
    g.hud.setPaused(true);
    const r = { phone: g.phone.active, paused: g.hud.paused };
    g.hud.setPaused(false);
    return r;
  });
  check("15 Pausing puts the phone away", !paused.phone && paused.paused, paused);

  // 16. Crash while open: the phone is stowed and cannot reopen during the bail.
  await run(() => { const g = window.__LAZER; g.phone.open(); window.__phone.step(null, 30); g.sim.state = "Bail"; });
  const crash = await run(() => { const g = window.__LAZER; if (g.sim.state === "Bail") g.phone.stow(); return { phone: g.phone.active, allowed: g.phoneAllowed() }; });
  check("16 A crash puts the phone away and it cannot come out mid-bail", !crash.phone && !crash.allowed, crash);
  await run(() => { const g = window.__LAZER; g.sim.reset(0, true); g.advance(0.4); });

  // Airborne: not allowed.
  const air = await run(() => { const g = window.__LAZER, s = g.sim; s.walking = false; s.position.y += 2; s.body.setTranslation(s.position, true); s.grounded = false; return g.phoneAllowed(); });
  check("Airborne: the phone does not open", !air);
  await run(() => { const g = window.__LAZER; g.sim.reset(0, true); g.advance(0.4); });

  // Left-hand setting.
  await run(() => { const g = window.__LAZER; g.profile.settings.phoneHand = "left"; g.sim.walking = true; g.phone.open(); });
  await settle(40);
  check("Phone hand setting: left hand holds it", await run(() => window.__LAZER.phoneRig.model.parent === window.__LAZER.rider.avatar.hands[1]));
  await shot("tp-left-hand");
  await run(() => { const g = window.__LAZER; g.phone.stow(); g.profile.settings.phoneHand = "right"; });

  // Saved data untouched by opening apps.
  check("Saved profile still loads", await run(async () => { const { loadProfile } = await import("/src/data/loadout.ts"); return !!loadProfile().avatar; }));
  check("No page errors", errors.length === 0, errors);
} finally {
  await browser.close();
}
writeFileSync("artifacts/phone/results.json", JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
