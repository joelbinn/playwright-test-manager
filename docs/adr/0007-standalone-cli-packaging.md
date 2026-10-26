# Fristående CLI-paketering med inbäddad UI-server

Vi har valt att paketera applikationen som ett enhetligt CLI-verktyg (`npx playwright-test-manager [path]`). Node-backendprocessen startar en lokal webbserver som både hanterar API/ACP/Playwright-orkestrering och levererar den förbyggda SPA-frontendklienten på en lokal port. Detta eliminerar behovet av en separat produktionsinfrastruktur eller flera bakgrundsprocesser för slutanvändaren.
