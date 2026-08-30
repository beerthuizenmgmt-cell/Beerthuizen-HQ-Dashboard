-- De sleutels van het bureau per koppeling.
--
-- Een API-sleutel is iets van het bureau: je hebt één abonnement bij Tavily,
-- niet één per agent. Hem per agent moeten intikken is werk dat niets oplevert
-- en een plek waar er eentje verkeerd gaat.
ALTER TABLE "ToolIntegration" ADD COLUMN "config" JSONB;
