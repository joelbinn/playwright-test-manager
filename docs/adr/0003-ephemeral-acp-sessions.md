# Isolerade (ephemeral) ACP-sessioner per agentuppdrag

Vi har valt att starta en ny, ren ACP-session för varje agentåtgärd (Planner, Generator, Healer) snarare än att återanvända en långlivad, kontinuerlig chatt-session. Detta förhindrar kontextläckage, minimerar tokengränser och kostnad, och säkerställer att varje agentroll förses med en skarp, ren prompt tillsammans med endast de specifika artefakter (t.ex. spec, trace, DOM-logg) som krävs för den aktuella uppgiften.
