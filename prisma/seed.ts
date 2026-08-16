// Zet het team van Beerthuizen Management neer plus de standaard teamkanalen.
// Idempotent: opnieuw draaien werkt niets weg wat je in de UI hebt aangepast.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type AgentCategory } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type SeedAgent = {
  key: string;
  name: string;
  role: string;
  description: string;
  emoji: string;
  color: string;
  category: AgentCategory;
  isChief?: boolean;
};

const TEAM: SeedAgent[] = [
  {
    key: "chief",
    name: "Chief",
    role: "Centrale AI-manager",
    description:
      "Stuurt alle agents aan, bewaakt resultaten, maakt rapportages en communiceert met jou via Telegram.",
    emoji: "🧠",
    color: "#6366f1",
    category: "ops",
    isChief: true,
  },
  {
    key: "research",
    name: "Research Agent",
    role: "Onderzoek & marktverkenning",
    description:
      "Onderzoekt Nederlandse en internationale concurrenten, trends, tools, agencies en nieuwe kansen.",
    emoji: "🔎",
    color: "#0ea5e9",
    category: "research",
  },
  {
    key: "influencer",
    name: "Influencer Campaign Agent",
    role: "Influencer campagnes",
    description:
      "Ondersteunt bij influencer campagnes: planning, creators, campagnevoortgang, performance en optimalisatie.",
    emoji: "📣",
    color: "#ec4899",
    category: "marketing",
  },
  {
    key: "analytics",
    name: "Analytics Agent",
    role: "Data & KPI's",
    description:
      "Verzamelt en analyseert campagnegegevens en berekent KPI's zoals bereik, views, engagement, CPM, CPE, CPC, CPA en ROAS.",
    emoji: "📊",
    color: "#f59e0b",
    category: "analyse",
  },
  {
    key: "creative",
    name: "Creative Agent",
    role: "Concept & creatie",
    description: "Bedenkt campagnes, concepten, hooks, scripts, contentideeën en creatieve formats.",
    emoji: "🎨",
    color: "#a855f7",
    category: "content",
  },
  {
    key: "social",
    name: "Social Media Agent",
    role: "Social strategie",
    description:
      "Onderzoekt trends en helpt met social strategie, contentplanning, analyses en optimalisatie.",
    emoji: "📱",
    color: "#14b8a6",
    category: "marketing",
  },
  {
    key: "operations",
    name: "Operations Agent",
    role: "Processen & automatisering",
    description:
      "Zoekt naar handmatig werk en maakt voorstellen om interne processen te automatiseren en efficiënter te maken.",
    emoji: "⚙️",
    color: "#64748b",
    category: "ops",
  },
  {
    key: "bizdev",
    name: "Business Development Agent",
    role: "Groei & partnerships",
    description:
      "Onderzoekt potentiële klanten, partnerships, nieuwe diensten, markten en commerciële groeikansen.",
    emoji: "💼",
    color: "#22c55e",
    category: "bizdev",
  },
];

const CHANNELS = [
  { key: "algemeen", name: "Algemeen", purpose: "Teambreed overleg", sortOrder: 0 },
  { key: "campagnes", name: "Campagnes", purpose: "Lopende influencer- en adcampagnes", sortOrder: 1 },
  { key: "resultaten", name: "Resultaten", purpose: "Cijfers, KPI's en rapportages", sortOrder: 2 },
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

  for (const [index, agent] of TEAM.entries()) {
    await db.agent.upsert({
      where: { key: agent.key },
      update: {
        // Beschrijvende velden bijwerken, maar de koppeling en status die jij in
        // de UI hebt ingesteld met rust laten.
        name: agent.name,
        role: agent.role,
        description: agent.description,
        emoji: agent.emoji,
        color: agent.color,
        category: agent.category,
        isChief: agent.isChief ?? false,
        sortOrder: index,
      },
      create: { ...agent, sortOrder: index },
    });
  }
  console.log(`✓ ${TEAM.length} agents`);

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
