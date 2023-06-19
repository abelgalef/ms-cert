import puppeteer from "puppeteer";
import cliProgress from "cli-progress";
import pLimit from "p-limit";

const page1 =
  "https://learn.microsoft.com/en-us/training/challenges?id=12f32cf8-2cd8-42e1-97dd-001b4a042766&WT.mc_id=cloudskillschallenge_12f32cf8-2cd8-42e1-97dd-001b4a042766&ocid=cloudskillschallenge_build23_email_cnl";

const page2 =
  "https://learn.microsoft.com/en-us/users/cloudskillschallenge/collections/e6kjawo10x63?WT.mc_id=cloudskillschallenge_12f32cf8-2cd8-42e1-97dd-001b4a042766";

const browser = await puppeteer.launch({
  headless: false,
  defaultViewport: null,
  userDataDir: "./user_data",
  timeout: 0,
});

const multiBar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format:
      "Progress {bar} | {percentage}% | {desc} {value}/{total} | {duration}s | {name}",
  },
  cliProgress.Presets.shades_classic
);

let page = await browser.newPage();

// CHECK IF USER IS SIGNED IN IF NOT PROMPT FOR A SIGN IN
await page.goto(page1, { waitUntil: "domcontentloaded", timeout: 0 });

const keypress = async () => {
  process.stdin.setRawMode(true);
  return new Promise((resolve) =>
    process.stdin.once("data", (data) => {
      const byteArray = [...data];
      if (byteArray.length > 0 && byteArray[0] === 3) {
        console.log("^C");
        process.exit(1);
      }
      process.stdin.setRawMode(false);
      resolve();
    })
  );
};

console.log("waiting for content to load");
await page.waitForTimeout(5000);

async function checkSignIn() {
  const isSignedIn = await page.evaluate(() => {
    if (document.getElementsByClassName("docs-sign-in").length > 1) {
      document.getElementsByClassName("docs-sign-in")[1].click();
      return false;
    }

    let host = window.location.host;
    let subdomain = host.split(".")[0];

    if (subdomain == "login") {
      return false;
    }

    return true;
  });
  return isSignedIn;
}

await (async () => {
  let isSignedIn = await checkSignIn();
  //   console.log(isSignedIn);
  while (!isSignedIn) {
    console.log("sign in and press any key to continue");
    await keypress();
    isSignedIn = await checkSignIn();
  }
})();

await page.goto(page2, { waitUntil: "domcontentloaded", timeout: 0 });
console.log("waiting for content to load");
await page.waitForTimeout(5000);

// COLLECT MODULES
const modules = await page.evaluate(() => {
  let container = document.getElementById("items-list");
  let modules = [];

  for (let i = 0; i < container.children.length; i++) {
    // JUMP COMPLETED MODULES
    if (container.children[i].children[0].children.length > 1) {
      let perc =
        container.children[i].children[0].children[1].children[0].children[1]
          .children[0].innerText;
      if (perc == "100%") {
        continue;
      }
    }

    modules.push({
      link: container.children[i].children[0].children[0].children[1].href,
      name: container.children[i].children[0].children[0].children[1]
        .children[0].innerText,
    });
  }
  return modules;
});

// console.log(modules);
let moduleBar = multiBar.create(modules.length, 0, {
  desc: "Module",
  name: " ",
});

const limit = pLimit(5);
const input = modules.map((module) => limit(() => completeModule(module)));

(async function () {
  let finished = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    if (!(limit.pendingCount == modules.length - finished)) {
      finished = modules.length - limit.pendingCount;
      moduleBar.update(finished);
    }
  }
})();

Promise.all(input)
  .then(() => {
    multiBar.stop();
    browser.close();
  })
  .catch((err) => {
    console.log(err);
    multiBar.stop();
    browser.close();
  });

async function completeModule(module) {
  let page = await browser.newPage();
  await page.goto(module.link, { waitUntil: "domcontentloaded", timeout: 0 });

  (async function () {
    while (true) {
      await page.bringToFront().catch(() => {});
      await new Promise((r) => setTimeout(r, 5000));
    }
  })();

  await page.waitForTimeout(10000);
  await page.click("#start-unit");
  await page.waitForTimeout(10000);

  let { curr, total } = await page.evaluate(() => {
    let raw = document.getElementById("unit-place").innerText;
    let unis = raw.split(" ");
    return { curr: unis[1], total: unis[3] };
  });

  let unitBar = multiBar.create(total, curr, {
    desc: "Unit",
    name: module.name,
  });

  for (let i = parseInt(curr); i < total; i++) {
    // HANDLE QUESTIONS
    await page.evaluate(async () => {
      if (document.getElementsByClassName("quiz-choice").length > 0) {
        for (
          let j = 0;
          j < document.getElementsByClassName("quiz-question").length;
          j++
        ) {
          await document.getElementById("quiz-choice-" + j + "-0").click();
        }

        document.getElementsByClassName("quiz-form")[0].children[1].click();
        await new Promise((r) => setTimeout(r, 10000));
        document.getElementsByClassName("modal-close")[0].click();
      }
    });

    await page.click("#next-unit-link");
    unitBar.increment();
    await page.waitForTimeout(5000);
  }
  unitBar.increment();
  unitBar.stop();
  page.close();
}
