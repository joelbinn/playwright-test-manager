# Staging och granskning av agent-kodändringar före skrivning

Vi har beslutat att kod som genereras eller repareras av Generator- och Healer-agenterna inte ska skrivas direkt till disk utan först placeras i ett staging-tillstånd och visas som en visuell diff i gränssnittet. Användaren måste uttryckligen godkänna ändringen innan filen uppdateras på filsystemet. Detta ger en nödvändig mänsklig säkerhetsspärr (human-in-the-loop) mot hallucinationer och oavsiktliga destruktiva ändringar.
