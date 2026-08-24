// Zet het team van Beerthuizen Management neer plus de standaard teamkanalen.
// Idempotent: opnieuw draaien werkt niets weg wat je in de UI hebt aangepast.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { AGENT_PROFILES, DEFAULT_COMPANY_CONTEXT } from "../src/lib/ai/profiles";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CHANNELS = [
  { key: "algemeen", name: "Algemeen", purpose: "Teambreed overleg", sortOrder: 0 },
  { key: "vragen", name: "Vragen", purpose: "Wat het team aan jou wil weten", sortOrder: 1 },
  { key: "campagnes", name: "Campagnes", purpose: "Lopende influencer- en adcampagnes", sortOrder: 2 },
  { key: "resultaten", name: "Resultaten", purpose: "Cijfers, KPI's en rapportages", sortOrder: 3 },
];

async function main() {
  const email = process.env.SEED_EMAIL ?? "info@bhmanagement.nl";
  const password = process.env.SEED_PASSWORD;

  if (!password) {
    // Bewust geen standaardwachtwoord in de broncode: dat zou meeverhuizen naar
    // productie en daar jarenlang blijven staan.
    throw new Error(
      "Zet SEED_PASSWORD als je een nieuw eigenaarsaccount wilt aanmaken.\n" +
        "Bijvoorbeeld: SEED_PASSWORD='...' npm run db:seed",
    );
  }

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Beerthuizen",
      passwordHash: await bcrypt.hash(password, 12),
      role: "owner",
    },
  });
  console.log(`✓ gebruiker ${user.email}`);

  // Welke agent als eerste mag draaien. De rest staat op pauze tot de proef
  // geslaagd is, zodat er niet per ongeluk acht agents tegelijk gaan denken.
  const testAgentKey = process.env.SEED_TEST_AGENT ?? "research";

  for (const [index, profile] of AGENT_PROFILES.entries()) {
    const { key, isChief, ...rest } = profile;
    await db.agent.upsert({
      where: { key },
      update: {
        // Beschrijvende velden en het profiel bijwerken; wat jij in de UI hebt
        // ingesteld aan model en koppeling blijft staan.
        ...rest,
        isChief: isChief ?? false,
        sortOrder: index,
      },
      create: {
        key,
        ...rest,
        isChief: isChief ?? false,
        sortOrder: index,
        adapterType: "builtin",
        paused: key !== testAgentKey,
      },
    });
  }
  console.log(`✓ ${AGENT_PROFILES.length} agents (${testAgentKey} staat aan, de rest op pauze)`);

  await db.setting.upsert({
    where: { key: "company_context" },
    update: {},
    create: { key: "company_context", value: { text: DEFAULT_COMPANY_CONTEXT } },
  });

  for (const channel of CHANNELS) {
    await db.channel.upsert({
      where: { key: channel.key },
      update: { name: channel.name, purpose: channel.purpose, sortOrder: channel.sortOrder },
      create: { ...channel, kind: "team" },
    });
  }

  // Elke agent krijgt een eigen DM-kanaal, zodat je hem los kunt aanspreken.
  for (const agent of await db.agent.findMany()) {
    await db.channel.upsert({
      where: { agentId: agent.id },
      update: { name: agent.name },
      create: {
        key: `dm-${agent.key}`,
        name: agent.name,
        kind: "dm",
        agentId: agent.id,
        purpose: `Rechtstreeks gesprek met ${agent.name}`,
      },
    });
  }
  console.log(`✓ ${CHANNELS.length} teamkanalen + DM's`);

  await db.setting.upsert({
    where: { key: "standup" },
    update: {},
    create: {
      key: "standup",
      value: {
        enabled: true,
        // 08:00 de leesbare briefing, 09:45 de uitvraag voor de call van 10:00.
        time: "08:00",
        callPrepTime: "09:45",
        callTime: "10:00",
        timezone: "Europe/Amsterdam",
      },
    },
  });

  await db.setting.upsert({
    where: { key: "alerts" },
    update: {},
    create: { key: "alerts", value: { inApp: true, telegram: true, email: false } },
  });

  console.log(`\nKlaar. Inloggen kan met ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
