# Selftest Agent

Background test agent for the MDC Class Changes (AddDropSwap) prototype.

- `selftest-agent.html`: the finished page (also published as a private Claude artifact). Open it in a browser, pick a scenario pack and settings, and launch.
- `src/core.js`: headless copy of the Class Changes rules, scenario packs, edge-case probes, plan builder and report builder.
- `src/ui.js`, `src/page.css`: the console page.
- `src/test_core.js`: run `node src/test_core.js` to run every pack headless (current build vs proposed fixes).

The agent tests a built-in copy of the Class Changes rules. If the prototype's rules change, update `core.js`.
Note: the Claude analysis and Save file buttons only work when the page is opened as a Claude artifact.

Other files
- `class-changes-page.html`: the MDC Class Changes prototype the agent tests (published version, no agent inside).
- `earlier-in-page-version/`: the first version, which drove the Class Changes page visibly with a cursor (`agent.js`, `agent.css`, and the page with it embedded). Kept for reference.
