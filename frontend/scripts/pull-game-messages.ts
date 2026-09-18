import { SUPPORTED_LANGS } from "../lib/languages.ts";
import fs from "node:fs";
import path from "node:path";

(async () => {
  for (const locale of ["eng", ...SUPPORTED_LANGS]) {
    const messages = (
      await import(path.join("../../data/", locale, "messages.json"), {
        with: { type: "json" },
      })
    ).default;
    const betaMessages = (
      await import(
        path.join("../../data-beta/latest", locale, "messages.json"),
        { with: { type: "json" } }
      )
    ).default;
    if (!fs.existsSync("./i18n/game")) {
      fs.mkdirSync("./i18n/game");
    }
    fs.writeFileSync(
      path.join("./i18n/game", `${locale}.json`),
      JSON.stringify(
        {
          main: messages,
          beta: betaMessages,
        },
        undefined,
        2,
      ),
    );
  }
})();
