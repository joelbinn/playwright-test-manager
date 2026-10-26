# Använd målarbetsytans filsystem som Source of Truth

Vi har valt att lagra Test Specs (som Markdown-filer) och Test Scripts (som Playwright `.spec.ts`-filer) direkt på filsystemet i det konfigurerade målarbetsområdet istället för i en separat databas. Detta säkerställer att testfall och specar omedelbart versionshanteras i användarens Git-repo, att agenterna kan läsa och skriva filerna direkt via ACP-verktyg, och att applikationen inte kräver någon databasmigrering eller separat lagringsskikt.
