# Playwright Test Manager

Webbaserat gränssnitt och orkestreringslager för att planera, generera, köra och underhålla Playwright-tester med hjälp av Playwright Test Agents och Agent Client Protocol (ACP).

## Language

**Test Spec**:
Strukturerad beskrivning i Markdown av användarflöden och testscenarier som produceras av en Planner eller skrivs manuellt.
_Avoid_: Test plan, test prompt, spec sheet

**Test Script**:
Körbar Playwright-testkod (`.spec.ts` eller `.spec.js`) genererad utifrån en Test Spec.
_Avoid_: Test case, kodfil, automation script

**Planner**:
Agentroll som utforskar applikationen och genererar strukturerade Test Specs baserat på användarprompts eller krav.
_Avoid_: Test designer, spec creator

**Generator**:
Agentroll som transformerar en Test Spec till exekverbara Test Scripts och verifierar dem mot applikationen.
_Avoid_: Code generator, test builder

**Healer**:
Agentroll som analyserar misslyckade testkörningar, traces och DOM-snapshots för att reparera trasiga Test Scripts.
_Avoid_: Test fixer, auto-repairer

**ACP Agent**:
En extern eller subprocess-baserad AI-kodningsagent som kommunicerar via Agent Client Protocol (JSON-RPC) för att utföra agentroller och verktygsanrop.
_Avoid_: LLM, bot, AI model

**Seed Test**:
Ett initialt Playwright-testskript (`seed.spec.ts`) som förbereder applikationens tillstånd (t.ex. inloggning och grunddata) och navigerar till startpunkten som Planner och Generator utgår från.
_Avoid_: Setup script, bootstrap test

**Trace**:
Playwrights detaljerade logg över en testkörning (DOM-snapshots, konsolloggar, nätverksanrop) som används vid felsökning och som indata till Healer.
_Avoid_: Execution log, error dump

**Staged Diff**:
Ett temporärt representationstillstånd i gränssnittet för kod genererad av en agent innan användaren uttryckligen godkänner att den skrivs till filsystemet.
_Avoid_: Draft, proposed code

**Headed Mode**:
Körningsläge där Playwright öppnar ett synligt webbläsarfönster på skärmen under testexekvering.
_Avoid_: GUI mode, visual run

**Headless Mode**:
Körningsläge där webbläsaren exekveras i bakgrunden utan grafiskt gränssnitt för snabbare exekvering.
_Avoid_: Silent mode, background run

**Mock Agent**:
En inbyggd simulerad agentimplementation för utveckling, testning och demonstration av applikationen utan beroende av externa ACP-agenter eller API-nycklar.
_Avoid_: Dummy bot, fake agent

**Trace Server**:
En lokal instans av Playwrights Trace Viewer som serveras av backend för direkt inbäddning och inspektion av testspår i gränssnittet.
_Avoid_: Log viewer, report server
