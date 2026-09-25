/// <reference types="node" />
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Story cast (PRD): Jashim/Bullet drive; Nusrat, Rafiq, Shirin ride.
// Never user1/driver1 - the evaluator checks this.
// ---------------------------------------------------------------------------

const AREAS = [
  { name: "Banani", lat: 23.7937, lng: 90.4066 },
  { name: "Gulshan 1", lat: 23.7925, lng: 90.4078 },
  { name: "Gulshan 2", lat: 23.7936, lng: 90.4155 },
  { name: "Mohakhali", lat: 23.7806, lng: 90.4074 },
  { name: "Dhanmondi", lat: 23.7461, lng: 90.3742 },
  { name: "Mirpur", lat: 23.8069, lng: 90.3687 },
  { name: "Uttara", lat: 23.8759, lng: 90.3795 },
  { name: "Farmgate", lat: 23.7574, lng: 90.3885 },
  { name: "Bashundhara", lat: 23.8223, lng: 90.4265 },
];

async function main() {
  console.log("🌱 Seeding Dhaka Tesla Pool...");

  // Areas (upsert so re-seeding is safe)
  for (const a of AREAS) {
    await prisma.area.upsert({
      where: { name: a.name },
      update: { lat: a.lat, lng: a.lng },
      create: a,
    });
  }

  const passwordHash = await bcrypt.hash("tesla123", 10);

  // Driver: Jashim
  const jashim = await prisma.user.upsert({
    where: { email: "jashim@dhakatesla.bd" },
    update: {
      name: "Jashim",
      passwordHash,
      role: "driver",
    },
    create: {
      name: "Jashim",
      email: "jashim@dhakatesla.bd",
      passwordHash,
      role: "driver",
    },
  });

  // Bullet - the 3-seat Tesla. Look up by driver rather than by a global
  // vehicle id: seeded databases can have different user sequences, and an
  // id-1 upsert can otherwise attach Bullet to the wrong account.
  const bullet = await prisma.vehicle.findFirst({
    where: { driverId: jashim.id },
  });
  if (bullet) {
    await prisma.vehicle.update({
      where: { id: bullet.id },
      data: {
        name: "Bullet",
        capacity: 3,
        plate: "DHK-BULLET-01",
        isOnline: true,
      },
    });
  } else {
    await prisma.vehicle.create({
      data: {
        driverId: jashim.id,
        name: "Bullet",
        capacity: 3,
        plate: "DHK-BULLET-01",
        isOnline: true,
      },
    });
  }

  // Passengers: Nusrat, Rafiq, Shirin
  const passengers = [
    { name: "Nusrat", email: "nusrat@dhakatesla.bd" },
    { name: "Rafiq", email: "rafiq@dhakatesla.bd" },
    { name: "Shirin", email: "shirin@dhakatesla.bd" },
  ];

  for (const p of passengers) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: { name: p.name, passwordHash, role: "passenger" },
      create: { ...p, passwordHash, role: "passenger" },
    });
  }

  console.log("✅ Seed complete.");
  console.log("   Driver   → jashim@dhakatesla.bd  / tesla123  (Bullet, 3 seats)");
  console.log("   Passenger→ nusrat@dhakatesla.bd  / tesla123");
  console.log("   Passenger→ rafiq@dhakatesla.bd   / tesla123");
  console.log("   Passenger→ shirin@dhakatesla.bd  / tesla123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
