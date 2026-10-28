# 11: Loggning av inkommande och utgående ACP-meddelanden

**What to build:** Fullständig loggning av JSON-RPC-meddelanden som skickas till och tas emot från ACP-agenter över stdio via `acp`-child-loggern på `debug`-nivå. Utgående meddelanden (anrop, notiser och svar på behörighets-/filsystemsförfrågningar) loggas med riktning, metod, id och nyttolast innan de skrivs till processens stdin. Inkommande meddelanden (svar, agentförfrågningar och session/update-notiser) loggas när rader läses från stdout, med felhantering och loggning för eventuellt ogiltiga JSON-RPC-rader.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Logga alla utgående JSON-RPC-meddelanden i `AcpClient` (requests, notifications, responses) via ACP-loggern på `debug`-nivå med riktningsattribut (`outgoing`), metod/id och payload
- [x] Logga alla inkommande JSON-RPC-meddelanden i `AcpClient` från agentens stdout (både under anslutningskontroll/probe och uppgiftsströmning) via ACP-loggern på `debug`-nivå med riktningsattribut (`incoming`), metod/id och payload
- [x] Fånga och logga eventuella icke-JSON eller ogiltiga rader från agentens stdout som varnings- eller felsignaler i ACP-loggern
- [x] Skriva enhetstester i `tests/unit/acp-client.test.ts` som verifierar att utgående och inkommande meddelanden fångas i logger-strömmen vid `debug`-nivå och filtreras bort vid `info`-nivå
