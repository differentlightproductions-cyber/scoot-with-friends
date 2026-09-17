import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await b.newPage();
page.on("pageerror", (e) => console.error(e));
try {
  await page.goto("http://127.0.0.1:5174/?map=outdoor");
  await page.waitForFunction(() => window.__LAZER);
  console.log(
    await page.evaluate(async () => {
      const g = window.__LAZER;
      g.testing(true);
      const results = [];
      const a = (t, f = {}) => g.advance(t, f, false);
      const check = (n, v) => {
        if (!v) throw Error(n + JSON.stringify(g.snapshot()));
        results.push(n);
      };
      const place = (x = 20, z = 12) => {
        g.sim.reset(0, true);
        a(0.2);
        const s = g.sim;
        s.position.set(x, 0.22, z);
        s.body.setTranslation(s.position, true);
        s.previousPosition.copy(s.position);
        s.normal.set(0, 1, 0);
        s.grounded = true;
        g.events.history.length = 0;
        return s;
      };
      let s = place();
      for (let i = 0; i <= 24; i++) {
        const angle = Math.PI / 2 + (i * Math.PI * 2) / 24;
        a(0.012, { rx: Math.cos(angle), ry: Math.sin(angle) });
      }
      check("Quick grounded Bri", s.tricks.bri.target > 6 && !s.grounded);
      s = place();
      a(0.35, { ry: 1 });
      const charge = s.preload.amount;
      for (let i = 0; i <= 24; i++) {
        const angle = Math.PI / 2 - (i * Math.PI * 2) / 24;
        a(0.012, { rx: Math.cos(angle), ry: Math.sin(angle) });
      }
      check("Loaded inward takeoff", s.tricks.bri.target < -6 && charge > 0.6);
      check(
        "Single pop",
        g.events.history.filter((e) => e.type === "pop").length === 1,
      );
      s = place();
      a(0.0084, { pressed: { pushDeck: true }, held: { pushDeck: 1 } });
      check("Normal preset X tailwhip takeoff", s.tricks.deck.target > 6 && !s.grounded);
      s = place();
      s.tricks.controlStyle = "arcade";
      a(0.0084, { pressed: { hop: true }, held: { hop: 1 } });
      check("Arcade A plain hop", !s.grounded && s.tricks.deck.target === 0);
      a(0.0084, { pressed: { brakeBars: true }, held: { brakeBars: 1 } });
      check("Arcade B whip", s.tricks.deck.target > 6);
      a(0.0084, { pressed: { pushDeck: true }, held: { pushDeck: 1 } });
      check("Arcade X barspin", s.tricks.bars.target > 6);
      s = place();
      s.bail("test crash");
      a(2.2);
      check(
        "Crash local recovery",
        s.walking &&
          Math.abs(s.position.x - 20) < 3 &&
          Math.abs(s.position.z - 12) < 3,
      );
      s = place(-85, 5);
      a(0.1);
      s.position.set(-97, 0.1, 5);
      s.body.setTranslation(s.position, true);
      a(0.1);
      check("Water splash and bail", s.waterBail && s.state === "Bail");
      a(1.3);
      check(
        "Water returns to shore",
        !s.waterBail && s.walking && s.position.x > -88,
      );
      return results;
    }),
  );
} finally {
  await b.close();
}
