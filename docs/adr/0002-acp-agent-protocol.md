# Agent Client Protocol (ACP) över stdio som agentabstraktion

Vi har valt att integrera AI-förmågor via Agent Client Protocol (ACP) över stdio (subprocesser) snarare än direkta SDK-kopplingar till specifika LLM-leverantörer. Detta frikopplar backend från specifika modeller, tillåter användaren att konfigurera valfri ACP-kompatibel kodningsagent (såsom Claude Code eller andra ACP-servrar), och nyttjar standardiserade JSON-RPC-mekanismer för strömning, verktygsgodkännanden och filoperationer.
